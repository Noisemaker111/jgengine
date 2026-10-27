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
//   bun run verify:fast --cheap      # only the type-checks and gates: what `bun run preflight` runs
//
// The type-checks and gates start before the tests, and the run stops at the first failure: a
// type error is reported in seconds instead of after minutes of tests that were never the problem.
//
// Exit: 0 verified, 1 a step failed, 2 a changed runtime file reached no test (a
// change this cannot attribute is never a silent pass). With `--json` the exit is
// 0 or 1: a caller reading the document gets no meaningful 2, so an unattributed
// change is a failed check named `attribution`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { assertCheckoutReady } from "./checkout-ready";
import { digestLines, writeStepLog } from "./failure-digest";
import { FRAME_GAMES, REPRESENTATIVE_GAME, scopePattern } from "./ci-scope";
import { buildImportGraph, closure, repoFiles, reverseReach, type ImportGraph } from "./import-graph";
import { openPassCache, treeDigests, WHOLE_TREE } from "./verify-cache";
import { checkCommand, findCheck, jobChecks } from "./run-stages";
import { printHelpIfAsked } from "./script-help";
import { isVerbose, takeVerboseFlag } from "./verbosity";
import { siteGames } from "./siteGames";
import { runSteps, type ScheduledStep, type StepResult } from "./stepScheduler";
import { TEST_ROOTS, walkTestFiles } from "./test-shard";

const VERIFY_FAST_USAGE = {
  summary: "run only the tests and static gates this branch's diff reaches, in seconds",
  usage: "bun run verify:fast [--full] [--cheap] [--plan] [--json] [--base <ref>] [--jobs <n>] [--skill-api] [--no-cache] [--verbose]",
  flags: [
    { flag: "--full", detail: "what CI runs, not just what this change reaches; minutes, before landing" },
    { flag: "--cheap", detail: "only the type-checks and gates, no tests or boots; `bun run preflight` runs this" },
    { flag: "--plan", detail: "print the steps and their commands, run nothing" },
    { flag: "--json", detail: "one { ok, ms, checks } document on stdout" },
    { flag: "--base <ref>", detail: "diff against this ref (default: origin/beta)" },
    { flag: "--jobs <n>", detail: "steps to run at once (default: half the cores, at most 6)" },
    { flag: "--skill-api", detail: "also run `check skill-api`, the 21 s generated api.md check (`bun run gen` regenerates it before a landing)" },
    { flag: "--no-cache", detail: "run every unit, including those that passed before with the same inputs" },
    { flag: "--verbose", detail: "also print the plan, each PASS line and the cache notes (by default only failures and the total)" },
  ],
  example: "bun run verify:fast --plan",
  exits: [
    "0 verified",
    "1 a step failed",
    "2 a changed runtime file reached no test",
    "78 this checkout has no node_modules - run bun install, or bun run agent:bootstrap",
  ],
} as const;

