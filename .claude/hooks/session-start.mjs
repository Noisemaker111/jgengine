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
  const primaryRoot = gitDir.replace(/[\\/]\.git[\\/]worktrees[\\/].*$/, "");
  emit(
    `Worktree flow OK: this session is in an isolated worktree on branch "${branch}". ` +
      `Keep committing here. When the work is real, push and open a PR (gh pr create --fill); ` +
      `when it's genuinely done and clean, queue the merge (gh pr merge --squash --auto) — GitHub ` +
      `merges on green CI (~30s) and deletes the branch itself; never poll or wait on CI. ` +
      `Fast-forward the primary checkout once the merge lands (git -C "${primaryRoot}" pull --ff-only — ` +
      `merging only moves origin/main, not the local clone), or leave it for the next session's pull, ` +
      `then ExitWorktree (remove) — don't ask the user to merge, and don't merge over doubt. ` +
      `Echo 🚀 in your reply after queuing a merge so the chat shows it.`,
  );
}

const defaultBranch =
  (git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD") ?? "").split("/").pop() || "main";

const lines = [
  `WORKTREE FLOW NOT ESTABLISHED — this session is in the PRIMARY checkout (branch "${branch}").`,
  `Repo policy (CLAUDE.md): every session works in its own worktree; the primary checkout stays on ${defaultBranch}.`,
  ``,
  `Before editing any file, call EnterWorktree to create an isolated worktree off ${defaultBranch}.`,
  `Edits in the primary checkout are hard-blocked by the guard-worktree hook until you do.`,
  `(PRs come later, when the work is real — no need to open one up front.)`,
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
