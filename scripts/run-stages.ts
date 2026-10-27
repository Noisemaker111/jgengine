import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { digestLines, writeStepLog } from "./failure-digest";
import { printHelpIfAsked, renderUsage, type Usage } from "./script-help";

/**
 * The one home of every repository check and every generator: `bun run check [<name>...]` and
 * `bun run gen [<target>...]` read the tables below, and CI, `verify:fast` and the type-shard job
 * read the same tables, so a check exists in one place and is run by one name.
 *
 * Every selected stage runs unless a stage it explicitly `needs` failed, and the run ends with one
 * consolidated verdict listing all failures. A skipped stage is reported as skipped, never as
 * passing — an unrun check must not read as green.
 */
export interface Stage {
  /** Stage id: the check or gen target name. */
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  /**
   * Stage ids whose success this stage's result depends on. A stage whose
   * prerequisite failed is skipped, because running it would only produce
   * derivative noise (type errors from a dist that never got built).
   */
  readonly needs?: readonly string[];
  /** The command that re-runs this stage alone. */
  readonly rerun?: string;
  /**
   * The command that *resolves* this failure, when re-running the check is not the fix. A drifted
   * generated artifact is the case that matters: re-running the check proves the drift again, it
   * does not regenerate anything.
   */
  readonly fix?: string;
}

/** The CI jobs a check runs in; a check in none runs only from `bun run check`. */
export type CheckJob = "types" | "quick" | "games";

export interface CheckDef {
  /** `bun run check <name>`. */
  readonly name: string;
  /** Repo-relative script the check runs with bun. */
  readonly script: string;
  readonly args?: readonly string[];
  readonly jobs: readonly CheckJob[];
  /** Reads a built `dist`: `bun run check` with no names builds first. */
  readonly needsBuild?: boolean;
  /** Fails on a committed artifact that drifted from its generator; `bun run gen` fixes it. */
  readonly generated?: boolean;
  /** Reads the in-repo games, so the publish run (`--sdk`) leaves it to CI. */
  readonly games?: boolean;
  /** Needs arguments only CI has (a PR body), so it runs only when named. */
  readonly named?: boolean;
}

