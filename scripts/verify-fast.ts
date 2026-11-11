// A lane's own change used to cost a whole suite (about 1,100 test files) or a
// Chrome drive to check, so verifying one file took as long as verifying the
// repository. This maps what the branch changed to the packages that own it, the
// tests that can reach it and the cheap static gates the `quick` CI job runs, then
// runs only those.
//
//   bun run verify:fast              # the loop while iterating, and what lane:close runs
//   bun run verify:fast --full       # everything CI runs; reproduce CI failures
//   bun run verify:fast --plan       # the steps and their commands, nothing run
//   bun run verify:fast --json       # one { ok, ms, checks } document on stdout
//   bun run verify:fast --cheap      # only the type-checks and gates: what `bun run preflight` runs
//
// The type-checks and gates start before the tests, and the run stops at the first failure: a
// type error is reported in seconds instead of after minutes of tests that were never the problem.
// `--cheap` (the landing's preflight) runs every gate CI's quick and types jobs run and reports
// every failure in one pass instead.
//
// A passing run records the working tree's id in its receipt. A later run on the same tree, against
// the same merge base, with no more to prove, prints one line naming that receipt and runs nothing:
// a hand run that passed is the landing's proof, and lane:close does not pay for it again.
//
// Exit: 0 verified, 1 a step failed. A change no test can be attributed to (a root config, the lockfile, a source
// file under no tested root) runs every test file and type-check; `--plan` names it.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { assertCheckoutReady } from "./checkout-ready";
import { digestLines, failureDigest, writeStepLog } from "./failure-digest";
import { FRAME_GAMES, REPRESENTATIVE_GAME, scopePattern } from "./ci-scope";
import { buildImportGraph, closure, repoFiles, reverseReach, type ImportGraph } from "./import-graph";
import { openPassCache, saveTestCosts, sharedVerifyDir, treeDigests, WHOLE_TREE } from "./verify-cache";
import { checkCommand, findCheck, GEN_TARGETS, jobChecks, readsPath, reachedBy, type CheckDef } from "./run-stages";
import { printHelpIfAsked } from "./script-help";
import { isVerbose, takeVerboseFlag } from "./verbosity";
import { siteGames } from "./siteGames";
import { runSteps, type ScheduledStep, type StepResult } from "./stepScheduler";
import { TEST_ROOTS, walkTestFiles } from "./test-shard";
import { createVerifyReceipt, passingReceipt, workingTree, type ReuseKey } from "./verify-receipt";

const VERIFY_FAST_USAGE = {
  summary: "run only the tests and static gates this branch's diff reaches, in seconds",
  usage: "bun run verify:fast [--full] [--cheap] [--landing] [--plan] [--json] [--base <ref>] [--jobs <n>] [--skill-api] [--no-cache] [--verbose]",
  flags: [
    { flag: "--full", detail: "what CI runs; use to reproduce a CI failure" },
    { flag: "--cheap", detail: "only the type-checks and gates, no tests or boots; `bun run preflight` runs this" },
    { flag: "--landing", detail: "also build the site and check its bundle budgets when the change reaches them; `bun run lane:close` runs this, and reuses a passing --landing run of the same tree" },
    { flag: "--plan", detail: "print the steps and their commands, run nothing" },
    { flag: "--json", detail: "one { ok, ms, checks } document on stdout" },
    { flag: "--base <ref>", detail: "diff against this ref (default: origin/beta)" },
    { flag: "--jobs <n>", detail: "steps to run at once (default: half the cores, at most 6)" },
    { flag: "--skill-api", detail: "also run `check skill-api`, the 21 s generated api.md check (`bun run gen` regenerates it before a landing)" },
    { flag: "--no-cache", detail: "run every unit, including those that passed before with the same inputs, and never reuse a passing run of the same tree" },
    { flag: "--verbose", detail: "also print the plan, each PASS line and the cache notes (by default only failures and the total)" },
  ],
  example: "bun run verify:fast --plan",
  exits: [
    "0 verified",
    "1 a step failed",
    "78 this checkout has no node_modules - run bun install, or bun run agent:bootstrap",
  ],
} as const;

export const BASE = "origin/beta";
export const EXIT_VERIFIED = 0;
export const EXIT_FAILED = 1;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const RUNTIME_ROOTS = [/^packages\/[^/]+\/src\//, /^apps\/[^/]+\/src\//, /^scripts\/.+\.[cm]?tsx?$/, /^games\/[^/]+\/src\//];
const GAME_DIR = /^games\/[^/]+$/;
/** Root files every program reads: a change to one is attributable to no test in particular. */
const ROOT_CONFIG = /^(package\.json|bun\.lock|bunfig\.toml|tsconfig(\.[^/]+)?\.json)$/;
/** A workspace's own manifest and compiler settings, relative to the workspace. */
const WORKSPACE_CONFIG = /^(package\.json|bunfig\.toml|tsconfig(\.[^/]+)?\.json)$/;
/** Prose: read by people and by the gates that plan by path, never compiled or imported by a test. */
const DOC_FILE = /\.(md|mdx|txt)$/i;
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
  /** The units this step settles; each is remembered as passed when the step passes, and a test file also when its own tests all passed in a step that failed. */
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
export const DEFAULT_JOBS = Math.max(2, Math.min(4, Math.floor(availableParallelism() / 2)));

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
  /** Changed paths no test can be attributed to (root configs, lockfile, `unattributed`): every test file and type-check runs. */
  fallback: string[];
  /** Workspaces whose whole suite runs because a changed file in them has no test of its own. */
  suites: string[];
  /**
   * Games booted on this machine with their packs linked from the shared asset store. CI never
   * boots a game, so this is the only place a boot regression is caught before merge.
   */
  boots: string[];
  /**
   * `--landing` only: build the site and hold each game's download to its budget, as CI's web-build
   * job did for every PR (a game's first download over budget, and a build that broke, reached it).
   */
  webBuild: boolean;
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
 * already runs in CI, so running it here never invents a rule.
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
  const gates = new Set(["artifacts", "path-portability", "layers", "games-save-states", "games-sync"]);
  if (changed.some((path) => path.startsWith("packages/"))) gates.add("skill-api");
  return [...gates].filter((gate) => gate === "skill-api" || keepGate(gate, changed));
}

