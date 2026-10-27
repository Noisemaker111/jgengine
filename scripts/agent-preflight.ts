// `bun run preflight`: the cheap checks `bun run lane:close` runs before anything slow, as one
// command an author can run on its own. In order, stopping at the first that fails:
//
//   1. the install: node_modules present and linked, bun.lock in step with every package.json
//   2. no conflict markers left in a changed file
//   3. `bun run gen`: every generated file rewritten, so a stale one never fails a landing
//   4. `bun run verify:fast --cheap`: the type-checks and gates the change reaches
//
// It runs no tests and boots no game, so a mistake shows in under a minute instead of after the
// test suite. lane:close runs exactly this first, then the tests, then lands.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

const PREFLIGHT_USAGE = {
  summary: "the cheap checks lane:close runs first: install, conflict markers, gen, type-checks and gates",
  usage: "bun run preflight [--no-gen]",
  flags: [{ flag: "--no-gen", detail: "check the install only, without gen or verify:fast (what agent:bootstrap runs)" }],
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

function step(label: string, args: string[]): boolean {
  console.log(`preflight: ${label}`);
  const run = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  return run.status === 0;
}

function main(argv: readonly string[]): number {
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
  if (!step("gen", ["run", "gen"])) {
    console.error("preflight: gen failed; fix what it names, then run preflight again.");
    return 1;
  }
  if (!step("verify:fast --cheap", ["run", "verify:fast", "--cheap"])) {
    console.error("preflight: a type-check or gate failed; fix what it names, then run preflight again.");
    return 1;
  }
  console.log(`preflight ok in ${((Date.now() - started) / 1000).toFixed(1)}s: install, conflict markers, gen, type-checks and gates`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