export const CHECKS: readonly CheckDef[] = [
  { name: "artifacts", script: "scripts/check-no-src-artifacts.ts", jobs: ["types", "quick"], generated: true },
  { name: "release-set", script: "scripts/check-release-set.ts", jobs: ["types"] },
  { name: "skills", script: "scripts/check-skill-sync.ts", jobs: [] },
  { name: "skill-api", script: "scripts/gen-skill-api.ts", args: ["--check"], jobs: ["types", "quick"], needsBuild: true, generated: true },
  { name: "orphan-ratchet", script: "scripts/check-orphan-ratchet.ts", jobs: [] },
  { name: "stateful-ratchet", script: "scripts/check-stateful-ratchet.ts", jobs: ["types"] },
  { name: "module-globals", script: "scripts/check-module-globals.ts", jobs: ["types"], games: true },
  { name: "game-determinism", script: "scripts/check-game-determinism.ts", jobs: ["types"], games: true },
  { name: "game-front-end", script: "scripts/check-game-front-end.ts", jobs: ["types"], games: true },
  { name: "game-feel", script: "scripts/check-game-feel.ts", jobs: ["types"], games: true },
  { name: "art-direction", script: "scripts/check-art-direction.ts", jobs: ["types"], games: true },
  { name: "capabilities", script: "scripts/gen-capability-index.ts", args: ["--check"], jobs: ["types"], generated: true },
  { name: "content-gate", script: "scripts/check-content-gate.ts", jobs: ["types"], games: true },
  { name: "asset-availability", script: "scripts/checkAssetAvailability.ts", jobs: ["types"], games: true },
  { name: "pack-texture-layout", script: "scripts/check-pack-texture-layout.ts", jobs: ["types"] },
  { name: "recipes", script: "scripts/check-recipes.ts", jobs: ["types"] },
  { name: "doc-symbols", script: "scripts/check-doc-symbols.ts", jobs: ["types"] },
  { name: "hud-tokens", script: "scripts/check-hud-tokens.ts", jobs: ["types"] },
  { name: "street-rule-parity", script: "scripts/check-street-rule-parity.ts", jobs: ["types"] },
  { name: "source-paths", script: "scripts/sourcePaths.ts", args: ["--check"], jobs: ["types"], generated: true },
  { name: "test-spawn-timeouts", script: "scripts/check-test-spawn-timeouts.ts", jobs: ["types"] },
  { name: "fixture-location", script: "scripts/check-fixture-location.ts", jobs: [] },
  { name: "path-portability", script: "scripts/check-path-portability.ts", jobs: ["types", "quick"] },
  { name: "no-blocking-wait", script: "scripts/check-no-blocking-wait.ts", jobs: ["types"] },
  { name: "script-help", script: "scripts/check-script-help.ts", jobs: [] },
  { name: "types", script: "scripts/check-types-all.ts", jobs: ["types"] },
  { name: "stage-skills", script: "scripts/stage-skills.ts", args: ["--check"], jobs: ["quick"] },
  { name: "changelog", script: "scripts/check-changelog.ts", jobs: ["quick"] },
  { name: "scaffold-launch", script: "scripts/check-scaffold-launch.ts", jobs: ["quick"] },
  { name: "capture-hygiene", script: "scripts/check-capture-hygiene.ts", jobs: ["quick"] },
  { name: "concept-homes", script: "scripts/check-concept-homes.ts", jobs: ["quick"] },
  { name: "layers", script: "scripts/check-layers.ts", jobs: ["quick"] },
  { name: "export-manifest", script: "scripts/gen-export-manifest.ts", args: ["--check"], jobs: ["quick"], needsBuild: true, generated: true },
  { name: "games-framework", script: "games/scripts/framework-check.ts", jobs: ["games"], games: true },
  { name: "games-save-states", script: "games/scripts/check-save-states.ts", jobs: ["games"], games: true },
  { name: "games-design", script: "games/scripts/check-game-design.ts", jobs: ["games"], games: true },
  { name: "games-ledger", script: "games/scripts/capabilities-sync.ts", args: ["--check"], jobs: ["games"], games: true, generated: true },
  { name: "games-capabilities", script: "games/scripts/check-capabilities.ts", jobs: ["games"], games: true },
  { name: "games-sync", script: "packages/jgengine/src/cli/index.ts", args: ["sync", "--check"], jobs: ["games"], games: true },
  { name: "games-glb-textures", script: "games/scripts/check-glb-textures.ts", jobs: [], games: true },
  { name: "recursive-walk", script: "scripts/check-recursive-walk.ts", jobs: [] },
  { name: "version", script: "scripts/set-version.ts", args: ["--check"], jobs: [] },
];

export function findCheck(name: string): CheckDef | undefined {
  return CHECKS.find((check) => check.name === name);
}

/** The command line a check runs, as an argv. */
export function checkCommand(check: CheckDef): string[] {
  return ["bun", check.script, ...(check.args ?? [])];
}

const ENSURE_READY: Stage = {
  name: "ensure-ready",
  command: "bun",
  args: ["scripts/ensure-ready.ts", "--install-only"],
  rerun: "bun scripts/ensure-ready.ts --install-only",
};
const BUILD: Stage = { name: "build", command: "bun", args: ["run", "build"], needs: ["ensure-ready"], rerun: "bun run build" };

export function checkStage(check: CheckDef, withBuild: boolean): Stage {
  const [command, ...args] = checkCommand(check);
  return {
    name: check.name,
    command: command!,
    args,
    needs: withBuild && check.needsBuild === true ? ["ensure-ready", "build"] : ["ensure-ready"],
    rerun: `bun run check ${check.name}`,
    fix: check.generated === true ? "bun run gen" : undefined,
  };
}

/** The stages for a set of checks; `withBuild` puts a build in front of the ones that read `dist`. */
export function checkPlan(checks: readonly CheckDef[], withBuild: boolean): Stage[] {
  const build = withBuild && checks.some((check) => check.needsBuild === true);
  return [ENSURE_READY, ...(build ? [BUILD] : []), ...checks.map((check) => checkStage(check, build))];
}

/** The checks one CI job runs, in table order. */
export function jobChecks(job: CheckJob): CheckDef[] {
  return CHECKS.filter((check) => check.jobs.includes(job) && check.named !== true);
}