/**
 * The checks that only compare a committed file with its generator. `bun run gen` rewrites those
 * files when lane:close lands, so a lane never fails on one going stale while it works.
 */
export const GENERATED_GATES: ReadonlySet<string> = new Set(GEN_TARGETS.map((target) => target.name).filter((name) => findCheck(name)?.generated === true));

/** A gate runs when the diff reaches what it reads and it is not a generated-file comparison. */
function keepGate(name: string, changed: readonly string[]): boolean {
  const check = findCheck(name);
  return check !== undefined && !GENERATED_GATES.has(name) && reachedBy(check, changed);
}

/**
 * The `quick` and `types` CI checks preflight never runs, each with the reason. Every other check
 * those jobs run, preflight runs once on any code change (`landingGates`), so a gate that would
 * fail in CI fails at the landing first and every one is named in the same run. A new check in
 * those jobs either runs at the landing or is listed here (verify-fast.test.ts holds the pair).
 */
export const CI_ONLY_GATES: Readonly<Record<string, string>> = {
  types: "verify:fast type-checks every package the change reaches instead of the whole repository",
  capabilities: "bun run gen rewrites capabilities.md first in preflight",
  "source-paths": "bun run gen rewrites the tsconfig paths first in preflight",
  "skill-api": "bun run gen rewrites api.md first in preflight",
  "export-manifest": "bun run gen rewrites the export manifest first in preflight",
  "games-ledger": "bun run gen rewrites games/capabilities.json first in preflight",
};

const CODE_PATH = /^(packages|games|scripts|apps|examples|registry)\/.+\.(?:[cm]?[jt]sx?|json)$/;

/**
 * Every check CI's `quick` and `types` jobs run that is not in `CI_ONLY_GATES`, when the change
 * touches code or a package manifest. While iterating, `gatesFor` keeps the inner loop to seconds;
 * the landing pays the rest once, in parallel, instead of learning about them one CI run at a time.
 */
