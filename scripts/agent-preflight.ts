// `bun run preflight`: the cheap checks `bun run lane:close` runs before anything slow, as one
// command an author can run on its own. In order:
//
//   1. the install: node_modules present and linked, bun.lock in step with every package.json
//   2. no conflict markers left in a changed file
//   3. `bun run gen <targets>`: the generators whose inputs the diff reaches and that did not
//      already run on these exact inputs, so a stale generated file never fails a landing and a
//      game-only change pays for none of the engine's 35 s generators
//   4. `bun run verify:fast --cheap`: the type-checks the change reaches and every gate CI's
//      quick and types jobs run, all of them, so every failure shows in one pass
//
// 1 and 2 stop the run; 3 and 4 both run and report together.
//
// It runs no tests and boots no game, so a mistake shows in under a minute instead of after the
// test suite. lane:close runs exactly this first, then the tests, then lands.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { repoFiles } from "./import-graph";
import { GEN_TARGETS, reachedBy, readsPath, type GenTarget } from "./run-stages";
import { printHelpIfAsked } from "./script-help";
import { changedFiles } from "./verify-fast";
import { openPassCache, treeDigests } from "./verify-cache";
import { isVerbose, takeVerboseFlag } from "./verbosity";

const PREFLIGHT_USAGE = {
  summary: "the cheap checks lane:close runs first: install, conflict markers, gen, type-checks and gates",
  usage: "bun run preflight [--no-gen] [--verbose]",
  flags: [
    { flag: "--no-gen", detail: "check the install only, without gen or verify:fast (what agent:bootstrap runs)" },
    { flag: "--verbose", detail: "stream every step's output (by default a step's output prints only when it fails)" },
  ],
  example: "bun run preflight",
  exits: ["0 every cheap check passed", "1 a check failed; the output names it and the fix"],
} as const;

const root = fileURLToPath(new URL("..", import.meta.url));

/** Common conflict-marker lines; the full 7-character delimiters, so markdown rules do not match. */
export const CONFLICT_MARKERS = /^(<<<<<<< |>>>>>>> |=======\s*$)/m;
const TEXTISH = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|toml|txt|svg|sh|ps1)$/i;

function workspacePatterns(): string[] {
  const workspaces = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces as string[] | { packages: string[] };
  return Array.isArray(workspaces) ? workspaces : workspaces.packages;
}

function workspaceManifests(): string[] {
  const manifests = ["package.json"];
  for (const pattern of workspacePatterns()) {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      if (!existsSync(join(root, base))) continue;
      for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(root, base, entry.name, "package.json"))) {
          manifests.push(join(base, entry.name, "package.json"));
        }
      }
    } else if (existsSync(join(root, pattern, "package.json"))) {
      manifests.push(join(pattern, "package.json"));
    }
  }
  return manifests;
}