/** `bun run check` with no names: every check except the ones that need CI's arguments. */
export const ALL_CHECKS: readonly CheckDef[] = CHECKS.filter((check) => check.named !== true);
/** `bun run check --sdk`: the type-check job without the game checks CI already ran on the commit. */
export const SDK_CHECKS: readonly CheckDef[] = jobChecks("types").filter((check) => check.games !== true);

export interface GenTarget {
  readonly name: string;
  readonly script: string;
  /** Runs after these targets: barrels first, since every later generator reads the export surface. */
  readonly after?: readonly string[];
}

/**
 * Every committed derived artifact, regenerated in dependency order by one command. Every
 * generator reads package source, so no build runs first.
 */
export const GEN_TARGETS: readonly GenTarget[] = [
  { name: "source-paths", script: "scripts/sourcePaths.ts" },
  { name: "skill-routing", script: "scripts/gen-skill-routing.ts" },
  { name: "barrels", script: "scripts/gen-barrels.ts", after: ["skill-routing"] },
  { name: "capabilities", script: "scripts/gen-capability-index.ts", after: ["barrels"] },
  { name: "skill-api", script: "scripts/gen-skill-api-safe.ts", after: ["barrels"] },
  { name: "export-manifest", script: "scripts/gen-export-manifest.ts", after: ["barrels"] },
  { name: "games-ledger", script: "games/scripts/capabilities-sync.ts", after: ["barrels"] },
];

export function genPlan(targets: readonly GenTarget[]): Stage[] {
  const chosen = new Set(targets.map((target) => target.name));
  return [
    ENSURE_READY,
    ...targets.map(
      (target): Stage => ({
        name: target.name,
        command: "bun",
        args: [target.script],
        needs: ["ensure-ready", ...(target.after ?? []).filter((name) => chosen.has(name))],
        rerun: `bun run gen ${target.name}`,
      }),
    ),
  ];
}

export type StageState = "passed" | "failed" | "skipped";

export interface StageOutcome {
  readonly name: string;
  readonly state: StageState;
  /** For a skipped stage, the already-failed prerequisites that caused the skip. */
  readonly blockedBy?: readonly string[];
}

/**
 * Decide each stage's fate in order, given a runner that reports pass/fail.
 * Pure over `run` so the skip/continue policy is testable without spawning.
 */
export function runPlan(stages: readonly Stage[], run: (stage: Stage) => boolean): StageOutcome[] {
  const results: StageOutcome[] = [];
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
  return stage?.rerun ?? `bun run check ${name}`;
}

/** The command that resolves a failure, when re-running the check is not it. */
export function fixHint(stages: readonly Stage[], name: string): string | undefined {
  return stages.find((candidate) => candidate.name === name)?.fix;
}

