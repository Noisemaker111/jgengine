import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

requirePath("bun.lock", "run bun install and commit the lockfile");
requirePath("node_modules", "run bun install before generators or gates");
requirePath("node_modules/ts-morph", "dependencies are incomplete; finish bun install before continuing");
requirePath("node_modules/@typescript/native-preview", "dependencies are incomplete; finish bun install before continuing");

if (ship) {
  run("git", ["fetch", "origin", "main"]);
  const branch = run("git", ["branch", "--show-current"]);
  if (branch === "" || branch === "main") failures.push("ship from a dedicated branch, not main or detached HEAD");

  const status = run("git", ["status", "--porcelain"]);
  if (status !== "") failures.push("worktree is dirty — finish the diff before shipping");

  const mergeBase = run("git", ["merge-base", "HEAD", "origin/main"]);
  const main = run("git", ["rev-parse", "origin/main"]);
  if (mergeBase !== "" && main !== "" && mergeBase !== main) {
    failures.push("branch is not based on the current origin/main tip — update it before opening the PR");
  }

  const diff = run("git", ["diff", "--stat", "origin/main...HEAD"]);
  if (diff === "") failures.push("branch has no net diff from origin/main — do not open a no-op PR");
}

if (failures.length > 0) {
  console.error(`agent preflight failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log(ship ? "ship preflight ok" : "agent preflight ok");