export const BASE = "origin/beta";
export const EXIT_VERIFIED = 0;
export const EXIT_FAILED = 1;
export const EXIT_UNATTRIBUTED = 2;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const RUNTIME_ROOTS = [/^packages\/[^/]+\/src\//, /^apps\/[^/]+\/src\//, /^scripts\/[^/]+\.[cm]?tsx?$/, /^games\/[^/]+\/src\//];
const GAME_DIR = /^games\/[^/]+$/;
/** Demo scenes exist to be looked at; a test of one would be filler, so they never need one. */
const DEMO = /(^|\/)demos?\//;

export interface Step extends ScheduledStep {
  command: string[];
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
  cost?: number | undefined;
  /** A type-check or gate: seconds, and the usual reason a landing fails, so it starts before every test. */
  first?: boolean;
  /**
   * What to run when this step fails because a committed artifact drifted from its
   * generator. Named with the command and the files it rewrites, because "failed" left
   * lanes guessing and pushed them to CI to find out.
   */
  fix?: string | undefined;
  /** The units this step settles; each is remembered as passed when the step passes. */
  units?: Unit[];
}

/** One test file, type-check, gate or boot, and the changed paths that can decide its result. */
export interface Unit {
  id: string;
  inputs: readonly string[];
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
  /** The package name, when the manifest has one. */
  name?: string;
  /** Workspace packages this one depends on (`workspace:*`). */
  dependsOn?: string[];
}

export interface Plan {
  changed: string[];
  /** Paths the branch deleted. */
  deleted: string[];
  /** Workspace dirs whose own `check-types` runs. */
  typechecks: string[];
  /** Test files to run, sorted. */
  tests: string[];
  /** Root package scripts that run. */
  gates: string[];
  /** Changed runtime files no selected test can reach. */
  unattributed: string[];
  /** Workspaces whose whole suite runs because a changed file in them has no test of its own. */
  suites: string[];
  /**
   * Games booted on this machine with their packs linked from the shared asset store. CI never
   * boots a game, so this is the only place a boot regression is caught before merge.
   */
  boots: string[];
  /**
   * The files whose content decides each unit's result, keyed `test:<file>`, `typecheck:<dir>` and
   * `boot:<game>` (see `unitInputs`; `*` is the whole tree). A unit whose inputs are byte-identical
   * to a run that passed is not run again.
   */
  inputs: Record<string, string[]>;
}

/** At most this many games boot in the inner loop; each costs ~15-40 s. */
export const MAX_BOOTS = 2;

/**
 * The games a change should boot: each game whose own source changed; else, for a change to what
 * a game draws (`scripts/ci-scope.ts`'s heavy paths), one game whose import graph reaches it, the
 * representative first. A heavy path that is not source (a workflow, a lockfile, a config) reaches
 * every game in ways no import shows, so it boots the representative.
 */
export function bootsFor(changed: readonly string[], reached?: ReadonlySet<string>): string[] {
  const touched = [
    ...new Set(
      changed
        .filter((path) => /^games\/[^/]+\/(src|public|index\.html|vite\.config)/.test(path) && !isTestFile(path))
        .map((path) => path.split("/")[1]!),
    ),
  ].sort();
  if (touched.length > 0) return touched.slice(0, MAX_BOOTS);
  const heavy = changed.filter((path) => scopePattern().test(path) && !isTestFile(path) && !/\.(md|mdx)$/i.test(path));
  if (heavy.length === 0) return [];
  if (reached === undefined || heavy.some((path) => !SOURCE_FILE.test(path) || DECLARATION.test(path))) return [REPRESENTATIVE_GAME];
  const games = new Set(
    [...reached].filter((path) => /^games\/[^/]+\/[^/]/.test(path) && !path.startsWith("games/scripts/") && !path.startsWith("games/shared/") && !isTestFile(path)).map((path) => path.split("/")[1]!),
  );
  const first = [REPRESENTATIVE_GAME, ...FRAME_GAMES, ...[...games].sort()].find((game) => games.has(game));
  return first === undefined ? [] : [first];
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

/** Paths this branch deleted against `base`, committed, staged or not. */
export function deletedFiles(root: string, base: string = BASE): string[] {
  const out = new Set<string>();
  for (const args of [["diff", "--name-only", "--diff-filter=D", `${base}...HEAD`], ["diff", "--name-only", "--diff-filter=D", "--cached"], ["diff", "--name-only", "--diff-filter=D"]]) {
    for (const path of names(git(root, args))) out.add(path);
  }
  return [...out].sort();
}

/** `test:a`, `test:b`, `gate:c` -> `2 test(s), 1 gate(s)`. */
export function summarizeUnits(units: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const unit of units) {
    const kind = unit.split(":")[0]!;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, count]) => `${count} ${kind}(s)`).join(", ");
}

/**
 * Files this branch moved without editing (`R100`): a rename changes no behavior, so it never
 * needs a test of its own.
 */
export function pureRenames(root: string, base: string = BASE): string[] {
  const renamed = new Set<string>();
  for (const args of [["diff", "--name-status", "-M", `${base}...HEAD`], ["diff", "--name-status", "-M", "--cached"]]) {
    for (const line of names(git(root, args))) {
      const fields = line.split("\t");
      if (fields[0] === "R100" && fields[2] !== undefined) renamed.add(fields[2]);
    }
  }
  return [...renamed].sort();
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
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const dependsOn = Object.entries({ ...pkg.devDependencies, ...pkg.dependencies })
        .filter(([, version]) => version.startsWith("workspace:"))
        .map(([name]) => name)
        .sort();
      return { dir, checkTypes: typeof pkg.scripts?.["check-types"] === "string", ...(pkg.name === undefined ? {} : { name: pkg.name }), dependsOn };
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
  return (
    RUNTIME_ROOTS.some((root) => root.test(path)) &&
    SOURCE_FILE.test(path) &&
    !DECLARATION.test(path) &&
    !TEST_FILE.test(path) &&
    !DEMO.test(path)
  );
}

/** Tests in the same directory named after the file: `terrain.ts` reaches `terrain.test.ts`. */
export function ownTests(file: string, testFiles: readonly string[]): string[] {
  if (TEST_FILE.test(file)) return [file];
  const dir = posix(dirname(file));
  const stem = basename(file).replace(/\.[cm]?[jt]sx?$/, "");
  return testFiles.filter((test) => test.startsWith(`${dir}/${stem}.`) && TEST_FILE.test(test));
}

/**
 * The `quick` job's cheap static gates that can cover this change. Each of these
 * already runs in CI, so running it here never invents a rule. The steps that launch a
 * browser or scaffold (`check scaffold-launch`) are left to `--full`.
 *
 * Both generated-file checks belong here because they are cheap against what a missed
 * one costs: `check export-manifest` reads package.json and the build tsconfig (0.1 s),
 * and `check skill-api` parses every package source through ts-morph (21.5 s on this PC,
 * measured 2026-10-24, and it needs no build - it fails the same without `dist`). The
 * manifest check runs on every package change; `api.md` drift is far more expensive to
 * find, so it waits for `--skill-api`; `preflight` (the first half of `lane:close`) runs
 * `bun run gen`, which regenerates it. The inner loop stays under 5 s and a push still cannot
 * ship a stale generated file.
 */