export function formatSummary(plan: string, stages: readonly Stage[], results: readonly StageOutcome[]): string {
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

const CHECK_USAGE: Usage = {
  summary: "run the repository's checks: all of them, or the ones named",
  usage: "bun run check [<name>...] [--sdk] [--list] | bun run check <name> [<its own flags>]",
  flags: [
    { flag: "<name>...", detail: "run only these checks; one name passes every later argument to it" },
    { flag: "--sdk", detail: "the type-check job without the game checks (what the publish run checks)" },
    { flag: "--list", detail: "print every check, the CI job that runs it and its script, then exit" },
  ],
  example: "bun run check concept-homes --all",
  exits: ["0 every selected check passed", "1 a check failed or was skipped", "2 an unknown check name"],
};

const GEN_USAGE: Usage = {
  summary: "regenerate every committed derived artifact, or the targets named, in dependency order",
  usage: "bun run gen [<target>...] [--list]",
  flags: [
    { flag: "<target>...", detail: "regenerate only these targets" },
    { flag: "--list", detail: "print every target and its script, then exit" },
  ],
  example: "bun run gen skill-api",
  exits: ["0 regenerated", "1 a generator failed", "2 an unknown target name"],
};

/** What `bun run check <argv>` runs: one check with its own flags, or a plan of stages. */
export type CheckRequest =
  | { kind: "single"; check: CheckDef; args: string[] }
  | { kind: "plan"; label: string; stages: Stage[] }
  | { kind: "list" }
  | { kind: "error"; message: string };

export function parseCheckArgs(argv: readonly string[]): CheckRequest {
  if (argv.includes("--list")) return { kind: "list" };
  if (argv.includes("--sdk")) {
    if (argv.length > 1) return { kind: "error", message: "check: --sdk takes no other arguments" };
    return { kind: "plan", label: "check --sdk", stages: checkPlan(SDK_CHECKS, true) };
  }
  if (argv.length === 0) return { kind: "plan", label: "check", stages: checkPlan(ALL_CHECKS, true) };
  const checks = argv.map((arg) => findCheck(arg));
  if (argv.length > 1 && checks.every((check) => check !== undefined)) {
    return { kind: "plan", label: `check ${argv.join(" ")}`, stages: checkPlan(checks as CheckDef[], false) };
  }
  // One check, and anything after its name is that check's own flags.
  if (checks[0] !== undefined) return { kind: "single", check: checks[0], args: argv.slice(1) };
  return { kind: "error", message: `check: no check named ${argv[0]} (bun run check --list)` };
}

function runStages(label: string, stages: readonly Stage[], root: string): number {
  const digests: string[] = [];
  const results = runPlan(stages, (stage) => {
    console.log(`\n--- ${label} › ${stage.name}`);
    const result = spawnSync(stage.command, [...stage.args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      shell: false,
    });
    if (result.error !== undefined) {
      console.error(`${stage.name}: failed to spawn — ${result.error.message}`);
      return false;
    }
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (output.trim().length > 0) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
    if (result.status !== 0) {
      const log = writeStepLog(root, `stages-${label.split(" ")[0]}`, stage.name, output);
      digests.push(`${stage.name}:`, ...digestLines(output, log));
    }
    return result.status === 0;
  });
  console.log(formatSummary(label, stages, results));
  if (digests.length > 0) console.log(`\nwhat failed, first error per file:\n${digests.join("\n")}`);
  return results.every((result) => result.state === "passed") ? 0 : 1;
}

function main(argv: readonly string[]): number {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const [verb, ...rest] = argv;
  if (verb === "--help" || verb === "-h") {
    console.log(`run-stages: the one home of every check and generator

${renderUsage("check", CHECK_USAGE)}
${renderUsage("gen", GEN_USAGE)}`);
    return 0;
  }
  if (verb === "check") {
    if (rest.length === 0 || rest[0]!.startsWith("-")) {
      if (printHelpIfAsked("check", CHECK_USAGE, rest)) return 0;
    }
    const request = parseCheckArgs(rest);
    if (request.kind === "error") {
      console.error(request.message);
      return 2;
    }
    if (request.kind === "list") {
      const width = Math.max(...CHECKS.map((check) => check.name.length)) + 2;
      for (const check of CHECKS) {
        const jobs = check.jobs.length === 0 ? "local" : check.jobs.join(",");
        console.log(`${check.name.padEnd(width)}${jobs.padEnd(18)}${checkCommand(check).slice(1).join(" ")}`);
      }
      return 0;
    }
    if (request.kind === "single") {
      const result = spawnSync("bun", [request.check.script, ...(request.check.args ?? []), ...request.args], { cwd: root, stdio: "inherit" });
      return result.status ?? 1;
    }
    return runStages(request.label, request.stages, root);
  }
  if (verb === "gen") {
    if (printHelpIfAsked("gen", GEN_USAGE, rest)) return 0;
    if (rest.includes("--list")) {
      for (const target of GEN_TARGETS) console.log(`${target.name.padEnd(18)}${target.script}`);
      return 0;
    }
    const unknown = rest.filter((name) => !GEN_TARGETS.some((target) => target.name === name));
    if (unknown.length > 0) {
      console.error(`gen: no target named ${unknown.join(", ")} (bun run gen --list)`);
      return 2;
    }
    const targets = rest.length === 0 ? GEN_TARGETS : GEN_TARGETS.filter((target) => rest.includes(target.name));
    return runStages(rest.length === 0 ? "gen" : `gen ${rest.join(" ")}`, genPlan(targets), root);
  }
  console.error("usage: bun scripts/run-stages.ts <check|gen> [...] (bun run check --help, bun run gen --help)");
  return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
