import { execFileSync } from "node:child_process";

const git = (...args) => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const emit = (context) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    }),
  );
  process.exit(0);
};

const gitDir = git("rev-parse", "--absolute-git-dir");
if (!gitDir) process.exit(0);

const branch = git("rev-parse", "--abbrev-ref", "HEAD") ?? "?";
const inWorktree = /[\\/]\.git[\\/]worktrees[\\/]/.test(gitDir);

if (inWorktree) {
  emit(
    `Worktree flow OK: this session is in an isolated worktree on branch "${branch}". ` +
      `Keep committing here and ship via its draft PR. The primary checkout stays on main.`,
  );
}

const defaultBranch =
  (git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD") ?? "").split("/").pop() || "main";

const lines = [
  `WORKTREE FLOW NOT ESTABLISHED — this session is in the PRIMARY checkout (branch "${branch}").`,
  `Repo policy (CLAUDE.md): main -> worktree branch -> draft PR for EVERY unit of work.`,
  ``,
  `Before editing any file, do this now:`,
  `  1. Call EnterWorktree to create an isolated worktree off ${defaultBranch}.`,
  `  2. Open a PR for the task:  gh pr create --fill`,
  `Edits in the primary checkout are hard-blocked by the guard-worktree hook until you do.`,
];

if (branch !== defaultBranch) {
  lines.push(
    ``,
    `NOTE: the primary checkout is parked on "${branch}", not ${defaultBranch}. That is the "switched to a`,
    `branch and never switched back" mess. After entering your worktree, the primary checkout`,
    `should be returned to ${defaultBranch} (git switch ${defaultBranch}) once its own work is shipped.`,
  );
}

emit(lines.join("\n"));
