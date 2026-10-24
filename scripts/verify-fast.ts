// A lane's own change used to cost a whole suite (about 1,100 test files) or a
// Chrome drive to check, so verifying one file took as long as verifying the
// repository. This maps what the branch changed to the packages that own it, the
// tests that can reach it and the cheap static gates the `quick` CI job runs, then
// runs only those.
//
//   bun run verify:fast              # the loop while iterating: seconds
//   bun run verify:fast --full       # everything CI runs; minutes, before landing
//   bun run verify:fast --plan       # the steps and their commands, nothing run
//   bun run verify:fast --json       # one { ok, ms, checks } document on stdout
//
// Exit: 0 verified, 1 a step failed, 2 a changed runtime file reached no test (a
// change this cannot attribute is never a silent pass). With `--json` the exit is
// 0 or 1: a caller reading the document gets no meaningful 2, so an unattributed
// change is a failed check named `attribution`.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { effectivePaths } from "./sourcePaths";
import { walkTestFiles } from "./test-shard";

export const BASE = "origin/beta";
export const EXIT_VERIFIED = 0;
export const EXIT_FAILED = 1;
export const EXIT_UNATTRIBUTED = 2;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const RUNTIME_ROOTS = [/^packages\/[^/]+\/src\//, /^apps\/[^/]+\/src\//, /^scripts\/[^/]+\.[cm]?tsx?$/];

export interface Step {
  name: string;
  command: string[];
  /** Steps by name that must finish first; a step whose prerequisite failed is reported failed, never green. */
  needs?: string[];
  /** Starts a browser against the shared dev server, which `--full` boots once for every one of these. */
  browser?: boolean;
  /**
   * Runs with the machine to itself. A timing budget or a launch-handshake fixture measures
   * the machine, so a neighbour's browser or build would read as a regression in the step:
   * CI gives each of these its own runner, and this gives it the same.
   */
  exclusive?: boolean;
  /**
   * Rough seconds this step took on this PC, used only to decide start order: the heaviest
   * runnable step starts first, so the longest step is not the one that ends the run while
   * lanes sit idle. A stale number costs overlap, never correctness.
   */
  cost?: number;
}

/**
 * Steps run at once by default: half the machine's threads, never more than six. Eight
 * lanes of this repository's steps oversubscribed a 12-core PC (`test shard c`'s browser
 * scenario hit its own 30 s give-up), and twelve made the frame gate's browser launches
 * fail; six is the widest that ran every step green here. `--jobs` overrides it.
 */
export const DEFAULT_JOBS = Math.max(2, Math.min(6, Math.floor(availableParallelism() / 2)));

export interface Workspace {
  dir: string;
  checkTypes: boolean;
}

export interface Plan {
  changed: string[];
  /** Workspace dirs whose own `check-types` runs. */
  typechecks: string[];
  /** Test files to run, sorted. */
  tests: string[];
  /** Root package scripts that run. */
  gates: string[];
  /** Changed runtime files no selected test can reach. */
  unattributed: string[];
}

const posix = (path: string): string => path.replaceAll("\\", "/");
const relPosix = (root: string, path: string): string => posix(relative(root, path));

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${(result.stderr ?? "").trim()}`);
  return result.stdout ?? "";
}

function names(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Everything this branch changed against `base`: committed, staged, unstaged and
 * untracked. A lane checks its work before committing it, so the working tree counts.
 */
export function changedFiles(root: string, base: string = BASE): string[] {
  const out = new Set<string>();
  const add = (args: string[]): void => {
    for (const path of names(git(root, args))) out.add(path);
  };
  add(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
  add(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]);
  add(["diff", "--name-only", "--diff-filter=ACMR"]);
  add(["ls-files", "--others", "--exclude-standard"]);
  return [...out].sort();
}

/** Every workspace dir under the root `package.json` globs, with whether it type-checks. */
export function workspaces(root: string): Workspace[] {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const globs = Array.isArray(manifest.workspaces) ? manifest.workspaces : (manifest.workspaces?.packages ?? []);
  const dirs: string[] = [];
  for (const glob of globs) {
    if (!glob.endsWith("/*")) {
      dirs.push(glob);
      continue;
    }
    const parent = glob.slice(0, -2);
    if (!existsSync(join(root, parent))) continue;
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
    }
  }
  return dirs
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      return { dir, checkTypes: typeof pkg.scripts?.["check-types"] === "string" };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/** The workspace that owns a path: the longest `dir/` prefix, or null for root files such as `scripts/`. */
export function workspaceOf(path: string, all: readonly Workspace[]): Workspace | null {
  let found: Workspace | null = null;
  for (const workspace of all) {
    if (path === workspace.dir || path.startsWith(`${workspace.dir}/`)) {
      if (found === null || workspace.dir.length > found.dir.length) found = workspace;
    }
  }
  return found;
}

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

/** A file whose behavior a test is expected to reach: source under a runtime root, not a test or a declaration. */
export function isRuntimeSource(path: string): boolean {
  return RUNTIME_ROOTS.some((root) => root.test(path)) && SOURCE_FILE.test(path) && !DECLARATION.test(path) && !TEST_FILE.test(path);
}

/** Import specifiers in a source file: static, dynamic, re-export and require forms. */
export function specifiers(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|[^\w$.])(?:import|export)\s*(?:[^"'();]*?\sfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/**
 * Resolve a specifier the way the repo's tsconfig `paths` do, against the files that
 * exist. Relative imports resolve beside the importer; `@jgengine/*` resolve through
 * `tsconfig.base.json`, which is the map `bun test` and `tsgo` both use.
 */
export function makeResolver(root: string): (specifier: string, from: string) => string[] {
  const effective = effectivePaths(join(root, "tsconfig.base.json"));
  const paths = effective?.paths ?? {};
  const pathsDir = effective?.dir ?? root;
  const keys = Object.keys(paths).sort((a, b) => b.length - a.length);

  const candidates = (base: string): string[] =>
    [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, join(base, "index.ts"), join(base, "index.tsx")].filter(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    );

  return (specifier, from) => {
    const bases: string[] = [];
    if (specifier.startsWith(".")) {
      bases.push(resolve(dirname(join(root, from)), specifier));
    } else {
      for (const key of keys) {
        if (key.endsWith("/*")) {
          const prefix = key.slice(0, -1);
          if (!specifier.startsWith(prefix)) continue;
          const rest = specifier.slice(prefix.length);
          for (const target of paths[key] ?? []) bases.push(resolve(pathsDir, target.replace("*", rest)));
          break;
        }
        if (key === specifier) {
          for (const target of paths[key] ?? []) bases.push(resolve(pathsDir, target));
          break;
        }
      }
    }
    const resolved = new Set<string>();
    for (const base of bases) for (const candidate of candidates(base)) resolved.add(relPosix(root, candidate));
    return [...resolved];
  };
}

/** Tests in the same directory named after the file: `terrain.ts` reaches `terrain.test.ts`. */
export function ownTests(file: string, testFiles: readonly string[]): string[] {
  if (TEST_FILE.test(file)) return [file];
  const dir = posix(dirname(file));
  const stem = basename(file).replace(/\.[cm]?[jt]sx?$/, "");
  return testFiles.filter((test) => test.startsWith(`${dir}/${stem}.`) && TEST_FILE.test(test));
}

/**
 * Which changed files each test imports, one level deep. A test reaches a file only
 * when it imports that file: a test that imports a package barrel (`@jgengine/core`)
 * is not counted against every module the barrel re-exports, because that would make
 * every core change run every test that imports core.
 */
export function importers(
  files: readonly string[],
  testFiles: readonly string[],
  readText: (path: string) => string,
  resolveSpecifier: (specifier: string, from: string) => string[],
): Map<string, string[]> {
  const wanted = new Set(files);
  const found = new Map<string, string[]>(files.map((file) => [file, []]));
  for (const test of testFiles) {
    let text: string;
    try {
      text = readText(test);
    } catch {
      continue;
    }
    const reached = new Set<string>();
    for (const specifier of specifiers(text)) {
      for (const target of resolveSpecifier(specifier, test)) if (wanted.has(target)) reached.add(target);
    }
    for (const file of reached) found.get(file)!.push(test);
  }
  return found;
}

/**
 * The `quick` job's cheap static gates that can cover this change. Each of these
 * already runs in CI, so running it here never invents a rule. The `quick` steps that
 * need a build (`build`, `check-skill-api`, `check-export-manifest`) and the ones that
 * launch a browser or scaffold (`check:scaffold-launch`) are left to `--full`.
 */
export function gatesFor(changed: readonly string[]): string[] {
  const gates = new Set(["check-artifacts", "check:fixture-location", "check-orphan-ratchet"]);
  const shippedSource = changed.filter((path) => /^packages\/[^/]+\/src\//.test(path) && !isTestFile(path));
  if (changed.some((path) => path.startsWith("scripts/")) || shippedSource.length > 0) gates.add("check:capture-hygiene");
  if (shippedSource.length > 0) gates.add("check-changelog");
  if (changed.some((path) => /\.(md|mdx)$/i.test(path) || path.startsWith(".claude/skills/"))) {
    gates.add("check-skills");
    gates.add("check-stage-skills");
  }
  return [...gates];
}

/** What `bun run verify:fast` runs for this change. */
export function buildPlan(input: {
  changed: readonly string[];
  testFiles: readonly string[];
  workspaces: readonly Workspace[];
  readText: (path: string) => string;
  resolveSpecifier: (specifier: string, from: string) => string[];
}): Plan {
  const changed = [...new Set(input.changed)].sort();
  const runtime = changed.filter(isRuntimeSource);
  const importedBy = importers(runtime, input.testFiles, input.readText, input.resolveSpecifier);
  const tests = new Set<string>();
  for (const file of changed) {
    for (const test of ownTests(file, input.testFiles)) tests.add(test);
  }
  for (const reachable of importedBy.values()) for (const test of reachable) tests.add(test);

  const typechecks: string[] = [];
  for (const file of changed) {
    const workspace = workspaceOf(file, input.workspaces);
    if (workspace?.checkTypes === true && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
  }

  const unattributed = runtime.filter(
    (path) => ownTests(path, input.testFiles).length === 0 && (importedBy.get(path) ?? []).length === 0,
  );

  return {
    changed,
    typechecks: typechecks.sort(),
    tests: [...tests].sort(),
    gates: gatesFor(changed),
    unattributed,
  };
}

/** The commands `bun run verify:fast` runs for a plan. */
export function fastSteps(plan: Plan): Step[] {
  const steps: Step[] = [];
  for (const dir of plan.typechecks) steps.push({ name: `typecheck ${dir}`, command: ["bun", `--cwd=${dir}`, "run", "check-types"] });
  if (plan.tests.length > 0) steps.push({ name: `test ${plan.tests.length} file(s)`, command: ["bun", "test", "--timeout", "20000", ...plan.tests] });
  for (const gate of plan.gates) steps.push({ name: gate, command: ["bun", "run", gate] });
  return steps;
}

/** The paths whose change turns on CI's frame and smoke gates, read from the workflow so there is one list. */
export function heavyPaths(root: string): RegExp {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const changes = /^ {2}changes:\n([\s\S]*?)(?=^ {2}\S)/m.exec(workflow)?.[1] ?? "";
  const pattern = /grep -Eq '([^']+)'/.exec(changes)?.[1];
  if (pattern === undefined) throw new Error("verify-fast: .github/workflows/ci.yml no longer has the `changes` job's path pattern");
  return new RegExp(pattern);
}

/**
 * Seconds each shard's tests take on this PC, so the longest starts first. Measured with
 * `bun scripts/test-shard.ts <name>` alone (2026-10-23); shard i is split, so its halves
 * carry the same total between them.
 */
export const SHARD_COST: Readonly<Record<string, number>> = {
  a: 30,
  b: 40,
  c: 80,
  d: 75,
  e: 65,
  f: 20,
  g: 85,
  h: 45,
  i: 100,
};

/**
 * Shard i is the one `test` job that prepares a build and the Games clone before its
 * tests, and on Windows its 74 files take 136 s alone - longer than any other step and
 * past the two minutes this command is meant to stay under. `scripts/test-shard.ts`
 * still owns which files shard i runs (this asks it with `--print i`), and the list runs
 * as two halves with the build and the clone as their own steps.
 *
 * Measured alone on this PC (2026-10-23): land.test.ts 30 s, tarballInstall 22 s,
 * changelog-fragments 21 s, the other 71 files 63 s together, 126-136 s in total. Those
 * three are git and subprocess bound, so the halves are split by that cost rather than
 * by count, which would put two of them side by side.
 */
export const SHARD_I_MEASURED_COST: Readonly<Record<string, number>> = {
  "scripts/land.test.ts": 30,
  "scripts/tarballInstall.test.ts": 22,
  "scripts/changelog-fragments.test.ts": 21,
};

export function shardISteps(root: string): Step[] {
  const printed = spawnSync("bun", ["scripts/test-shard.ts", "--print", "i"], { cwd: root, encoding: "utf8", timeout: 60_000 });
  const files = (printed.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (printed.status !== 0 || files.length === 0) {
    throw new Error(`verify:fast: \`bun scripts/test-shard.ts --print i\` listed no files (exit ${printed.status})`);
  }
  const halves = splitByCost(files, SHARD_I_MEASURED_COST);
  return [
    { name: "games:clone", command: ["bun", "run", "games:clone"] },
    ...halves.map((half, index) => ({
      name: `test shard i (${index + 1}/${halves.length}, ${half.length} files)`,
      command: ["bun", "test", "--timeout", "20000", ...half],
      needs: ["build", "games:clone"],
      cost: 50,
    })),
  ];
}

/** Two groups of files with roughly equal measured cost, heaviest files first. */
export function splitByCost(files: readonly string[], cost: Readonly<Record<string, number>>, parts = 2): string[][] {
  const groups = Array.from({ length: parts }, () => ({ files: [] as string[], total: 0 }));
  const ordered = [...files].sort((a, b) => (cost[b] ?? 1) - (cost[a] ?? 1) || a.localeCompare(b));
  for (const file of ordered) {
    const lightest = groups.reduce((low, group) => (group.total < low.total ? group : low));
    lightest.files.push(file);
    lightest.total += cost[file] ?? 1;
  }
  return groups.map((group) => group.files);
}


/**
 * Exactly the commands CI runs: the `quick` job, `types`, every `test` shard,
 * `web-build`, `perf-cpu`, the Windows suite, and the frame and smoke gates when
 * a changed path can reach them. CI runs these as parallel jobs on fresh runners;
 * here they run a few at a time in this checkout, so the wall clock approaches the
 * slowest step instead of the sum. `needs` keeps the ordering that matters: the
 * steps that read a built `dist`, and shard i's tests, wait for `build`, and the
 * Games-reading gates wait for `games:clone`.
 */
export async function fullSteps(root: string, changed: readonly string[]): Promise<Step[]> {
  // Costs are the seconds each step took here at `--jobs 8` (2026-10-23); only start order
  // depends on them. Trivial gates have none.
  const steps: Step[] = [
    { name: "check-artifacts", command: ["bun", "run", "check-artifacts"] },
    { name: "check-stage-skills", command: ["bun", "run", "check-stage-skills"] },
    { name: "check-skills", command: ["bun", "run", "check-skills"] },
    { name: "check-changelog", command: ["bun", "run", "check-changelog"] },
    { name: "build", command: ["bun", "run", "build"], cost: 10 },
    { name: "check-skill-api", command: ["bun", "run", "check-skill-api"], needs: ["build"], cost: 30 },
    { name: "check-orphan-ratchet", command: ["bun", "run", "check-orphan-ratchet"] },
    { name: "check:fixture-location", command: ["bun", "run", "check:fixture-location"] },
    { name: "check:scaffold-launch", command: ["bun", "run", "check:scaffold-launch"], exclusive: true },
    { name: "check:capture-hygiene", command: ["bun", "run", "check:capture-hygiene"] },
    { name: "check-export-manifest", command: ["bun", "run", "check-export-manifest"], needs: ["build"] },
  ];

  steps.push({ name: "types (type-shard)", command: ["bun", "scripts/type-shard.ts"], cost: 40 });

  const shards = /shard: \[([^\]]+)\]/.exec(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"))?.[1] ?? "";
  for (const shard of shards.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    if (shard === "i") {
      steps.push(...shardISteps(root));
      continue;
    }
    steps.push({ name: `test shard ${shard}`, command: ["bun", "scripts/test-shard.ts", shard], cost: SHARD_COST[shard] ?? 30 });
  }

  steps.push({ name: "web-build", command: ["bun", "--cwd=apps/web", "run", "build"], cost: 40 });
  // The CPU budgets normalize by a calibration run of the same machine, so a neighbour's
  // build or browser reads as a regression: CI gives bench:cpu its own runner.
  steps.push({ name: "perf-cpu", command: ["bun", "run", "bench:cpu"], exclusive: true, cost: 15 });
  // `windows-tests` (`bun --cwd=packages/jgengine run test`) is not a step here. That job
  // exists in CI because the `test` shards run on ubuntu and cannot see a Windows-only
  // failure; on this machine shard e already runs all 30 of its files, so repeating it cost
  // 150 s of a local run for no extra coverage. `scripts/test-shard.test.ts` keeps a test
  // file under those roots from falling outside every shard.

  if (changed.some((path) => heavyPaths(root).test(path))) {
    const { SMOKE_GAMES } = (await import("./smoke-games")) as { SMOKE_GAMES: readonly string[] };
    const { PERF_GATE_GAMES } = (await import("./perf-gate")) as { PERF_GATE_GAMES: readonly string[] };
    // The smoke games boot one at a time inside one `bun run smoke`, so each keeps its
    // own step and its own process. The script is called directly: `bun run smoke --games x`
    // hands the args to scripts/guard.ts, whose win32 pass-through runs the first command
    // of the `&&` chain and exits 0, so the step "passed" without booting a game.
    // The frame gate measures games concurrently itself, so one step with every game gives
    // one lane the wall of the slowest game; `--jobs` bounds it for a machine that cannot
    // hold eight browsers.
    for (const game of SMOKE_GAMES) {
      steps.push({ name: `smoke ${game}`, command: ["bun", "scripts/smoke-games.ts", "--games", game], browser: true, cost: 60 });
    }
    steps.push({
      name: `perf gate (${PERF_GATE_GAMES.length} games)`,
      command: ["bun", "run", "perf:gate", "--jobs", String(PERF_GATE_GAMES.length)],
      browser: true,
      cost: 100,
    });
  }
  return steps;
}

export interface Check {
  name: string;
  ok: boolean;
  ms: number;
}

export interface JsonReport {
  ok: boolean;
  ms: number;
  checks: Check[];
}

/** The document `--json` prints: `ok` is every check, `ms` the whole run. */
export function jsonReport(checks: readonly Check[], ms: number): JsonReport {
  return {
    ok: checks.every((check) => check.ok),
    ms,
    checks: checks.map((check) => ({ name: check.name, ok: check.ok, ms: check.ms })),
  };
}

/**
 * `--json`: run the steps and print one document, nothing else on stdout. A failing
 * step's output goes to stderr so a person can still read why. Returns the exit code.
 */
export async function jsonRun(
  steps: readonly Step[],
  options: {
    run: (step: Step) => Promise<{ ok: boolean; ms: number; output: string }>;
    out?: (line: string) => void;
    err?: (line: string) => void;
    started?: number;
  },
): Promise<number> {
  const out = options.out ?? ((line: string): void => console.log(line));
  const err = options.err ?? ((line: string): void => console.error(line));
  const started = options.started ?? Date.now();
  const checks: Check[] = [];
  for (const step of steps) {
    const result = await options.run(step);
    checks.push({ name: step.name, ok: result.ok, ms: result.ms });
    if (!result.ok && result.output.length > 0) err(result.output);
  }
  out(JSON.stringify(jsonReport(checks, Date.now() - started)));
  return checks.every((check) => check.ok) ? EXIT_VERIFIED : EXIT_FAILED;
}

export interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  output: string;
  /** Prerequisites that failed, when the step was not run at all. */
  blockedBy?: string[];
}

/**
 * Run every step with at most `jobs` in flight, a step starting only once its
 * `needs` have settled, not merely started. A step whose prerequisite failed is
 * reported `blockedBy` and never run, so nothing is skipped silently and its
 * dependants fail too. Results come back in `steps` order whatever finished first.
 */
export async function runSteps(
  steps: readonly Step[],
  jobs: number,
  run: (step: Step) => Promise<StepResult>,
): Promise<StepResult[]> {
  const names = new Set(steps.map((step) => step.name));
  for (const step of steps) {
    for (const need of step.needs ?? []) {
      if (!names.has(need)) throw new Error(`verify:fast: ${step.name} needs ${need}, which is not a step`);
    }
  }

  const resolved = new Map<string, (result: StepResult) => void>();
  const settled = new Map<string, Promise<StepResult>>();
  for (const step of steps) {
    settled.set(step.name, new Promise<StepResult>((resolve) => resolved.set(step.name, resolve)));
  }
  const results = new Map<string, StepResult>();
  const pending = [...steps];
  const inFlight = new Map<string, Promise<StepResult>>();
  const isDone = (name: string): boolean => results.has(name);
  /** The heaviest step whose prerequisites are done, so the slowest work starts first. */
  const runnable = (): number => {
    let best = -1;
    for (let index = 0; index < pending.length; index += 1) {
      const step = pending[index]!;
      if (!(step.needs ?? []).every(isDone)) continue;
      if (best < 0 || (step.cost ?? 1) > (pending[best]!.cost ?? 1)) best = index;
    }
    return best;
  };

  const settle = (result: StepResult): void => {
    results.set(result.name, result);
    resolved.get(result.name)!(result);
  };

  const lanes = Math.max(1, Math.min(jobs, pending.length));
  let machineHeld = false;
  let turns = 0;
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        // A lane that waits for a prerequisite loops once per turn. Far more turns than
        // steps means nothing can ever start again, so fail with the state instead of
        // spinning a core forever.
        turns += 1;
        if (turns > 50_000) {
          throw new Error(
            `verify:fast: the scheduler stopped making progress; pending ${pending.map((step) => step.name).join(", ")}; ` +
              `in flight ${[...inFlight.keys()].join(", ")}`,
          );
        }
        const index = runnable();
        if (index >= 0) {
          const [step] = pending.splice(index, 1);
          const blockedBy = (step.needs ?? []).filter((need) => results.get(need)?.ok !== true);
          if (blockedBy.length > 0) {
            settle({ name: step.name, ok: false, ms: 0, output: `not run: ${blockedBy.join(", ")} failed`, blockedBy });
            continue;
          }
          const wantsMachine = step.exclusive === true;
          if (inFlight.size > 0 && (wantsMachine || machineHeld)) {
            pending.unshift(step);
            await Promise.race([...inFlight.values()]);
            continue;
          }
          if (wantsMachine) machineHeld = true;
          inFlight.set(step.name, settled.get(step.name)!);
          const result = await run(step);
          inFlight.delete(step.name);
          if (wantsMachine) machineHeld = false;
          settle(result);
          continue;
        }
        if (pending.length === 0) return;
        // Only unsettled prerequisites: racing an already-resolved need would return at
        // once and leave this lane spinning instead of waiting for the one still running.
        const waiting = pending.flatMap((step) => (step.needs ?? []).filter((need) => !isDone(need)));
        if (waiting.length === 0) continue;
        await Promise.race(waiting.map((need) => settled.get(need)!));
      }
    }),
  );
  return steps.map((step) => results.get(step.name)!);
}