export function landingGates(changed: readonly string[]): string[] {
  const iterating = gatesFor(changed);
  if (!changed.some((path) => CODE_PATH.test(path) || basename(path) === "package.json")) return iterating;
  const ci = [...jobChecks("quick"), ...jobChecks("types")].map((check) => check.name);
  // skill-api stays in the iteration set only for `--skill-api`; the landing leaves it to gen.
  return [...new Set([...iterating.filter((name) => name !== "skill-api"), ...ci.filter((name) => CI_ONLY_GATES[name] === undefined && keepGate(name, changed))])];
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
  /** What `lane:close` runs: also the site build and its bundle budgets when the change reaches them. */
  landing?: boolean;
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
    // An import the graph cannot follow may name any code in its scope, never prose.
    const matched = touchedPaths.filter((path) => !DOC_FILE.test(path) && scopes.some((scope) => path.startsWith(scope)));
    if (matched.length > 0) credit([file], matched);
  }
  const testedBy = new Map<string, string[]>();
  for (const test of input.testFiles) {
    for (const path of reachedBy.get(test) ?? []) testedBy.set(path, [...(testedBy.get(path) ?? []), test]);
  }

  const tests = new Set<string>();
  for (const file of changed) for (const test of ownTests(file, input.testFiles)) tests.add(test);
  for (const test of input.testFiles) if (reachedBy.has(test)) tests.add(test);

  // Prose no compiler or test reads: a game's README or PLAN edit used to type-check the game and run
  // its whole suite plus every cross-game suite. A test that imports one (`?raw`) still reaches it
  // through the graph above, and each gate still plans by what it reads.
  const codePaths = touchedPaths.filter((path) => !DOC_FILE.test(path));
  const typechecks: string[] = [];
  for (const file of codePaths) {
    const workspace = workspaceOf(file, input.workspaces);
    if (workspace?.checkTypes === true && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
  }
  // `scripts/` is not a workspace but carries its own tsconfig and `check-types`; a script type
  // error used to reach CI because no step here ran it.
  if (!typechecks.includes("scripts") && touchedPaths.some((path) => path.startsWith("scripts/") && SOURCE_FILE.test(path) && !DECLARATION.test(path))) {
    typechecks.push("scripts");
  }

  // A workspace is reached by its own files and by every file its import graph contains: an engine
  // change type-checks each package, app and game whose program includes it, since each compiles
  // the engine's source under its own settings (an unused local the engine's own check allows fails
  // the shell's, as CI's types job runs every one). A game's own change also runs its whole suite,
  // since its tests read its scene and data files from disk.
  for (const workspace of input.workspaces) {
    const prefix = `${workspace.dir}/`;
    const touched = codePaths.some((path) => path.startsWith(prefix));
    const imports = !touched && [...reachedBy.keys()].some((file) => file.startsWith(prefix) && !isTestFile(file) && !DOC_FILE.test(file));
    if (!touched && !imports) continue;
    if (workspace.checkTypes && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
    if (touched && GAME_DIR.test(workspace.dir)) for (const test of input.testFiles) if (test.startsWith(prefix)) tests.add(test);
  }

  // A file no test reaches is still covered when its package's whole suite runs: that is the suite
  // CI runs for it. Only a file under no tested root at all stays unattributed, and the run says so
  // rather than passing it.
  const unattributed: string[] = [];
  const suites: string[] = [];
  const addSuite = (dir: string, match: (test: string) => boolean = (test) => test.startsWith(`${dir}/`)): void => {
    for (const test of input.testFiles) if (match(test)) tests.add(test);
    if (!suites.includes(dir)) suites.push(dir);
  };
  // Reach the graph cannot see, each found by PR CI after this command had passed (7 Nov audit):
  // - a root script's tests reach other scripts by spawning them, so any script change runs every
  //   `scripts/` test (CI's shard i): a capture flag change broke captureCliParity's spawned run;
  // - a package's tests read its data files from disk, so a changed non-source file in a package
  //   runs that package's suite: a material manifest edit broke assets' verifyData;
  // - the games' own scripts and the `*.games.test.ts` checks read every game from disk, so a game
  //   change runs them, as CI's games job does: a game's PLAN broke the suite score check.
  if (touchedPaths.some((path) => path.startsWith("scripts/") && SOURCE_FILE.test(path) && !DECLARATION.test(path))) addSuite("scripts");
  for (const path of touchedPaths) {
    const workspace = workspaceOf(path, input.workspaces);
    if (workspace === null || !CONTAINED.test(workspace.dir) || GAME_DIR.test(workspace.dir)) continue;
    if ((!SOURCE_FILE.test(path) || DECLARATION.test(path)) && !path.endsWith(".md")) addSuite(workspace.dir);
  }
  if (codePaths.some((path) => /^games\/[^/]+\//.test(path))) {
    for (const dir of ["games/scripts", "games/shared"]) addSuite(dir);
    addSuite("*.games.test", (test) => /\.games\.test\.[cm]?[jt]sx?$/.test(test));
  }
  for (const path of runtime) {
    if (ownTests(path, input.testFiles).length > 0 || (testedBy.get(path) ?? []).length > 0) continue;
    const suiteDir = workspaceOf(path, input.workspaces)?.dir ?? (path.startsWith("scripts/") ? "scripts" : null);
    const suite = suiteDir === null ? [] : input.testFiles.filter((test) => test.startsWith(`${suiteDir}/`));
    if (suiteDir === null || suite.length === 0) {
      unattributed.push(path);
      continue;
    }
    for (const test of suite) tests.add(test);
    if (!suites.includes(suiteDir)) suites.push(suiteDir);
  }
  // A workspace's own package.json or tsconfig changes how every file in it resolves and compiles,
  // which no import shows: its whole suite runs.
  for (const path of touchedPaths) {
    const workspace = workspaceOf(path, input.workspaces);
    if (workspace === null || !WORKSPACE_CONFIG.test(path.slice(workspace.dir.length + 1))) continue;
    for (const test of input.testFiles) if (test.startsWith(`${workspace.dir}/`)) tests.add(test);
    if (!suites.includes(workspace.dir)) suites.push(workspace.dir);
  }
  // A change no test can be attributed to falls back to the full set: a root config or lockfile
  // reaches every program, and a source file under no tested root reaches nothing the graph knows.
  // Before this, a root tsconfig or bun.lock change planned no test at all and reported "verified".
  const fallback = [...touchedPaths.filter((path) => ROOT_CONFIG.test(path)), ...unattributed];
  if (fallback.length > 0) {
    for (const test of input.testFiles) tests.add(test);
    for (const workspace of input.workspaces) if (workspace.checkTypes && !typechecks.includes(workspace.dir)) typechecks.push(workspace.dir);
    if (!typechecks.includes("scripts")) typechecks.push("scripts");
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
    fallback,
    suites: suites.sort(),
    boots,
    webBuild: input.landing === true && reachesSite(touchedPaths),
    inputs,
  };
}

/** Whether a change can alter the built site: a source or asset under apps/, packages/ or games/, not a note. */
export function reachesSite(paths: readonly string[]): boolean {
  const check = findCheck("site-bundles");
  return check !== undefined && paths.some((path) => !path.endsWith(".md") && !isTestFile(path) && reachedBy(check, [path]));
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
    "bun run gen  (rewrites .claude/skills/*/api.md)",
};

/** The files whose bytes decide a gate: what its row reads. A row that names no paths reads the whole tree. */
export function gateInputs(check: CheckDef, files: readonly string[]): string[] {
  if (check.reads === undefined) return [WHOLE_TREE];
  return files.filter((file) => readsPath(check, file)).sort();
}

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

/**
 * The test files a junit report shows passing: every test in the file's own suite passed. A file
 * that failed to load, or a process that died before writing the report, is not in it.
 */
export function junitPassedFiles(xml: string): string[] {
  const passed: string[] = [];
  for (const match of xml.matchAll(/<testsuite\s[^>]*>/g)) {
    const tag = match[0];
    if (/\sline="/.test(tag)) continue;
    const file = /\sfile="([^"]+)"/.exec(tag)?.[1];
    if (file !== undefined && /\sfailures="0"/.test(tag) && !/\serrors="[1-9]/.test(tag)) passed.push(file.replaceAll("\\", "/"));
  }
  return passed;
}

export interface FastOptions {
  /** Also run `check skill-api`. */
  skillApi?: boolean;
  /** Only the type-checks and gates: no tests or boots. */
  cheap?: boolean;
  /** Lanes the steps share; the tests split into at most this many processes. */
  lanes?: number;
  /** True when this unit passed before with the same `inputs`; it is not run again. */
  fresh?: (unit: string, inputs: readonly string[]) => boolean;
  /** Measured seconds per test file, so the processes split by time rather than by count. */
  testCosts?: Readonly<Record<string, number>>;
  /** Where each test process writes its junit report (`<dir>/tests-<n>.xml`), for `testCosts`. */
  reportDir?: string;
  /** Every file in the checkout, so a gate's pass is keyed on the files its row reads; absent, on the whole tree. */
  tree?: readonly string[];
  /** Test files that read downloaded models (`modelTestFiles`): they get a step of their own, after the models are linked. */
  modelTests?: ReadonlySet<string>;
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
    // The tests named after the changed files, and the changed tests themselves, run first in a step
    // of their own: a break in `pick.ts` reaches a thousand files, the run stops at the first red,
    // and without this `pick.test.ts` sat in a chunk that never ran while the red named a loot table.
    const readers = files.filter((file) => options.modelTests?.has(file) === true);
    const plain = files.filter((file) => options.modelTests?.has(file) !== true);
    const own = new Set(plan.changed.flatMap((file) => ownTests(file, plain)));
    const rest = plain.filter((file) => !own.has(file));
    const testStep = (group: readonly string[], name: string, index: number, first: boolean): Step => ({
      name,
      command: [
        "bun",
        "test",
        "--timeout",
        "20000",
        ...(options.reportDir === undefined ? [] : ["--reporter=junit", `--reporter-outfile=${options.reportDir}/tests-${index}.xml`]),
        ...[...group].sort(),
      ],
      cost: group.reduce((sum, file) => sum + (cost[file] ?? 1), 0),
      ...(first ? { first: true } : {}),
      units: tests.filter((settles) => group.includes(settles.id.slice("test:".length))),
    });
    if (own.size > 0) steps.push(testStep([...own], `test ${own.size} own file(s)`, 0, true));
    // The files that read downloaded models run in one step of their own. A worktree starts with no
    // models: link (or, once per machine, download) the packs those tests read first, or every model
    // they check reads as missing. A test outside a game's folder gets every game's.
    if (readers.length > 0) {
      const isOwn = plan.changed.some((file) => ownTests(file, readers).length > 0);
      const owners = readers.map((file) => /^games\/([^/]+)\//.exec(file)?.[1]);
      const provision = owners.includes(undefined) ? [] : [...new Set(owners as string[])].sort();
      const provisionStep = `provision models for tests${provision.length > 0 ? ` ${provision.join(" ")}` : ""}`;
      steps.push({ name: provisionStep, command: ["bun", "games/scripts/provision-assets.ts", ...provision], cost: 2 });
      steps.push({ ...testStep(readers, `test ${readers.length} file(s) that read downloaded models`, 999, isOwn), needs: [provisionStep] });
    }
    if (rest.length > 0) {
      const total = rest.reduce((sum, file) => sum + cost[file]!, 0);
      const byCount = Math.min(lanes, Math.ceil(rest.length / TESTS_PER_LANE));
      const byTime = Math.min(lanes * 3, Math.ceil(total / TEST_CHUNK_SECONDS));
      const parts = Math.min(rest.length, Math.max(1, byCount, byTime));
      const groups = splitByCost(rest, cost, parts).filter((group) => group.length > 0);
      groups.forEach((group, index) => {
        const label = groups.length === 1 ? `test ${group.length} file(s)` : `test ${group.length} file(s) (${index + 1}/${groups.length})`;
        steps.push(testStep(group, label, index + 1, false));
      });
    }
  }

  const gates = options.skillApi === true ? plan.gates : plan.gates.filter((gate) => gate !== "skill-api");
  for (const gate of gates) {
    const check = findCheck(gate);
    if (check === undefined) throw new Error(`verify:fast: gate ${gate} is not in the check table (scripts/run-stages.ts)`);
    const args = [...(check.args ?? [])];
    const settles = unit(["gate:" + gate, ...args].join(" "), options.tree === undefined ? [WHOLE_TREE] : gateInputs(check, options.tree));
    if (fresh(settles.id, settles.inputs)) continue;
    steps.push({ name: gate, command: ["bun", check.script, ...args], fix: GATE_FIX[gate], cost: GATE_COST[gate], first: true, units: [settles] });
  }

  const boots = plan.boots.map((game) => unit(`boot:${game}`)).filter((settles) => !fresh(settles.id, settles.inputs));
  if (boots.length > 0) {
    const games = boots.map((settles) => settles.id.slice("boot:".length));
    const provision = `provision ${games.join(" ")}`;
    // Link (or, once per machine, download) the packs first, so the boot reads real models.
    steps.push({ name: provision, command: ["bun", "games/scripts/provision-assets.ts", ...games], cost: 2 });
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
  if (plan.webBuild) {
    const built = unit("web-build", [WHOLE_TREE]);
    const budget = unit("gate:site-bundles", [WHOLE_TREE]);
    if (!fresh(built.id, built.inputs) || !fresh(budget.id, budget.inputs)) {
      steps.push({ name: "web-build", command: ["bun", "--cwd=apps/web", "run", "build"], cost: 40, units: [built] });
      steps.push({ name: "site-bundles", command: ["bun", "run", "check", "site-bundles"], needs: ["web-build"], units: [budget] });
    }
  }
  return options.cheap === true ? steps.filter((step) => step.first === true && step.command[1] !== "test") : steps;
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
 * `web-build`, and the smoke boots when a changed path can reach them. CI runs these as parallel jobs on fresh runners;
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
  steps.push({ name: "site-bundles", command: ["bun", "run", "check", "site-bundles"], needs: ["web-build"] });
  // `windows-tests` (`bun --cwd=packages/jgengine run test`) is not a step here. That job
  // exists in CI because the `test` shards run on ubuntu and cannot see a Windows-only
  // failure; on this machine shard e already runs all 30 of its files, so repeating it cost
  // 150 s of a local run for no extra coverage. `scripts/test-shard.test.ts` keeps a test
  // file under those roots from falling outside every shard.

  if (changed.some((path) => heavyPaths(root).test(path))) {
    const { SMOKE_GAMES } = (await import("./smoke-games")) as { SMOKE_GAMES: readonly string[] };
    // The smoke games boot one at a time inside one smoke-games run, so each keeps its own step
    // and its own process. Scripts are called directly, never through a guarded `&&` chain:
    // scripts/guard.ts's win32 pass-through runs only the chain's first command and exits 0.
    for (const game of SMOKE_GAMES) {
      steps.push({ name: `smoke ${game}`, command: ["bun", "scripts/smoke-games.ts", "--games", game], browser: true, cost: 60 });
    }
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

async function spawnStep(command: readonly string[], root: string): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn([...command], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, output: `${stdout}${stderr}` };
}

/**
 * The files whose failures in a `bun test` output are all timeouts (a test's or a hook's), or null
 * when any failure is something else. A timeout is not rerun into a pass: a test that only passes on
 * a second try is a flake, and a rerun hides it until it fails a landing again. The step stays red and
 * names the files, so the test is fixed at its cause or quarantined with an issue.
 */
export function timedOutFiles(output: string): string[] | null {
  const lines = output.split(/\r?\n/);
  const files = new Set<string>();
  let file: string | null = null;
  let failures = 0;
  for (const [index, line] of lines.entries()) {
    const header = /^(\S+\.(?:test|spec)\.[cm]?[jt]sx?):$/.exec(line.trim());
    if (header !== null) file = header[1]!.replace(/\\/g, "/");
    if (!line.startsWith("(fail)")) continue;
    failures += 1;
    const next = lines[index + 1]?.trim() ?? "";
    if (file === null || !/^\^ (?:this test timed out after|a beforeEach\/afterEach hook timed out)/.test(next)) return null;
    files.add(file);
  }
  return failures > 0 ? [...files] : null;
}

async function run(step: Step, root: string): Promise<StepResult> {
  const started = Date.now();
  const first = await spawnStep(step.command, root);
  const timedOut = !first.ok && step.command[1] === "test" ? timedOutFiles(first.output) : null;
  const output = timedOut === null ? first.output : `${first.output}\n${timedOutNote(step.name, timedOut)}`;
  return { name: step.name, ok: first.ok, ms: Date.now() - started, output };
}

/** What a step whose only failures are timeouts says: which files, and that a rerun is not the fix. */
export function timedOutNote(stepName: string, files: readonly string[]): string {
  return `${stepName}: ${files.join(", ")} timed out. Not rerun: a test that passes only on a second try is a flake. Fix its cause (a wait on a fixed delay, a race, work too big for its budget) or quarantine it with an issue.`;
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

/**
 * The command that reruns one step alone, as a line to paste: the run's own junit flags are left
 * out, and an argument with a space is quoted.
 */
export function rerunCommand(step: Pick<Step, "name" | "command">): string {
  return step.command
    .filter((word) => !word.startsWith("--reporter"))
    .map((word) => (/\s/.test(word) ? `"${word}"` : word))
    .join(" ");
}

/**
 * What a red step prints: each failing file with its first error, the command that reruns only this
 * step, the fix when the step compares a generated file, and the whole output in a UTF-8 log under
 * `.scratch/verify-fast/`. Everything a lane needs to act, without reading this script.
 */
function printFailure(root: string, step: Step, output: string): void {
  const log = writeStepLog(root, "verify-fast", step.name, output);
  for (const line of digestLines(output, relPosix(root, log))) console.log(line);
  console.log(`  rerun only this: ${rerunFailing(step, output)}`);
  if (step.fix !== undefined) console.log(`  fix: ${step.fix}`);
}

/** For a test step, `bun test` over just the files that failed; for anything else, the step's own command. */
export function rerunFailing(step: Pick<Step, "name" | "command">, output: string): string {
  if (step.command[1] !== "test") return rerunCommand(step);
  const failed = [...new Set(failureDigest(output).map((entry) => entry.where.replace(/:\d+$/, "")).filter((where) => TEST_FILE.test(where)))];
  return failed.length === 0 ? rerunCommand(step) : `bun test ${failed.join(" ")}`;
}

function printPlan(plan: Plan, steps: readonly Step[]): void {
  for (const path of plan.changed) console.log(`  changed  ${path}`);
  for (const step of steps) console.log(`  step     ${step.name}  (${step.command.join(" ")})`);
  if (plan.fallback.length > 0) {
    console.log(`  no test can be attributed to ${plan.fallback.length} changed file(s), so every test file and type-check runs:`);
    for (const path of plan.fallback) console.log(`    ${path}`);
  }
}

function receiptPlan(root: string, base: string, argv: readonly string[], changed: string[], steps: Step[], hits: string[], jobs: number, started: number, junit?: string) {
  const dirty = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const untracked = names(git(root, ["ls-files", "--others", "--exclude-standard"]));
  const digest = treeDigests(root, untracked);
  const identity = createHash("sha256").update(dirty).update(git(root, ["diff", "--binary", "HEAD"]));
  for (const path of untracked) identity.update(`${path}\0${digest(path)}\n`);
  return {
    head: git(root, ["rev-parse", "HEAD"]).trim(), base, baseRevision: git(root, ["rev-parse", base]).trim(),
    dirty: dirty.length > 0, dirtyStatus: dirty, dirtyDigest: identity.digest("hex"),
    argv, jobs, runtime: `bun ${Bun.version}`, changed, selected: steps, cacheHits: hits,
    cacheEnabled: !argv.includes("--no-cache") && !argv.includes("--full"), planningMs: Date.now() - started,
    ...(junit === undefined ? {} : { junit }),
  };
}

/** A test file that imports the CI skip for downloaded models (`games/shared/assetTest.ts`). */
const MODEL_TEST_SOURCE = /from\s+["'][^"']*\/assetTest(\.ts)?["']/;

/** The test files among `files` that read downloaded models, which verify:fast links before they run. */
export function modelTestFiles(root: string, files: readonly string[], read: (path: string) => string = (path) => readFileSync(join(root, path), "utf8")): Set<string> {
  const readers = new Set<string>();
  for (const file of files) {
    try {
      if (MODEL_TEST_SOURCE.test(read(file))) readers.add(file);
    } catch {
      // A file that cannot be read is left to its own test step to report.
    }
  }
  return readers;
}

export function parseVerifyArgs(argv: readonly string[]) {
  const parsed = parseArgs({ args: [...argv], strict: true, options: {
    full: { type: "boolean" }, cheap: { type: "boolean" }, landing: { type: "boolean" }, plan: { type: "boolean" }, json: { type: "boolean" },
    base: { type: "string" }, jobs: { type: "string" }, "skill-api": { type: "boolean" }, "no-cache": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  } });
  const base = parsed.values.base ?? BASE;
  if (!base.trim() || base.startsWith("-")) throw new Error("--base needs a ref");
  const jobs = parsed.values.jobs === undefined ? DEFAULT_JOBS : Number(parsed.values.jobs);
  if (!/^\d+$/.test(parsed.values.jobs ?? String(DEFAULT_JOBS)) || !Number.isSafeInteger(jobs) || jobs < 1) throw new Error("--jobs needs a whole number at least 1");
  const { full = false, plan: planOnly = false, json = false, cheap = false, landing = false } = parsed.values;
  if (full && cheap) throw new Error("--full and --cheap cannot be combined");
  if (landing && (full || cheap)) throw new Error("--landing cannot be combined with --full or --cheap");
  if (planOnly && json) throw new Error("--plan and --json cannot be combined");
  return { base, jobs, full, planOnly, json, cheap, landing, skillApi: parsed.values["skill-api"] === true };
}

async function main(argv: readonly string[]): Promise<number> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { base, jobs, full, planOnly, json, cheap, landing, skillApi } = parseVerifyArgs(argv);
  if (!planOnly) assertCheckoutReady("verify:fast");
  const started = Date.now();
  const runDir = `.scratch/verify-fast/runs/${crypto.randomUUID()}`;
  const receipt = planOnly ? null : createVerifyReceipt(root, { argv, jobs, runtime: `bun ${Bun.version}` }, [], join(root, runDir));
  if (receipt !== null) (json ? console.error : console.log)(`verify:fast receipt: ${receipt.path}`);
  // A failure, its fix and the total always print; the plan, each pass and the cache notes are
  // kept for --verbose, and for --plan, whose whole point is to show them.
  const say = (line: string): void => console.log(line);
  const note = planOnly || isVerbose() ? say : (): void => {};
  const execute = async (steps: Step[], failFast: boolean, print: boolean): Promise<StepResult[]> => {
    if (receipt === null) throw new Error("missing run receipt");
    return runSteps(steps, jobs, (step) => run(step, root), {
      failFast,
      onStart: (step) => receipt.start(step),
      onSettle: (result) => {
        receipt.settle(result);
        if (!print || result.blockedBy !== undefined) return;
        (result.ok ? note : say)(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  ${(result.ms / 1000).toFixed(1)}s`);
        const step = steps.find((candidate) => candidate.name === result.name);
        if (!result.ok && step !== undefined) printFailure(root, step, result.output);
      },
    });
  };

  // The tree this run proves, and whether a passing run already proved it. Taken before planning, so
  // a reused run costs a git write-tree and nothing else.
  const key: ReuseKey | null = planOnly
    ? null
    : { tree: workingTree(root).tree, mergeBase: git(root, ["merge-base", "HEAD", base]).trim(), runtime: `bun ${Bun.version}`, scope: full ? "full" : cheap ? "cheap" : landing ? "landing" : "fast", skillApi };
  /** Settle the receipt; a pass keeps its tree only when the files did not change while it ran. */
  const finish = (ok: boolean): void => {
    if (receipt === null) return;
    if (ok && key !== null && workingTree(root).tree !== key.tree) {
      receipt.note({ tree: null, treeChanged: "the files changed while this ran, so this pass stands for no tree" });
    }
    receipt.finish(ok);
  };
  if (key !== null && receipt !== null) {
    receipt.note({ ...key });
    const reused = argv.includes("--no-cache") ? null : passingReceipt(root, key);
    if (reused !== null) {
      receipt.note({ reusedFrom: reused.path });
      receipt.finish(true);
      const line = `verify:fast: this exact tree already passed (${relative(root, reused.path).replaceAll("\\", "/")}, ${reused.endedAt}); not run again. --no-cache runs it.`;
      if (json) {
        console.error(line);
        console.log(JSON.stringify(jsonReport([], Date.now() - started)));
      } else console.log(line);
      return EXIT_VERIFIED;
    }
  }

  try {
  let changed: string[];
  try {
    changed = changedFiles(root, base);
  } catch (error) {
    const message = (error as Error).message;
    finish(false);
    if (json) {
      console.log(JSON.stringify(jsonReport([{ name: "changed files", ok: false, ms: 0 }], Date.now() - started)));
      console.error(message);
      return EXIT_FAILED;
    }
    console.error(`verify:fast: ${message}`);
    return EXIT_FAILED;
  }

  if (changed.length === 0) {
    receipt?.plan(receiptPlan(root, base, argv, changed, [], [], jobs, started), []);
    finish(true);
    if (json) {
      console.log(JSON.stringify(jsonReport([], Date.now() - started)));
      return EXIT_VERIFIED;
    }
    console.log(`verify:fast: nothing changed against ${base}; nothing to verify.`);
    return EXIT_VERIFIED;
  }

  if (full) {
    const steps = await fullSteps(root, changed);
    note(`verify:fast --full: ${steps.length} step(s), what CI runs for ${changed.length} changed file(s)`);
    note(`  ${Math.min(jobs, steps.length)} at a time in this checkout, the same work CI runs as parallel jobs.`);
    if (planOnly) {
      for (const step of steps) {
        const deps = step.needs === undefined ? "" : `  after ${step.needs.join(", ")}`;
        console.log(`  step  ${step.name}  (${step.command.join(" ")})${deps}`);
      }
      return EXIT_VERIFIED;
    }
    if (receipt === null) throw new Error("missing run receipt");
    receipt.plan(receiptPlan(root, base, argv, changed, steps, [], jobs, started), steps);
    if (json) {
      const runs = await withHeavyServer(root, steps, () => execute(steps, false, false));
      for (const result of runs) if (!result.ok && result.output.length > 0) console.error(result.output);
      const checks = runs.map((result) => ({ name: result.name, ok: result.ok, ms: result.ms }));
      finish(checks.every((check) => check.ok));
      console.log(JSON.stringify(jsonReport(checks, Date.now() - started)));
      return checks.every((check) => check.ok) ? EXIT_VERIFIED : EXIT_FAILED;
    }
    const failures: string[] = [];
    const runs = await withHeavyServer(root, steps, () => execute(steps, false, true));
    finish(runs.every((result) => result.ok));
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
  const planned = verifyPlan({
    changed,
    deleted: deletedFiles(root, base),
    testFiles: walkTestFiles(root, [...TEST_ROOTS, "games"]),
    workspaces: allWorkspaces,
    graph,
    exempt: pureRenames(root, base),
    landing,
  });
  // Every CI gate the change reaches, not the iteration subset: a passing hand run is then all a landing
  // needs, and lane:close reuses it instead of running it again.
  const plan = { ...planned, gates: landingGates(planned.changed) };
  // Shared by every worktree of this clone: a unit another lane proved on the same bytes is proven.
  const shared = sharedVerifyDir(root);
  const cache = argv.includes("--no-cache")
    ? null
    : openPassCache({
        file: join(shared, "passed.json"),
        // Unstaged and untracked files are hashed; everything else is the index's own blob id.
        digest: treeDigests(root, [...names(git(root, ["diff", "--name-only"])), ...names(git(root, ["ls-files", "--others", "--exclude-standard"]))]),
        tree: () => tree,
      });
  const skipped: string[] = [];
  const costFile = join(shared, "test-costs.json");
  // The plan uses a placeholder and never creates or clears evidence.
  const reportDir = `${runDir}/junit`;
  let testCosts: Record<string, number> = {};
  try {
    testCosts = JSON.parse(readFileSync(costFile, "utf8")) as Record<string, number>;
  } catch {
    testCosts = {};
  }
  const steps = fastSteps(plan, {
    skillApi,
    cheap,
    lanes: jobs,
    testCosts,
    reportDir,
    tree,
    modelTests: modelTestFiles(root, planned.tests),
    fresh: (unit, inputs) => {
      const hit = cache?.fresh(unit, inputs) === true;
      if (hit) skipped.push(unit);
      return hit;
    },
  });
  const remember = (results: readonly StepResult[]): void => {
    const passedFiles = new Set<string>();
    for (const report of existsSync(join(root, reportDir)) ? readdirSync(join(root, reportDir)) : []) {
      const xml = readFileSync(join(root, reportDir, report), "utf8");
      Object.assign(testCosts, junitCosts(xml));
      for (const file of junitPassedFiles(xml)) passedFiles.add(file);
    }
    saveTestCosts(costFile, testCosts);
    if (cache === null) return;
    for (const result of results) {
      for (const settled of steps.find((step) => step.name === result.name)?.units ?? []) {
        // A failed test process still proved every file whose own tests all passed, so a retry reruns only the rest.
        if (result.ok || (settled.id.startsWith("test:") && passedFiles.has(settled.id.slice("test:".length)))) cache.record(settled.id, settled.inputs);
      }
    }
    cache.save();
  };

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
    return EXIT_VERIFIED;
  }
  mkdirSync(join(root, reportDir), { recursive: true });
  if (receipt === null) throw new Error("missing run receipt");
  receipt.plan(receiptPlan(root, base, argv, changed, steps, skipped, jobs, started, reportDir), steps);
  if (json) {
    const results = await execute(steps, !cheap, false);
    remember(results);
    finish(results.every((result) => result.ok));
    for (const result of results) if (!result.ok && result.output.length > 0) console.error(result.output);
    console.log(JSON.stringify(jsonReport(results, Date.now() - started)));
    return results.every((result) => result.ok) ? EXIT_VERIFIED : EXIT_FAILED;
  }

  // The type-checks and gates start first and nothing new starts after a failure, so a type
  // error or a drifted file is named in seconds and the tests behind it never start; the steps
  // already running finish, so the next run reuses their passes. Each result prints the moment
  // it is known. `--cheap` runs only those seconds-long steps, so it runs every one: a landing
  // that fixed one gate only to meet the next cost a close per gate.
  const results = await execute(steps, !cheap, true);
  remember(results);
  finish(results.every((result) => result.ok));
  const failures = results.filter((result) => !result.ok && result.blockedBy === undefined).map((result) => result.name);
  const notRun = results.filter((result) => result.blockedBy !== undefined).map((result) => result.name);
  const seconds = (Date.now() - started) / 1000;
  const passed = results.length - failures.length - notRun.length;
  console.log(
    `\ntotal ${seconds.toFixed(1)}s — ${passed} passed, ${failures.length} failed${notRun.length > 0 ? `, ${notRun.length} not run` : ""}`,
  );
  // The result is partial by design and says so either way: what it covered, what it left out, and
  // the command that runs CI's whole set.
  const covered = `${plan.tests.length} test file(s), ${plan.typechecks.length} type-check(s), ${plan.gates.length} gate(s)${plan.boots.length > 0 ? `, boot ${plan.boots.join(" ")}` : ""}${skipped.length > 0 ? `; ${skipped.length} unit(s) already proven on these bytes` : ""}`;
  if (plan.fallback.length > 0) {
    console.log(`verify:fast: no test can be attributed to ${plan.fallback.join(", ")}, so every test file and type-check ran`);
  }
  if (failures.length > 0) {
    console.log(`failed: ${failures.join(", ")}`);
    if (notRun.length > 0) {
      const named = notRun.slice(0, 4).join(", ");
      console.log(`not run, because the run stops at the first failure: ${named}${notRun.length > 4 ? ` and ${notRun.length - 4} more` : ""}`);
    }
    console.log(`verify:fast: partial: only what this change reaches (${covered}). \`bun run verify:fast --full\` runs what CI runs.`);
    return EXIT_FAILED;
  }
  console.log(`verify:fast: ${cheap ? "cheap checks passed" : "verified"} — partial: only what this change reaches (${covered}). \`bun run verify:fast --full\` runs what CI runs.`);
  return EXIT_VERIFIED;
  } catch (error) {
    receipt?.abort(error);
    throw error;
  }
}

if (import.meta.main) {
  const argv = takeVerboseFlag(process.argv.slice(2));
  try {
    parseVerifyArgs(argv);
    if (printHelpIfAsked("verify-fast", VERIFY_FAST_USAGE, argv)) process.exit(EXIT_VERIFIED);
    const code = await main(argv);
    process.exit(code);
  } catch (error) {
    console.error(`verify:fast: ${(error as Error).message}`);
    process.exit(EXIT_FAILED);
  }
}