/** The install problems, if any: missing modules, a broken link, or a lockfile CI would refuse. */
function installProblems(): string[] {
  const problems: string[] = [];
  try {
    JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch (error) {
    problems.push(`package.json is not strict JSON: ${String(error)}`);
  }
  const requirePath = (path: string, reason: string): void => {
    if (!existsSync(join(root, path))) problems.push(`${path} missing — ${reason}`);
  };
  requirePath("bun.lock", "run bun install and commit the lockfile (or `bun run agent:bootstrap`)");
  requirePath("node_modules", "run `bun run agent:bootstrap` (or bun install) before generators or gates");
  requirePath("node_modules/ts-morph", "dependencies incomplete - run `bun run agent:bootstrap`");
  requirePath("node_modules/@typescript/native-preview", "dependencies incomplete - run `bun run agent:bootstrap`");

  // A half-linked install resolves nothing yet still passes a bare node_modules check,
  // so let the worktree doctor answer for this tree only (about 0.2s, no full scan).
  const doctor = spawnSync("bun", ["scripts/worktree-doctor.ts", "--self"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (doctor.status !== 0) problems.push((doctor.stderr || doctor.stdout || "worktree install is broken").trim().split("\n").join(" "));

  if (existsSync(join(root, "bun.lock"))) {
    const workDir = mkdtempSync(join(tmpdir(), "jgengine-lockcheck-"));
    try {
      for (const rel of workspaceManifests()) {
        const dest = join(workDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(root, rel), dest);
      }
      copyFileSync(join(root, "bun.lock"), join(workDir, "bun.lock"));
      const result = spawnSync("bun", ["install", "--frozen-lockfile", "--dry-run"], {
        cwd: workDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
      });
      if (result.status !== 0) {
        const detail = (result.stderr || result.stdout || "").trim().split("\n").slice(0, 3).join(" ");
        problems.push(
          `bun.lock is out of sync with the workspace package.json files — CI's bun install --frozen-lockfile will fail. Run bun install and commit the updated bun.lock. (${detail})`,
        );
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
  return problems;
}

/** Changed text files, committed or not, that still hold a conflict marker. */
function conflictProblems(): string[] {
  const listed = spawnSync("git", ["diff", "--name-only", "--diff-filter=ACMR", "origin/beta"], { cwd: root, encoding: "utf8" });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  const files = `${listed.stdout ?? ""}\n${untracked.stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && TEXTISH.test(line));
  const problems: string[] = [];
  for (const rel of new Set(files)) {
    let text: string;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (CONFLICT_MARKERS.test(text)) problems.push(`${rel} still contains conflict markers (<<<<<<< / ======= / >>>>>>>) — resolve them`);
  }
  return problems;
}

const GEN_CACHE = join(".scratch", "verify-fast", "gen-passed.json");

function gitNames(args: string[]): string[] {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return (run.stdout ?? "").split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

/** Every file a generator's output depends on, its own outputs included. */
function genInputs(target: GenTarget, tree: readonly string[]): string[] {
  return tree.filter((file) => readsPath(target.reads, file));
}

function genCache(): { fresh: (target: GenTarget) => boolean; record: (targets: readonly GenTarget[]) => void } {
  const open = () => {
    const tree = repoFiles(root);
    const dirty = [...gitNames(["diff", "--name-only"]), ...gitNames(["ls-files", "--others", "--exclude-standard"])];
    return { tree, cache: openPassCache({ file: join(root, GEN_CACHE), digest: treeDigests(root, dirty), tree: () => tree }) };
  };
  const before = open();
  return {
    fresh: (target) => before.cache.fresh(`gen:${target.name}`, genInputs(target, before.tree)),
    record: (targets) => {
      // The generators rewrote files, so the inputs are read again as they now stand.
      const after = open();
      for (const target of targets) after.cache.record(`gen:${target.name}`, genInputs(target, after.tree));
      after.cache.save();
    },
  };
}

/**
 * The generators this diff needs: each one whose inputs it reaches, less each one that already
 * ran on these exact inputs. A diff that reaches none (a doc, a game's own data) runs none.
 */
export function genTargetsFor(changed: readonly string[], fresh: (target: GenTarget) => boolean = () => false): GenTarget[] {
  return GEN_TARGETS.filter((target) => reachedBy(target, changed) && !fresh(target));
}

/**
 * Run one step. Under --verbose it streams; otherwise its output is held and printed only when the
 * step fails, so a passing preflight is one line and a failing one shows everything the step said.
 */
function step(label: string, args: string[]): boolean {
  if (isVerbose()) {
    console.log(`preflight: ${label}`);
    return spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status === 0;
  }
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  if (run.status === 0) return true;
  console.error(`preflight: ${label} failed:`);
  if ((run.stdout ?? "").length > 0) process.stdout.write(run.stdout);
  if ((run.stderr ?? "").length > 0) process.stderr.write(run.stderr);
  if (run.error !== undefined) console.error(String(run.error));
  return false;
}

function main(rawArgv: readonly string[]): number {
  const argv = takeVerboseFlag(rawArgv);
  if (printHelpIfAsked("agent-preflight", PREFLIGHT_USAGE, argv)) return 0;
  const unknown = argv.filter((arg) => arg !== "--no-gen");
  if (unknown.length > 0) {
    console.error(`preflight: unknown argument ${unknown.join(" ")} (bun run preflight --help)`);
    return 1;
  }
  const started = Date.now();
  const problems = [...installProblems(), ...conflictProblems()];
  if (problems.length > 0) {
    console.error(`preflight failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    return 1;
  }
  if (argv.includes("--no-gen")) {
    console.log("preflight: install ok");
    return 0;
  }
  // Both run whatever the first says: a landing that fixed gen only to meet a gate, then the next
  // gate, paid one close per failure. Every failure is named in this one pass.
  const failed: string[] = [];
  const cache = genCache();
  const targets = genTargetsFor(changedFiles(root), cache.fresh);
  if (targets.length > 0) {
    if (step(`gen ${targets.map((target) => target.name).join(" ")}`, ["run", "gen", ...targets.map((target) => target.name)])) cache.record(targets);
    else failed.push("gen (a generator, or a file that gained a type escape)");
  }
  if (!step("verify:fast --cheap", ["run", "verify:fast", "--cheap"])) failed.push("verify:fast --cheap (type-checks and every gate CI runs)");
  if (failed.length > 0) {
    console.error(`preflight failed: ${failed.join("; ")}. Everything above is every failure, not the first; fix them all, then close again.`);
    return 1;
  }
  console.log(`preflight ok in ${((Date.now() - started) / 1000).toFixed(1)}s: install, conflict markers, gen, type-checks and gates`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
