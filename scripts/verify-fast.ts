// A lane's own change used to cost a whole suite (about 1,100 test files) or a
// Chrome drive to check, so verifying one file took as long as verifying the
// repository. This maps what the branch changed to the packages that own it, the
// tests that can reach it and the cheap static gates the `quick` CI job runs, then
// runs only those.
//
//   bun run verify:fast              # the loop while iterating: seconds
//   bun run verify:fast --full       # everything CI runs; minutes, before landing
//   bun run verify:fast --plan       # the steps and their commands, nothing run
//   bun run verify:fast --json       # one JSON document on stdout: { ok, ms, checks }
//
// Exit: 0 verified, 1 a step failed, 2 a changed runtime file reached no test (a
// change this cannot attribute is never a silent pass).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
}

export interface Workspace {
  dir: string;
  checkTypes: boolean;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  ms: number;
}

export interface VerifyReport {
  ok: boolean;
  ms: number;
  checks: CheckResult[];
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
 * Exactly the commands CI runs, in CI's order: the `quick` job, `types`, every `test`
 * shard, `web-build`, `perf-cpu`, the Windows suite, and the frame and smoke gates when
 * a changed path can reach them. It is slower because CI runs these as parallel jobs on
 * fresh runners, while this runs them one after another in this checkout, and each shard
 * repeats its own build and Games preparation.
 */
export async function fullSteps(root: string, changed: readonly string[]): Promise<Step[]> {
  const steps: Step[] = [
    "check-artifacts",
    "check-stage-skills",
    "check-skills",
    "check-changelog",
    "build",
    "check-skill-api",
    "check-orphan-ratchet",
    "check:fixture-location",
    "check:scaffold-launch",
    "check:capture-hygiene",
    "check-export-manifest",
  ].map((name) => ({ name, command: ["bun", "run", name] }));

  steps.push({ name: "types (type-shard)", command: ["bun", "scripts/type-shard.ts"] });

  const shards = /shard: \[([^\]]+)\]/.exec(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"))?.[1] ?? "";
  for (const shard of shards.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    steps.push({ name: `test shard ${shard}`, command: ["bun", "scripts/test-shard.ts", shard] });
  }

  steps.push({ name: "web-build", command: ["bun", "--cwd=apps/web", "run", "build"] });
  steps.push({ name: "perf-cpu", command: ["bun", "run", "bench:cpu"] });
  steps.push({ name: "windows-tests", command: ["bun", "--cwd=packages/jgengine", "run", "test"] });

  if (changed.some((path) => heavyPaths(root).test(path))) {
    const { SMOKE_GAMES } = (await import("./smoke-games")) as { SMOKE_GAMES: readonly string[] };
    const { PERF_GATE_GAMES } = (await import("./perf-gate")) as { PERF_GATE_GAMES: readonly string[] };
    for (const game of SMOKE_GAMES) steps.push({ name: `smoke ${game}`, command: ["bun", "run", "smoke", "--games", game] });
    for (const game of PERF_GATE_GAMES) steps.push({ name: `perf ${game}`, command: ["bun", "run", "perf:gate", "--games", game] });
  }
  return steps;
}

async function run(step: Step, root: string): Promise<{ ok: boolean; seconds: number; output: string }> {
  const started = Date.now();
  const proc = Bun.spawn(step.command, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, seconds: (Date.now() - started) / 1000, output: `${stdout}${stderr}`.trim() };
}

/** The single document `--json` prints: `ok` only when every check passed. */
export function summarize(checks: readonly CheckResult[], ms: number): VerifyReport {
  return { ok: checks.every((check) => check.ok), ms: Math.round(ms), checks: checks.map((check) => ({ ...check })) };
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
  const emit = (report: VerifyReport): void => {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  };

  let changed: string[];
  try {
    changed = changedFiles(root, base);
  } catch (error) {
    console.error(`verify:fast: ${(error as Error).message}`);
    return EXIT_FAILED;
  }

  if (changed.length === 0) {
    if (json) emit(summarize([], 0));
    else console.log(`verify:fast: nothing changed against ${base}; nothing to verify.`);
    return EXIT_VERIFIED;
  }

  const started = Date.now();
  if (full) {
    const steps = await fullSteps(root, changed);
    if (!json) {
      console.log(`verify:fast --full: ${steps.length} step(s), what CI runs for ${changed.length} changed file(s)`);
      console.log("  slower than verify:fast because CI runs these as parallel jobs on fresh runners; this runs them in order here.");
    }
    if (planOnly) {
      for (const step of steps) console.log(`  step  ${step.name}  (${step.command.join(" ")})`);
      return EXIT_VERIFIED;
    }
    const checks: CheckResult[] = [];
    for (const step of steps) {
      const result = await run(step, root);
      checks.push({ name: step.name, ok: result.ok, ms: Math.round(result.seconds * 1000) });
      if (!json) console.log(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${result.seconds.toFixed(1)}s`);
      if (!result.ok) (json ? console.error : console.log)(result.output);
    }
    const report = summarize(checks, Date.now() - started);
    if (json) {
      emit(report);
    } else {
      const failures = checks.filter((check) => !check.ok).map((check) => check.name);
      console.log(`\ntotal ${(report.ms / 1000).toFixed(1)}s — ${checks.length - failures.length} passed, ${failures.length} failed`);
      if (failures.length > 0) console.log(`failed: ${failures.join(", ")}`);
    }
    return report.ok ? EXIT_VERIFIED : EXIT_FAILED;
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

  if (!json && !planOnly) {
    console.log(`verify:fast against ${base}: ${plan.changed.length} changed file(s), ${plan.tests.length} test file(s), ${plan.gates.length} gate(s)`);
  }
  if (planOnly) {
    printPlan(plan, steps);
    return plan.unattributed.length === 0 ? EXIT_VERIFIED : EXIT_UNATTRIBUTED;
  }
  if (plan.unattributed.length > 0) {
    if (json) emit({ ok: false, ms: Math.round(Date.now() - started), checks: [] });
    reportUnattributed(plan);
    return EXIT_UNATTRIBUTED;
  }

  const checks: CheckResult[] = [];
  for (const step of steps) {
    const result = await run(step, root);
    checks.push({ name: step.name, ok: result.ok, ms: Math.round(result.seconds * 1000) });
    if (!json) console.log(`${result.ok ? "PASS" : "FAIL"}  ${step.name}  ${result.seconds.toFixed(1)}s`);
    if (!result.ok) (json ? console.error : console.log)(result.output);
  }
  const report = summarize(checks, Date.now() - started);
  if (json) {
    emit(report);
    return report.ok ? EXIT_VERIFIED : EXIT_FAILED;
  }
  const failures = checks.filter((check) => !check.ok).map((check) => check.name);
  console.log(`\ntotal ${(report.ms / 1000).toFixed(1)}s — ${checks.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(`failed: ${failures.join(", ")}`);
    console.log("verify:fast ran only what this change reaches. `bun run verify:fast --full` runs what CI runs.");
    return EXIT_FAILED;
  }
  return EXIT_VERIFIED;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
