/**
 * Create a Bun-safe git worktree for agent isolation, then bootstrap it.
 *
 *   bun run agent:worktree -- <name> [branch]
 *
 * Path: <repo>/.claude/worktrees/<name>  (gitignored; Claude --worktree default)
 * Branch: codex/<name> or the second argument
 *
 * Refuses C:\tmp and paths outside the repo's .claude/worktrees tree.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2).filter((a) => a !== "--");
const name = args[0];
const branch = args[1] ?? `agent/${name}`;

if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
  console.error("usage: bun run agent:worktree -- <name> [branch]");
  console.error("  name: alphanumerics, dots, underscores, hyphens");
  process.exit(1);
}

const worktreesRoot = resolve(root, ".claude", "worktrees");
const target = resolve(worktreesRoot, name);

if (!target.startsWith(worktreesRoot + sep) && target !== worktreesRoot) {
  console.error("agent-worktree: refused path outside .claude/worktrees");
  process.exit(1);
}

const lowered = target.toLowerCase();
if (lowered.includes(`${sep}tmp${sep}`) || lowered.endsWith(`${sep}tmp`) || /^[a-z]:\\tmp\\/i.test(target)) {
  console.error("agent-worktree: refused temp-drive paths (Windows Codex sandbox thrash)");
  process.exit(1);
}

function git(args: string[], timeoutMs = 120_000): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });
  const out = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "");
  if (result.exitCode !== 0) {
    console.error(out.trim() || `git ${args.join(" ")} failed`);
    process.exit(result.exitCode ?? 1);
  }
  return out.trim();
}

git(["fetch", "origin", "main", "--prune"]);
const base = git(["rev-parse", "origin/main"]);

mkdirSync(worktreesRoot, { recursive: true });

if (existsSync(target)) {
  console.log(`agent-worktree: already exists at ${target}`);
} else {
  console.log(`agent-worktree: adding ${target} on ${branch} from origin/main (${base.slice(0, 8)})`);
  git(["worktree", "add", "-b", branch, target, "origin/main"], 180_000);
}

console.log(`agent-worktree: bootstrapping ${target}`);
const boot = Bun.spawnSync(["bun", "run", "agent:bootstrap"], {
  cwd: target,
  stdout: "inherit",
  stderr: "inherit",
  timeout: 1_200_000,
  killSignal: "SIGKILL",
});
if (boot.exitCode !== 0) {
  console.error("agent-worktree: bootstrap failed in the new tree — fix, then `cd` there and re-run bun run agent:bootstrap");
  process.exit(boot.exitCode ?? 1);
}

console.log(`
agent-worktree: ready
  path:   ${target}
  branch: ${branch}
  base:   origin/main

Open your agent with cwd = that path. Do not create another worktree from inside it.
`);
