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
  /**
   * The command that *resolves* this failure, when re-running the check is not the fix. A drifted
   * generated artifact is the case that matters: re-running `check-capabilities` proves the drift
   * again, it does not regenerate anything.
   */
  readonly fix?: string;
}

const bun = (...args: string[]): { command: string; args: string[] } => ({ command: "bun", args });

/**
 * Checks whose failure means "a committed artifact drifted from its generator", not "your code is
 * wrong". These are the ones that cost repeated round trips when the message only says what failed.
 */
const GENERATED_ARTIFACT_CHECKS = new Set(["check-skill-api", "check-capabilities", "check-artifacts"]);

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
    "check-stateful-ratchet",
    "check-module-globals",
    "check-game-determinism",
    "check-game-front-end",
    "check-game-feel",
    "check-art-direction",
    "check-capabilities",
    "check-game-shape",
    "check-content-gate",
    "check-asset-availability",
    "check-pack-texture-layout",
    "check-recipes",
    "check-doc-symbols",
    "check-hud-tokens",
    "check-street-rule-parity",
  ].map((name): Stage => ({
    name,
    ...bun("run", name),
    needs: ["ensure-ready"],
    // The generated-artifact checks fail on drift, which re-running them cannot fix.
    fix: GENERATED_ARTIFACT_CHECKS.has(name) ? "bun run gen" : undefined,
  })),
  {
    name: "check-types-all",
    ...bun("scripts/check-types-all.ts"),
    needs: ["ensure-ready"],
    rerun: "bun scripts/check-types-all.ts",
  },
];

// External game content has its own Games gate; SDK publication retains every package validator.
const EXTERNAL_GAME_CHECKS = new Set([
  "check-module-globals",
  "check-game-determinism",
  "check-game-front-end",
  "check-game-feel",
  "check-art-direction",
  "check-game-shape",
  "check-content-gate",
  "check-asset-availability",
]);
const CHECK_TYPES_SDK_STAGES = CHECK_TYPES_STAGES.filter((stage) => !EXTERNAL_GAME_CHECKS.has(stage.name));

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

/**
 * Every committed derived artifact, regenerated in dependency order by one command. These were four
 * separate scripts that had to be run in the right sequence — and often after a build — with nothing
 * naming the sequence, so a core API change cost several round trips through a failing gate.
 * `ensure-ready` rebuilds stale package dist first, which `gen:export-manifest` reads.
 */
const GEN_STAGES: readonly Stage[] = [
  { name: "ensure-ready", ...bun("scripts/ensure-ready.ts"), rerun: "bun scripts/ensure-ready.ts" },
  // Barrels first: the export surface every later generator reads is derived from them.
  { name: "gen:barrels", ...bun("run", "gen:barrels"), needs: ["ensure-ready"] },
  ...["gen:capabilities", "gen:skill-api", "gen:export-manifest"].map(
    (name): Stage => ({ name, ...bun("run", name), needs: ["gen:barrels"] }),
  ),
];

export const PLANS: Readonly<Record<string, readonly Stage[]>> = {
  gate: GATE_STAGES,
  "check-types": CHECK_TYPES_STAGES,
  "check-types:sdk": CHECK_TYPES_SDK_STAGES,
  gen: GEN_STAGES,
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

/** The command that resolves a failure, when re-running the check is not it. */
export function fixHint(stages: readonly Stage[], name: string): string | undefined {
  return stages.find((candidate) => candidate.name === name)?.fix;
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
    const fixes = [...new Set(failures.map((failure) => fixHint(stages, failure.name)).filter((f): f is string => f !== undefined))];
    for (const fix of fixes) lines.push(`fix drifted artifacts with:\n  ${fix}`);
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
