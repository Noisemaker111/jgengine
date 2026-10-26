import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkCommand, findCheck } from "./run-stages";

const root = fileURLToPath(new URL("..", import.meta.url));
const ship = process.argv.includes("--ship");
const failures: string[] = [];

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
    return "";
  }
  return result.stdout.trim();
}

function requirePath(path: string, reason: string): void {
  if (!existsSync(join(root, path))) failures.push(`${path} missing — ${reason}`);
}

try {
  JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
} catch (error) {
  failures.push(`package.json is not strict JSON: ${String(error)}`);
}

requirePath("bun.lock", "run bun install and commit the lockfile (or `bun run agent:bootstrap`)");
requirePath("node_modules", "run `bun run agent:bootstrap` (or bun install) before generators or gates");
requirePath("node_modules/ts-morph", "dependencies incomplete - run `bun run agent:bootstrap`");
requirePath("node_modules/@typescript/native-preview", "dependencies incomplete - run `bun run agent:bootstrap`");

// A half-linked install resolves nothing yet still passes a bare node_modules check,
// so let the worktree doctor answer for this tree only (about 0.2s, no full scan).
const doctor = spawnSync("bun", ["scripts/worktree-doctor.ts", "--self"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (doctor.status !== 0) {
  failures.push((doctor.stderr || doctor.stdout || "worktree install is broken").trim().split("\n").join(" "));
}

function workspacePatterns(): string[] {
  const workspaces = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces as
    | string[]
    | { packages: string[] };
  return Array.isArray(workspaces) ? workspaces : workspaces.packages;
}

function workspaceManifests(): string[] {
  const manifests = ["package.json"];
  const patterns = workspacePatterns();
  for (const pattern of patterns) {
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

function checkLockfileSync(): void {
  if (!existsSync(join(root, "bun.lock"))) return;
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
      failures.push(
        `bun.lock is out of sync with the workspace package.json files — CI's bun install --frozen-lockfile will fail. Run bun install and commit the updated bun.lock. (${detail})`,
      );
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

checkLockfileSync();

if (ship) {
  run("git", ["fetch", "origin", "beta"]);
  const branch = run("git", ["branch", "--show-current"]);
  if (branch === "" || branch === "main" || branch === "beta") failures.push("ship from a dedicated branch, not main, beta or detached HEAD");

  const status = run("git", ["status", "--porcelain"]);
  if (status !== "")
    failures.push(
      "worktree is dirty — commit (or stash) the remaining changes, then re-run. `preflight --ship` checks the committed branch diff, so it runs AFTER you commit, not before",
    );

  // Catch stash-pop / merge conflict markers that leave the tree "clean" but break CI.
  // Only scan files changed vs origin/beta (or the working tree if no commits yet).
  const changedFiles = run("git", ["diff", "--name-only", "--diff-filter=ACMR", "origin/beta...HEAD"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // Common conflict-marker lines; require the full 7-character delimiters so legitimate
  // prose like "=======" underlines and markdown rules don't false-positive.
  const CONFLICT_MARKERS = /^(<<<<<<< |>>>>>>> |=======\s*$)/m;
  const TEXTISH =
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|toml|txt|svg|sh|ps1|css\.ts)$/i;
  for (const rel of changedFiles) {
    if (!TEXTISH.test(rel)) continue;
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (CONFLICT_MARKERS.test(text)) {
      failures.push(`${rel} still contains conflict markers (<<<<<<< / ======= / >>>>>>>) — resolve before shipping`);
    }
  }

  const mergeBase = run("git", ["merge-base", "HEAD", "origin/beta"]);
  const landing = run("git", ["rev-parse", "origin/beta"]);
  if (mergeBase !== "" && landing !== "" && mergeBase !== landing) {
    failures.push("branch is not based on the current origin/beta tip — update it before opening the PR");
  }

  const diff = run("git", ["diff", "--stat", "origin/beta...HEAD"]);
  if (diff === "")
    failures.push(
      "branch has no net diff from origin/beta — commit your work to this branch first (`preflight --ship` reads committed history, not the working tree), or drop the no-op PR",
    );
}

/** Check-table rows (scripts/run-stages.ts) as preflight runs them: the same command CI runs. */
function fromTable(names: readonly string[]): { name: string; args: readonly string[] }[] {
  return names.map((name) => {
    const check = findCheck(name);
    if (check === undefined) throw new Error(`preflight: ${name} is not in the check table (scripts/run-stages.ts)`);
    return { name: `check ${name}`, args: checkCommand(check).slice(1) };
  });
}

/** Committed generated artifacts CI compares against their generators. */
const GENERATED_CHECKS = fromTable(["export-manifest", "capabilities", "skill-api", "source-paths"]);

/** Cheap source checks CI runs (`quick` and `types` jobs), so preflight fails where CI would. */
const QUICK_CHECKS: readonly { name: string; args: readonly string[] }[] = [
  ...fromTable(["stage-skills", "skills", "changelog", "test-spawn-timeouts", "capture-hygiene"]),
  { name: "browser-test-budget", args: ["scripts/browser-test-budget.ts"] },
];

function runCheck(args: readonly string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((done) => {
    const child = spawn("bun", [...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => done({ ok: code === 0, output: output.trim() }));
    child.on("error", (error) => done({ ok: false, output: String(error) }));
  });
}

if (ship) {
  const [results, quick] = await Promise.all([
    Promise.all(GENERATED_CHECKS.map(async (check) => ({ check, ...(await runCheck(check.args)) }))),
    Promise.all(QUICK_CHECKS.map(async (check) => ({ check, ...(await runCheck(check.args)) }))),
  ]);
  for (const result of quick.filter((entry) => !entry.ok)) {
    failures.push(`${result.check.name} failed — CI's quick job will too:\n      ${result.output.split("\n").slice(-6).join("\n      ")}`);
  }
  const stale = results.filter((result) => !result.ok);
  if (stale.length > 0) {
    failures.push(
      `generated files are stale (${stale.map((result) => result.check.name).join(", ")}) — CI will fail. ` +
        "Run `bun run gen`, commit the result, then re-run `preflight --ship`.\n" +
        stale.map((result) => `    ${result.check.name}: ${result.output.split("\n").slice(0, 6).join("\n      ")}`).join("\n"),
    );
  }
}

if (failures.length > 0) {
  console.error(`agent preflight failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(ship ? "ship preflight ok" : "agent preflight ok");