export function gatesFor(changed: readonly string[]): string[] {
  const gates = new Set(["artifacts", "path-portability", "concept-homes", "layers"]);
  const shippedSource = changed.filter((path) => /^packages\/[^/]+\/src\//.test(path) && !isTestFile(path));
  if (changed.some((path) => path.startsWith("scripts/")) || shippedSource.length > 0) gates.add("capture-hygiene");
  if (shippedSource.length > 0) gates.add("changelog");
  if (changed.some((path) => path.startsWith("packages/"))) {
    gates.add("export-manifest");
    gates.add("skill-api");
  }
  if (changed.some((path) => path.startsWith("games/"))) {
    for (const gate of ["games-framework", "module-globals", "games-save-states", "games-design", "games-depth"]) gates.add(gate);
  }
  // The `games` CI job runs both on every package or game change; each takes seconds here.
  if (changed.some((path) => path.startsWith("games/") || /^packages\/[^/]+\/src\//.test(path))) {
    gates.add("games-ledger");
    gates.add("games-capabilities");
    gates.add("games-sync");
  }
  if (changed.some((path) => /\.(md|mdx)$/i.test(path) || path.startsWith(".claude/skills/"))) gates.add("stage-skills");
  if (changed.some((path) => isTestFile(path))) gates.add("test-spawn-timeouts");
  if (changed.some((path) => /\.browser\.test\.[cm]?[jt]sx?$/.test(path))) gates.add("browser-test-budget");
  return [...gates];
}

/**
 * Where an unresolvable import could point. A relative or local alias names something in the
 * importer's own workspace; `@jgengine/<pkg>/...` names that package. The importer counts as
 * reaching any change under these, so a specifier the graph cannot follow (a template string, a
 * path built at run time, a deleted file) still runs what imports it.
 */
export function opaqueScopes(file: string, unresolved: readonly string[], all: readonly Workspace[]): string[] {
  const own = workspaceOf(file, all)?.dir ?? file.split("/")[0]!;
  const scopes = new Set<string>();
  for (const specifier of unresolved) {
    const engine = /^@jgengine\/([^/]+)/.exec(specifier);
    scopes.add(engine === null ? `${own}/` : `packages/${engine[1]}/`);
  }
  return [...scopes].sort();
}

/** Root files every unit's result can depend on: the toolchain and the compiler settings. */
export const ROOT_INPUTS = ["package.json", "bun.lock", "bunfig.toml", "tsconfig.base.json", "tsconfig.json"];

/** Workspaces whose tests stay inside their own directory and imports; repo tooling tests read the whole tree. */
const CONTAINED = /^(packages\/(?!jgengine$)[^/]+|games\/(?!scripts$|shared$)[^/]+)$/;

function sourcesUnder(graph: ImportGraph, dir: string): string[] {
  return [...graph.files].filter((file) => file.startsWith(`${dir}/`) && SOURCE_FILE.test(file));
}

/**
 * The files whose bytes decide a unit: what `entries` import, directly or not; every non-source
 * file in its workspace (scene data, manifests, fixtures it may read from disk); and the root
 * configs. A unit outside a contained workspace (a repo script's test) reads the whole tree.
 * Nothing here names the base commit, so a rebase that only brings in other work leaves a unit
 * these files do not cover still fresh.
 */
export function unitInputs(graph: ImportGraph, entries: readonly string[], workspace: string | null, extraDirs: readonly string[] = []): string[] {
  if (workspace === null || !CONTAINED.test(workspace)) return [WHOLE_TREE];
  const found = closure(graph, entries);
  for (const dir of [workspace, ...extraDirs]) {
    for (const file of graph.files) if (file.startsWith(`${dir}/`) && (!SOURCE_FILE.test(file) || DECLARATION.test(file))) found.add(file);
  }
  for (const file of ROOT_INPUTS) if (graph.files.has(file)) found.add(file);
  return [...found].sort();
}

/** What `bun run verify:fast` runs for this change. */
export function verifyPlan(input: {
  changed: readonly string[];
  /** Paths the branch deleted: whatever imported them is reached too. */
  deleted?: readonly string[];
  testFiles: readonly string[];
  workspaces: readonly Workspace[];
  graph: ImportGraph;
  /** Changed paths that need no test (pure renames). */
  exempt?: readonly string[];
}): Plan {
  const changed = [...new Set(input.changed)].sort();
  const deleted = [...new Set(input.deleted ?? [])].sort();
  const exempt = new Set(input.exempt ?? []);
  const runtime = changed.filter((path) => isRuntimeSource(path) && !exempt.has(path));
  const touchedPaths = [...changed.filter((path) => !exempt.has(path)), ...deleted];

  // unit (any file) -> the changed paths its import closure contains.
  const reachedBy = new Map<string, Set<string>>();
  const credit = (from: Iterable<string>, paths: readonly string[]): void => {
    for (const file of reverseReach(input.graph, from)) {
      let into = reachedBy.get(file);
      if (into === undefined) reachedBy.set(file, (into = new Set()));
      for (const path of paths) into.add(path);
    }
  };
  for (const path of touchedPaths) credit([path], [path]);
  for (const [file, unresolved] of input.graph.opaque) {
    const scopes = opaqueScopes(file, unresolved, input.workspaces);
    const matched = touchedPaths.filter((path) => scopes.some((scope) => path.startsWith(scope)));
    if (matched.length > 0) credit([file], matched);
  }
  const testedBy = new Map<string, string[]>();
  for (const test of input.testFiles) {
    for (const path of reachedBy.get(test) ?? []) testedBy.set(path, [...(testedBy.get(path) ?? []), test]);
  }

  const tests = new Set<string>();
  for (const file of changed) for (const test of ownTests(file, input.testFiles)) tests.add(test);
  for (const test of input.testFiles) if (reachedBy.has(test)) tests.add(test);

  const typechecks: string[] = [];
  for (const file of touchedPaths) {
    const workspace = workspaceOf(file, input.workspaces);
    if (workspace?.checkTypes === true && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
  }
  // `scripts/` is not a workspace but carries its own tsconfig and `check-types`; a script type
  // error used to reach CI because no step here ran it.
  if (!typechecks.includes("scripts") && touchedPaths.some((path) => path.startsWith("scripts/") && SOURCE_FILE.test(path) && !DECLARATION.test(path))) {
    typechecks.push("scripts");
  }

  // A game is reached by its own files and by every engine file its import graph contains: an
  // engine change type-checks each game whose program includes it. A game's own change also runs
  // its whole suite, since its tests read its scene and data files from disk.
  for (const workspace of input.workspaces) {
    if (!GAME_DIR.test(workspace.dir)) continue;
    const prefix = `${workspace.dir}/`;
    const touched = touchedPaths.some((path) => path.startsWith(prefix));
    const imports = !touched && [...reachedBy.keys()].some((file) => file.startsWith(prefix) && !isTestFile(file));
    if (!touched && !imports) continue;
    if (workspace.checkTypes && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
    if (touched) for (const test of input.testFiles) if (test.startsWith(prefix)) tests.add(test);
  }

  // A file no test reaches is still covered when its package's whole suite runs: that is the suite
  // CI runs for it. Only a file outside every tested package (a root script) stays unattributed.
  const unattributed: string[] = [];
  const suites: string[] = [];
  for (const path of runtime) {
    if (ownTests(path, input.testFiles).length > 0 || (testedBy.get(path) ?? []).length > 0) continue;
    const workspace = workspaceOf(path, input.workspaces);
    const suite = workspace === null ? [] : input.testFiles.filter((test) => test.startsWith(`${workspace.dir}/`));
    if (suite.length === 0) {
      unattributed.push(path);
      continue;
    }
    for (const test of suite) tests.add(test);
    if (!suites.includes(workspace!.dir)) suites.push(workspace!.dir);
  }

  const reached = new Set(reachedBy.keys());
  // Only a game the load check can boot: llmville and folders without a web entry have none.
  const loadable = new Set(siteGames());
  const boots = bootsFor(changed, reached).filter((game) => loadable.has(game));

  const inputs: Record<string, string[]> = {};
  for (const test of tests) inputs[`test:${test}`] = unitInputs(input.graph, [test], workspaceOf(test, input.workspaces)?.dir ?? null);
  for (const dir of typechecks) inputs[`typecheck:${dir}`] = unitInputs(input.graph, sourcesUnder(input.graph, dir), dir);
  for (const game of boots) inputs[`boot:${game}`] = unitInputs(input.graph, sourcesUnder(input.graph, `games/${game}`), `games/${game}`, ["games/shared"]);

  return {
    changed,
    deleted,
    typechecks: typechecks.sort(),
    tests: [...tests].sort(),
    gates: gatesFor(changed),
    unattributed,
    suites: suites.sort(),
    boots,
    inputs,
  };
}

/**
 * What a lane runs when a generated file is stale, and what that command rewrites. The
 * generators name their own script; this names the one command that runs every generator
 * in dependency order, so a lane that added an export fixes the manifest, `api.md` and the
 * baselines in one go instead of discovering the next stale file in CI.
 */
export const GATE_FIX: Readonly<Record<string, string>> = {
  "export-manifest":
    "bun run gen  (rewrites scripts/export-manifest.json from the public subpaths the build will emit)",
  "skill-api":
    "bun run gen  (rewrites .claude/skills/*/api.md and prunes scripts/api-doc-baseline.json and scripts/api-orphan-baseline.json)",
};

/** Arguments a gate needs after its script name, as CI passes them. */
const GATE_ARGS: Readonly<Record<string, readonly string[]>> = {
  "games-capabilities": ["--summary"],
};

/** Rough seconds per gate on this PC (2026-10-24), so the 21 s check starts before the 1 s ones. */
const GATE_COST: Readonly<Record<string, number>> = {
  "skill-api": 21,
};

/** Test files above this many per process split across lanes: one `bun test` runs its files one after another. */
export const TESTS_PER_LANE = 10;

/**
 * Measured seconds of tests per process. The lanes run the heaviest step first, so chunks this
 * size pack around the type-checks instead of one long process holding the run's tail.
 */
export const TEST_CHUNK_SECONDS = 30;

/** Rough seconds a test file costs when nothing better is known; a browser scenario costs far more. */
function guessedTestCost(file: string): number {
  return SHARD_I_MEASURED_COST[file] ?? (/\.browser\.test\./.test(file) ? 15 : 1);
}

/** Seconds each test file took when it last ran here, read from `bun test`'s junit report. */
export function junitCosts(xml: string): Record<string, number> {
  const costs: Record<string, number> = {};
  // A file's own suite carries `file=` and no `line=`; its describe blocks carry both.
  for (const match of xml.matchAll(/<testsuite\s[^>]*>/g)) {
    const tag = match[0];
    if (/\sline="/.test(tag)) continue;
    const file = /\sfile="([^"]+)"/.exec(tag)?.[1];
    const time = Number(/\stime="([^"]+)"/.exec(tag)?.[1]);
    if (file !== undefined && Number.isFinite(time)) costs[file.replaceAll("\\", "/")] = time;
  }
  return costs;
}

export interface FastOptions {
  /** Also run `check skill-api`. */
  skillApi?: boolean;
  /** Only the type-checks and gates: no tests, boots or load guard. */
  cheap?: boolean;
  /** Lanes the steps share; the tests split into at most this many processes. */
  lanes?: number;
  /** True when this unit passed before with the same `inputs`; it is not run again. */
  fresh?: (unit: string, inputs: readonly string[]) => boolean;
  /** Measured seconds per test file, so the processes split by time rather than by count. */
  testCosts?: Readonly<Record<string, number>>;
  /** Where each test process writes its junit report (`<dir>/tests-<n>.xml`), for `testCosts`. */
  reportDir?: string;
}

/**
 * The commands `bun run verify:fast` runs for a plan. `check skill-api` waits for `--skill-api`.
 * Every step lists the units it settles (`units`), so a pass is remembered per unit and a unit
 * whose inputs did not change since it passed is left out.
 */
export function fastSteps(plan: Plan, options: FastOptions = {}): Step[] {
  const fresh = options.fresh ?? ((): boolean => false);
  const lanes = Math.max(1, options.lanes ?? DEFAULT_JOBS);
  const unit = (id: string, inputs: readonly string[] = plan.inputs[id] ?? [WHOLE_TREE]): Unit => ({ id, inputs });
  const steps: Step[] = [];
  for (const dir of plan.typechecks) {
    const settles = unit(`typecheck:${dir}`);
    if (fresh(settles.id, settles.inputs)) continue;
    steps.push({ name: `typecheck ${dir}`, command: ["bun", `--cwd=${dir}`, "run", "check-types"], cost: 12, first: true, units: [settles] });
  }

  const tests = plan.tests.map((file) => unit(`test:${file}`)).filter((settles) => !fresh(settles.id, settles.inputs));
  if (tests.length > 0) {
    const files = tests.map((settles) => settles.id.slice("test:".length));
    // Each file also pays its imports, which the junit time leaves out.
    const cost = Object.fromEntries(files.map((file) => [file, options.testCosts?.[file] !== undefined ? options.testCosts[file]! + 0.5 : guessedTestCost(file)]));
    const total = files.reduce((sum, file) => sum + cost[file]!, 0);
    const byCount = Math.min(lanes, Math.ceil(files.length / TESTS_PER_LANE));
    const byTime = Math.min(lanes * 3, Math.ceil(total / TEST_CHUNK_SECONDS));
    const parts = Math.min(files.length, Math.max(1, byCount, byTime));
    const groups = splitByCost(files, cost, parts).filter((group) => group.length > 0);
    groups.forEach((group, index) => {
      const label = groups.length === 1 ? `test ${group.length} file(s)` : `test ${group.length} file(s) (${index + 1}/${groups.length})`;
      steps.push({
        name: label,
        command: [
          "bun",
          "test",
          "--timeout",
          "20000",
          ...(options.reportDir === undefined ? [] : ["--reporter=junit", `--reporter-outfile=${options.reportDir}/tests-${index + 1}.xml`]),
          ...[...group].sort(),
        ],
        cost: group.reduce((sum, file) => sum + (cost[file] ?? 1), 0),
        units: tests.filter((settles) => group.includes(settles.id.slice("test:".length))),
      });
    });
  }

  const gates = options.skillApi === true ? plan.gates : plan.gates.filter((gate) => gate !== "skill-api");
  for (const gate of gates) {
    const extra = GATE_ARGS[gate] ?? [];
    // A gate reads the whole tree.
    const settles = unit(`gate:${gate}`, [WHOLE_TREE]);
    if (fresh(settles.id, settles.inputs)) continue;
    const check = findCheck(gate);
    if (check === undefined) throw new Error(`verify:fast: gate ${gate} is not in the check table (scripts/run-stages.ts)`);
    steps.push({ name: gate, command: [...checkCommand(check), ...extra], fix: GATE_FIX[gate], cost: GATE_COST[gate], first: true, units: [settles] });
  }

  const boots = plan.boots.map((game) => unit(`boot:${game}`)).filter((settles) => !fresh(settles.id, settles.inputs));
  // The same games, timed cold against the load baseline (`bun run shoot --load --guard`): a change
  // that makes a game freeze or reach its scene slower fails here, since CI has no GPU to see it.
  const loads = plan.boots.map((game) => unit(`load:${game}`, plan.inputs[`boot:${game}`])).filter((settles) => !fresh(settles.id, settles.inputs));
  const linked = [...new Set([...boots, ...loads].map((settles) => settles.id.slice(settles.id.indexOf(":") + 1)))];
  const provision = `provision ${linked.join(" ")}`;
  // Link (or, once per machine, download) the packs first, so the boot reads real models.
  if (linked.length > 0) steps.push({ name: provision, command: ["bun", "games/scripts/provision-assets.ts", ...linked], cost: 2 });
  if (boots.length > 0) {
    const games = boots.map((settles) => settles.id.slice("boot:".length));
    // Beside the tests, not after them: the probe's deadline counts from when the page stops
    // loading, so a busy machine makes it slower, never red.
    steps.push({
      name: `boot probe ${games.join(" ")}`,
      command: ["bun", "games/scripts/capabilities-probe.ts", ...games],
      needs: [provision],
      cost: 40,
      units: boots,
    });
  }
  if (loads.length > 0) {
    const games = loads.map((settles) => settles.id.slice("load:".length));
    // Alone on the machine: a neighbour's browser or build would read as a slower load.
    steps.push({
      name: `load guard ${games.join(" ")}`,
      command: ["bun", "scripts/load-check.ts", ...games, "--guard"],
      needs: [provision],
      exclusive: true,
      cost: 90,
      units: loads,
    });
  }
  return options.cheap === true ? steps.filter((step) => step.first === true) : steps;
}

/** The paths whose change turns on CI's frame and smoke gates, from the same map the workflow calls. */
export function heavyPaths(_root: string): RegExp {
  return scopePattern();
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
 * Shard i is the one `test` job that prepares a build before its
 * tests, and on Windows its 74 files take 136 s alone - longer than any other step and
 * past the two minutes this command is meant to stay under. `scripts/test-shard.ts`
 * still owns which files shard i runs (this asks it with `--print i`), and the list runs
 * as two halves with the build as its own step.
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
    ...halves.map((half, index) => ({
      name: `test shard i (${index + 1}/${halves.length}, ${half.length} files)`,
      command: ["bun", "test", "--timeout", "20000", ...half],
      needs: ["build"],
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
 * steps that read a built `dist`, and shard i's tests, wait for `build`.
 */
export async function fullSteps(root: string, changed: readonly string[]): Promise<Step[]> {
  // Costs are the seconds each step took here at `--jobs 8` (2026-10-23); only start order
  // depends on them. Trivial gates have none.
  const build = { name: "build", command: ["bun", "run", "build"], cost: 10 };
  const steps: Step[] = [build];
  for (const check of jobChecks("quick")) {
    steps.push({
      name: check.name,
      command: checkCommand(check),
      ...(check.needsBuild === true ? { needs: [build.name] } : {}),
      ...(check.name === "scaffold-launch" ? { exclusive: true } : {}),
      ...(GATE_COST[check.name] !== undefined ? { cost: GATE_COST[check.name] } : {}),
      ...(GATE_FIX[check.name] !== undefined ? { fix: GATE_FIX[check.name] } : {}),
    });
  }

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
  // build or browser reads as a regression: CI gives `perf timing` its own runner.
  steps.push({ name: "perf-cpu", command: ["bun", "scripts/bench-cpu.ts"], exclusive: true, cost: 15 });
  // `windows-tests` (`bun --cwd=packages/jgengine run test`) is not a step here. That job
  // exists in CI because the `test` shards run on ubuntu and cannot see a Windows-only
  // failure; on this machine shard e already runs all 30 of its files, so repeating it cost
  // 150 s of a local run for no extra coverage. `scripts/test-shard.test.ts` keeps a test
  // file under those roots from falling outside every shard.

  if (changed.some((path) => heavyPaths(root).test(path))) {
    const { SMOKE_GAMES } = (await import("./smoke-games")) as { SMOKE_GAMES: readonly string[] };
    const { PERF_GATE_GAMES } = (await import("./perf-gate")) as { PERF_GATE_GAMES: readonly string[] };
    // The smoke games boot one at a time inside one smoke-games run, so each keeps its own step
    // and its own process. Scripts are called directly, never through a guarded `&&` chain:
    // scripts/guard.ts's win32 pass-through runs only the chain's first command and exits 0.
    // The frame gate measures games concurrently itself, so one step with every game gives
    // one lane the wall of the slowest game; `--jobs` bounds it for a machine that cannot
    // hold eight browsers.
    for (const game of SMOKE_GAMES) {
      steps.push({ name: `smoke ${game}`, command: ["bun", "scripts/smoke-games.ts", "--games", game], browser: true, cost: 60 });
    }
    steps.push({
      name: `perf gate (${PERF_GATE_GAMES.length} games)`,
      command: ["bun", "scripts/perf-gate.ts", "--jobs", String(PERF_GATE_GAMES.length)],
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

async function run(step: Step, root: string, signal?: AbortSignal): Promise<StepResult> {
  const started = Date.now();
  if (signal?.aborted === true) return { name: step.name, ok: false, ms: 0, output: "stopped before it started", stopped: true };
  const proc = Bun.spawn(step.command, { cwd: root, stdout: "pipe", stderr: "pipe" });
  // A fail-fast run stops what is still running; a browser or dev server the step started goes with it.
  let killed = false;
  const stop = (): void => {
    killed = true;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 15_000 });
    else proc.kill("SIGKILL");
  };
  signal?.addEventListener("abort", stop, { once: true });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  signal?.removeEventListener("abort", stop);
  if (killed && code !== 0) {
    return { name: step.name, ok: false, ms: Date.now() - started, output: "stopped: another step failed first", stopped: true };
  }
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

/** Each failing file with its first error, and the whole output in a UTF-8 log under `.scratch/verify-fast/`. */
function printFailure(root: string, step: string, output: string): void {
  const log = writeStepLog(root, "verify-fast", step, output);
  for (const line of digestLines(output, relPosix(root, log))) console.log(line);
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
  const skillApi = argv.includes("--skill-api");
  const cheap = argv.includes("--cheap");
  const started = Date.now();
  // A failure, its fix and the total always print; the plan, each pass and the cache notes are
  // kept for --verbose, and for --plan, whose whole point is to show them.
  const say = (line: string): void => console.log(line);
  const note = planOnly || isVerbose() ? say : (): void => {};

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
    note(`verify:fast --full: ${steps.length} step(s), what CI runs for ${changed.length} changed file(s)`);
    note(`  ${Math.min(jobs, steps.length)} at a time in this checkout, the same work CI runs as parallel jobs.`);
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
        (result.ok ? note : say)(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${(result.ms / 1000).toFixed(1)}s${suffix}`);
        if (!result.ok && result.blockedBy === undefined) printFailure(root, step.name, result.output);
        if (!result.ok && result.blockedBy === undefined && step.fix !== undefined) console.log(`  fix: ${step.fix}`);
        return result;
      }),
    );
    for (const result of runs) if (!result.ok) failures.push(result.name);
    const seconds = (Date.now() - started) / 1000;
    console.log(`\ntotal ${seconds.toFixed(1)}s — ${steps.length - failures.length} passed, ${failures.length} failed`);
    if (failures.length > 0) console.log(`failed: ${failures.join(", ")}`);
    return failures.length === 0 ? EXIT_VERIFIED : EXIT_FAILED;
  }

  const allWorkspaces = workspaces(root);
  const tree = repoFiles(root);
  const graph = buildImportGraph(root, tree, {
    packages: allWorkspaces.flatMap((workspace) => (workspace.name === undefined ? [] : [{ name: workspace.name, dir: workspace.dir }])),
  });
  const plan = verifyPlan({
    changed,
    deleted: deletedFiles(root, base),
    testFiles: walkTestFiles(root, [...TEST_ROOTS, "games"]),
    workspaces: allWorkspaces,
    graph,
    exempt: pureRenames(root, base),
  });
  const cache = argv.includes("--no-cache")
    ? null
    : openPassCache({
        file: join(root, ".scratch", "verify-fast", "passed.json"),
        // Unstaged and untracked files are hashed; everything else is the index's own blob id.
        digest: treeDigests(root, [...names(git(root, ["diff", "--name-only"])), ...names(git(root, ["ls-files", "--others", "--exclude-standard"]))]),
        tree: () => tree,
      });
  const skipped: string[] = [];
  const costFile = join(root, ".scratch", "verify-fast", "test-costs.json");
  const reportDir = ".scratch/verify-fast/junit";
  let testCosts: Record<string, number> = {};
  try {
    testCosts = JSON.parse(readFileSync(costFile, "utf8")) as Record<string, number>;
  } catch {
    testCosts = {};
  }
  rmSync(join(root, reportDir), { recursive: true, force: true });
  mkdirSync(join(root, reportDir), { recursive: true });
  const steps = fastSteps(plan, {
    skillApi,
    cheap,
    lanes: DEFAULT_JOBS,
    testCosts,
    reportDir,
    fresh: (unit, inputs) => {
      const hit = cache?.fresh(unit, inputs) === true;
      if (hit) skipped.push(unit);
      return hit;
    },
  });
  const remember = (passed: readonly StepResult[]): void => {
    for (const report of existsSync(join(root, reportDir)) ? readdirSync(join(root, reportDir)) : []) {
      Object.assign(testCosts, junitCosts(readFileSync(join(root, reportDir, report), "utf8")));
    }
    writeFileSync(costFile, `${JSON.stringify(testCosts)}
`, "utf8");
    if (cache === null) return;
    for (const result of passed) {
      if (!result.ok) continue;
      for (const settled of steps.find((step) => step.name === result.name)?.units ?? []) cache.record(settled.id, settled.inputs);
    }
    cache.save();
  };

  if (json) {
    if (plan.unattributed.length > 0) {
      reportUnattributed(plan);
      console.log(JSON.stringify(jsonReport([{ name: "attribution", ok: false, ms: 0 }], Date.now() - started)));
      return EXIT_FAILED;
    }
    const results: StepResult[] = [];
    const code = await jsonRun(steps, {
      run: async (step) => {
        const result = await run(step, root);
        results.push(result);
        return result;
      },
      started,
    });
    remember(results);
    return code;
  }

  const leftOutSkillApi = !skillApi && plan.gates.includes("skill-api");
  note(
    `verify:fast against ${base}: ${plan.changed.length} changed file(s), ${plan.tests.length} test file(s), ${plan.typechecks.length} type-check(s), ${plan.gates.length - (leftOutSkillApi ? 1 : 0)} gate(s), boot ${plan.boots.join(" ") || "none"}  (planned in ${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  if (cheap) note("verify:fast --cheap: type-checks and gates only; the tests and boots run when lane:close lands");
  if (plan.suites.length > 0) {
    note(`verify:fast: whole suite of ${plan.suites.join(", ")}: a changed file there has no test of its own, so its package's tests cover it`);
  }
  if (leftOutSkillApi) {
    note("verify:fast: check skill-api (21 s) is left out here; `--skill-api` runs it, and the `bun run gen` that lane:close and preflight run regenerates it.");
  }
  if (skipped.length > 0) {
    note(`verify:fast: ${skipped.length} unit(s) passed before with these exact inputs and are not run again (--no-cache runs them): ${summarizeUnits(skipped)}`);
  }
  if (planOnly) {
    printPlan(plan, steps);
    return plan.unattributed.length === 0 ? EXIT_VERIFIED : EXIT_UNATTRIBUTED;
  }
  if (plan.unattributed.length > 0) {
    reportUnattributed(plan);
    return EXIT_UNATTRIBUTED;
  }

  // The type-checks and gates start first and the run stops at the first failure, so a type
  // error or a drifted file is named in seconds and the tests behind it never start. Each
  // result prints the moment it is known.
  const results = await runSteps(
    steps,
    DEFAULT_JOBS,
    async (step, signal) => {
      const result = await run(step, root, signal);
      if (result.stopped === true) return result;
      (result.ok ? note : say)(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  ${(result.ms / 1000).toFixed(1)}s`);
      if (!result.ok) {
        if (result.output.length > 0) printFailure(root, result.name, result.output);
        if (step.fix !== undefined) console.log(`  fix: ${step.fix}`);
      }
      return result;
    },
    { failFast: true },
  );
  remember(results);
  const failures = results.filter((result) => !result.ok && result.blockedBy === undefined && result.stopped !== true).map((result) => result.name);
  const notRun = results.filter((result) => result.blockedBy !== undefined || result.stopped === true).map((result) => result.name);
  const seconds = (Date.now() - started) / 1000;
  const passed = results.length - failures.length - notRun.length;
  console.log(`\ntotal ${seconds.toFixed(1)}s — ${passed} passed, ${failures.length} failed${notRun.length > 0 ? `, ${notRun.length} not run` : ""}`);
  if (failures.length > 0) {
    console.log(`failed: ${failures.join(", ")}`);
    if (notRun.length > 0) {
      const named = notRun.slice(0, 4).join(", ");
      console.log(`not run, because the run stops at the first failure: ${named}${notRun.length > 4 ? ` and ${notRun.length - 4} more` : ""}`);
    }
    console.log("verify:fast ran only what this change reaches. `bun run verify:fast --full` runs what CI runs.");
    return EXIT_FAILED;
  }
  return EXIT_VERIFIED;
}

if (import.meta.main) {
  const argv = takeVerboseFlag(process.argv.slice(2));
  if (printHelpIfAsked("verify-fast", VERIFY_FAST_USAGE, argv)) process.exit(EXIT_VERIFIED);
  assertCheckoutReady("verify:fast");
  process.exit(await main(argv));
}
