import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Multi-stage runner for the composite gates (`gate`, `check-types`).
 *
 * These used to be `&&`-joined shell strings, which meant the FIRST failing
 * stage hid every stage after it: a `check-game-shape` rejection short-circuited
 * the chain before `check-types-all` ever ran, so a red tree looked like one
 * problem when it was three. Agents then fixed one, re-ran the ~15-minute gate,
 * and found the next one — serially.
 *
 * Here every stage runs unless a stage it explicitly `needs` failed, and the run
 * ends with one consolidated verdict listing all failures. A skipped stage is
 * reported as skipped, never as passing — an unrun check must not read as green.
 */
export interface Stage {
  /** Stage id; also the `bun run <name>` re-run hint when it is a package script. */
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  /**
   * Stage ids whose success this stage's result depends on. A stage whose
   * prerequisite failed is skipped, because running it would only produce
   * derivative noise (type errors from a dist that never got built).
   */
  readonly needs?: readonly string[];
  /** Shown in the summary when the stage is not a plain `bun run <name>`. */
  readonly rerun?: string;
}

const bun = (...args: string[]): { command: string; args: string[] } => ({ command: "bun", args });

/**
 * `check-types` fans out over independent validators. None of them consumes
 * another's output, so a failure in any one must not hide the rest — they all
 * hang off `ensure-ready` alone.
 */
const CHECK_TYPES_STAGES: readonly Stage[] = [
  { name: "ensure-ready", ...bun("scripts/ensure-ready.ts"), rerun: "bun scripts/ensure-ready.ts" },
  ...[
    "check-artifacts",
    "check-skills",
    "check-skill-api",
    "check-orphan-ratchet",
    "check-capabilities",
    "check-game-shape",
    "check-content-gate",
    "check-asset-availability",
    "check-pack-texture-layout",
    "check-recipes",
    "check-doc-symbols",
  ].map((name): Stage => ({ name, ...bun("run", name), needs: ["ensure-ready"] })),
  {
    name: "check-types-all",
    ...bun("scripts/check-types-all.ts"),
    needs: ["ensure-ready"],
    rerun: "bun scripts/check-types-all.ts",
  },
];

/**
 * `gate` is the full local verdict. Preflight keeps its old first slot — it is
 * seconds of work and catches lockfile drift before anything expensive — but it
 * no longer gates the rest, so a stale `bun.lock` stops costing a second full
 * gate run to discover the type error underneath it. Only the stages that read
 * built package dist depend on `build`.
 */
const GATE_STAGES: readonly Stage[] = [
  { name: "agent:preflight", ...bun("run", "agent:preflight") },
  { name: "build", ...bun("run", "build") },
  { name: "check-types", ...bun("run", "check-types"), needs: ["build"] },
  { name: "test:all", ...bun("run", "test:all"), needs: ["build"] },
];

export const PLANS: Readonly<Record<string, readonly Stage[]>> = {
  gate: GATE_STAGES,
  "check-types": CHECK_TYPES_STAGES,
};

export type StageState = "passed" | "failed" | "skipped";

export interface StageResult {
  readonly name: string;
  readonly state: StageState;
  /** For a skipped stage, the already-failed prerequisites that caused the skip. */
  readonly blockedBy?: readonly string[];
}

/**
 * Decide each stage's fate in order, given a runner that reports pass/fail.
 * Pure over `run` so the skip/continue policy is testable without spawning.
 */
export function runPlan(stages: readonly Stage[], run: (stage: Stage) => boolean): StageResult[] {
  const results: StageResult[] = [];
  const failed = new Set<string>();
  for (const stage of stages) {
    const blockedBy = (stage.needs ?? []).filter((need) => failed.has(need));
    if (blockedBy.length > 0) {
      // Propagate: anything needing a skipped stage is itself unverified.
      failed.add(stage.name);
      results.push({ name: stage.name, state: "skipped", blockedBy });
      continue;
    }
    const ok = run(stage);
    if (!ok) failed.add(stage.name);
    results.push({ name: stage.name, state: ok ? "passed" : "failed" });
  }
  return results;
}

export function rerunHint(stages: readonly Stage[], name: string): string {
  const stage = stages.find((candidate) => candidate.name === name);
  return stage?.rerun ?? `bun run ${name}`;
}

export function formatSummary(plan: string, stages: readonly Stage[], results: readonly StageResult[]): string {
  const mark: Record<StageState, string> = { passed: "PASS", failed: "FAIL", skipped: "SKIP" };
  const width = Math.max(...results.map((result) => result.name.length));
  const lines = [`\n${plan} summary`];
  for (const result of results) {
    const suffix =
      result.state === "skipped" ? `  (not run — ${(result.blockedBy ?? []).join(", ")} failed)` : "";
    lines.push(`  ${mark[result.state]}  ${result.name.padEnd(width)}${suffix}`);
  }
  const failures = results.filter((result) => result.state === "failed");
  const skipped = results.filter((result) => result.state === "skipped");
  if (failures.length === 0 && skipped.length === 0) {
    lines.push(`\n${plan} ok — ${results.length} stages passed`);
    return lines.join("\n");
  }
  const counts = [`${failures.length} failed`];
  if (skipped.length > 0) counts.push(`${skipped.length} not run`);
  lines.push(`\n${plan} failed — ${counts.join(", ")} of ${results.length} stages`);
  if (failures.length > 0) {
    lines.push("re-run individually:");
    for (const failure of failures) lines.push(`  ${rerunHint(stages, failure.name)}`);
  }
  if (skipped.length > 0) {
    lines.push("these never ran and are NOT known-good — re-run the plan once the failures above are fixed.");
  }
  return lines.join("\n");
}

if (import.meta.main) {
  const plan = process.argv[2];
  const stages = plan === undefined ? undefined : PLANS[plan];
  if (stages === undefined) {
    console.error(`usage: bun scripts/run-stages.ts <${Object.keys(PLANS).join("|")}>`);
    process.exit(2);
  }

  const root = fileURLToPath(new URL("..", import.meta.url));
  const results = runPlan(stages, (stage) => {
    console.log(`\n--- ${plan} › ${stage.name}`);
    const result = spawnSync(stage.command, [...stage.args], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    if (result.error !== undefined) {
      console.error(`${stage.name}: failed to spawn — ${result.error.message}`);
      return false;
    }
    return result.status === 0;
  });

  console.log(formatSummary(plan as string, stages, results));
  process.exit(results.every((result) => result.state === "passed") ? 0 : 1);
}