async function run(step: Step, root: string): Promise<StepResult> {
  const started = Date.now();
  const proc = Bun.spawn(step.command, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { name: step.name, ok: code === 0, ms: Date.now() - started, output: `${stdout}${stderr}`.trim() };
}

/**
 * The steps that launch a browser all call `ensureDevServer` themselves: run at once
 * they would race to start one and the losers would fail on its strict port, so
 * `--full` boots it once here and stops it after the run.
 */
async function withHeavyServer<T>(root: string, steps: readonly Step[], work: () => Promise<T>): Promise<T> {
  if (!steps.some((step) => step.browser === true)) return work();
  const { ensureDevServer, killPid, killProcessTree } = await import("./browser-lib");
  const server = await ensureDevServer(root);
  try {
    return await work();
  } finally {
    killProcessTree(server.child ?? null);
    killPid(server.pid, true);
  }
}

function printPlan(plan: Plan, steps: readonly Step[]): void {
  for (const path of plan.changed) console.log(`  changed  ${path}`);
  for (const step of steps) console.log(`  step     ${step.name}  (${step.command.join(" ")})`);
  if (plan.unattributed.length > 0) {
    console.log(`  no test reaches ${plan.unattributed.length} changed file(s):`);
    for (const path of plan.unattributed) console.log(`    ${path}`);
  }
}

function reportUnattributed(plan: Plan): void {
  console.error(`\nverify:fast cannot attribute ${plan.unattributed.length} changed file(s) to a test:`);
  for (const path of plan.unattributed) console.error(`  ${path}`);
  console.error(
    "\nNo test in the repository imports these and none sits beside them, so this run would prove\n" +
      "nothing about them. Add a test next to the file, or run the package suite yourself:\n" +
      "  bun --cwd=<package> run test\n" +
      "A change with no reachable test is reported here rather than passing silently.",
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const baseIndex = argv.indexOf("--base");
  const base = baseIndex >= 0 ? (argv[baseIndex + 1] ?? BASE) : BASE;
  const full = argv.includes("--full");
  const planOnly = argv.includes("--plan");
  const json = argv.includes("--json");
  const started = Date.now();

  let changed: string[];
  try {
    changed = changedFiles(root, base);
  } catch (error) {
    const message = (error as Error).message;
    if (json) {
      console.log(JSON.stringify(jsonReport([{ name: "changed files", ok: false, ms: 0 }], Date.now() - started)));
      console.error(message);
      return EXIT_FAILED;
    }
    console.error(`verify:fast: ${message}`);
    return EXIT_FAILED;
  }

  if (changed.length === 0) {
    if (json) {
      console.log(JSON.stringify(jsonReport([], Date.now() - started)));
      return EXIT_VERIFIED;
    }
    console.log(`verify:fast: nothing changed against ${base}; nothing to verify.`);
    return EXIT_VERIFIED;
  }

  if (full) {
    const jobsIndex = argv.indexOf("--jobs");
    const jobs = jobsIndex >= 0 ? Number(argv[jobsIndex + 1]) : DEFAULT_JOBS;
    if (!Number.isInteger(jobs) || jobs < 1) {
      console.error(`verify:fast: --jobs needs a whole number of steps at least 1 (got ${argv[jobsIndex + 1]})`);
      return EXIT_FAILED;
    }
    const steps = await fullSteps(root, changed);
    if (json) {
      const runs = await withHeavyServer(root, steps, () => runSteps(steps, jobs, (step) => run(step, root)));
      for (const result of runs) if (!result.ok && result.output.length > 0) console.error(result.output);
      const checks = runs.map((result) => ({ name: result.name, ok: result.ok, ms: result.ms }));
      console.log(JSON.stringify(jsonReport(checks, Date.now() - started)));
      return checks.every((check) => check.ok) ? EXIT_VERIFIED : EXIT_FAILED;
    }
    console.log(`verify:fast --full: ${steps.length} step(s), what CI runs for ${changed.length} changed file(s)`);
    console.log(`  ${Math.min(jobs, steps.length)} at a time in this checkout, the same work CI runs as parallel jobs.`);
    if (planOnly) {
      for (const step of steps) {
        const deps = step.needs === undefined ? "" : `  after ${step.needs.join(", ")}`;
        console.log(`  step  ${step.name}  (${step.command.join(" ")})${deps}`);
      }
      return EXIT_VERIFIED;
    }
    const failures: string[] = [];
    const runs = await withHeavyServer(root, steps, async () =>
      runSteps(steps, jobs, async (step) => {
        const result = await run(step, root);
        const suffix = result.blockedBy === undefined ? "" : `  (${result.output})`;
        console.log(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${(result.ms / 1000).toFixed(1)}s${suffix}`);
        if (!result.ok && result.blockedBy === undefined) console.log(result.output);
        return result;
      }),
    );
    for (const result of runs) if (!result.ok) failures.push(result.name);
    const seconds = (Date.now() - started) / 1000;
    console.log(`\ntotal ${seconds.toFixed(1)}s — ${steps.length - failures.length} passed, ${failures.length} failed`);
    if (failures.length > 0) console.log(`failed: ${failures.join(", ")}`);
    return failures.length === 0 ? EXIT_VERIFIED : EXIT_FAILED;
  }

  const resolveSpecifier = makeResolver(root);
  const plan = buildPlan({
    changed,
    testFiles: walkTestFiles(root),
    workspaces: workspaces(root),
    readText: (path) => readFileSync(join(root, path), "utf8"),
    resolveSpecifier,
  });
  const steps = fastSteps(plan);

  if (json) {
    if (plan.unattributed.length > 0) {
      reportUnattributed(plan);
      console.log(JSON.stringify(jsonReport([{ name: "attribution", ok: false, ms: 0 }], Date.now() - started)));
      return EXIT_FAILED;
    }
    return await jsonRun(steps, { run: (step) => run(step, root), started });
  }

  console.log(`verify:fast against ${base}: ${plan.changed.length} changed file(s), ${plan.tests.length} test file(s), ${plan.gates.length} gate(s)`);
  if (planOnly) {
    printPlan(plan, steps);
    return plan.unattributed.length === 0 ? EXIT_VERIFIED : EXIT_UNATTRIBUTED;
  }
  if (plan.unattributed.length > 0) {
    reportUnattributed(plan);
    return EXIT_UNATTRIBUTED;
  }

  const failures: string[] = [];
  for (const step of steps) {
    const result = await run(step, root);
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${(result.ms / 1000).toFixed(1)}s`);
    if (!result.ok) {
      failures.push(step.name);
      console.log(result.output);
    }
  }
  const seconds = (Date.now() - started) / 1000;
  console.log(`\ntotal ${seconds.toFixed(1)}s — ${steps.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(`failed: ${failures.join(", ")}`);
    console.log("verify:fast ran only what this change reaches. `bun run verify:fast --full` runs what CI runs.");
    return EXIT_FAILED;
  }
  return EXIT_VERIFIED;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
