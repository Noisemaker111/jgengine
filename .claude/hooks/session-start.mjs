import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const git = (...args) => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"], timeout: 20000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const gitIn = (input, ...args) => {
  try {
    return execFileSync("git", args, { input, stdio: ["pipe", "pipe", "ignore"], timeout: 20000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const patchIds = (diffText) => {
  if (!diffText) return [];
  const out = gitIn(diffText, "patch-id", "--stable");
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
};

const contentAlreadyUpstream = (primaryRoot, remoteRef, branch) => {
  const base = git("-C", primaryRoot, "merge-base", remoteRef, branch);
  if (!base) return false;
  const upstream = new Set(
    patchIds(git("-C", primaryRoot, "log", "-p", "--no-color", `${base}..${remoteRef}`)),
  );
  if (upstream.size === 0) return false;
  const combined = patchIds(git("-C", primaryRoot, "diff", "--no-color", base, branch))[0];
  if (combined && upstream.has(combined)) return true;
  const local = patchIds(git("-C", primaryRoot, "log", "-p", "--no-color", `${remoteRef}..${branch}`));
  return local.length > 0 && local.every((id) => upstream.has(id));
};

const healPrimary = (primaryRoot) => {
  const notes = [];
  const norm = (p) => p.replace(/\\/g, "/").toLowerCase();

  const registered = new Set(
    (git("-C", primaryRoot, "worktree", "list", "--porcelain") ?? "")
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => norm(line.slice("worktree ".length))),
  );
  const worktreesDir = `${primaryRoot}/.claude/worktrees`;
  if (existsSync(worktreesDir)) {
    for (const entry of readdirSync(worktreesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = `${worktreesDir}/${entry.name}`;
      if (!registered.has(norm(full))) {
        notes.push(
          `⚠️ Stray folder ${full} is NOT a registered git worktree (its registration was removed ` +
            `while the folder survived). A session still running inside it resolves git to the ` +
            `primary checkout and loads no hooks — treat anything it reports about repo state as ` +
            `wrong. The folder can be deleted once no session is using it; if unsure, tell the user.`,
        );
      }
    }
  }

  const primaryBranch = git("-C", primaryRoot, "rev-parse", "--abbrev-ref", "HEAD");
  if (!primaryBranch || primaryBranch === "HEAD") return notes;
  const defaultBranch =
    (git("-C", primaryRoot, "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD") ?? "")
      .split("/")
      .pop() || "main";
  const dirtyTracked = git("-C", primaryRoot, "status", "--porcelain", "--untracked-files=no");

  if (primaryBranch === defaultBranch) {
    if (dirtyTracked) {
      notes.push(
        `⚠️ The primary checkout has uncommitted tracked changes while on ${defaultBranch}. The ` +
          `primary must always be clean — some process is editing it directly, bypassing the ` +
          `worktree flow. Do NOT discard, overwrite, or commit those files; report this to the user.`,
      );
      return notes;
    }
    const remoteRef = `origin/${defaultBranch}`;
    const counts = git("-C", primaryRoot, "rev-list", "--left-right", "--count", `${defaultBranch}...${remoteRef}`);
    const [ahead, behind] = (counts ?? "0\t0").split(/\s+/).map(Number);
    if (behind > 0 && ahead === 0) {
      if (git("-C", primaryRoot, "merge", "--ff-only", remoteRef) !== null) {
        notes.push(`Self-healed: primary ${defaultBranch} was ${behind} commit(s) behind ${remoteRef} — fast-forwarded. Nothing for you to do.`);
      }
    } else if (behind > 0 && ahead > 0) {
      const unpushed = Number(git("-C", primaryRoot, "rev-list", "--count", defaultBranch, "--not", "--remotes"));
      if (unpushed === 0) {
        if (git("-C", primaryRoot, "reset", "--hard", remoteRef) !== null) {
          notes.push(
            `Self-healed: primary ${defaultBranch} had diverged from ${remoteRef} (${ahead} local / ${behind} ` +
              `remote), but every local commit is already on a remote branch — realigned to ${remoteRef}. ` +
              `Nothing stranded (the old tip is recoverable via reflog and the remote branches that carry it).`,
          );
        }
      } else if (contentAlreadyUpstream(primaryRoot, remoteRef, defaultBranch)) {
        if (git("-C", primaryRoot, "reset", "--hard", remoteRef) !== null) {
          notes.push(
            `Self-healed: primary ${defaultBranch} had diverged from ${remoteRef} (${ahead} local / ${behind} ` +
              `remote) with ${unpushed} commit(s) on no remote by SHA, but their content is already in ` +
              `${remoteRef} (squash-merged — the combined diff matches an upstream commit patch-id) — ` +
              `realigned to ${remoteRef}. Nothing stranded; the old tip is recoverable via reflog.`,
          );
        }
      } else {
        notes.push(
          `⚠️ The primary checkout's ${defaultBranch} has diverged from ${remoteRef} (${ahead} local / ${behind} ` +
            `remote) with ${unpushed} commit(s) whose content is NOT in ${remoteRef} — NOT auto-aligning, that ` +
            `work would be stranded. Inspect with git -C "${primaryRoot}" log -p ${remoteRef}..${defaultBranch}; ` +
            `push or reconcile those commits from the primary before continuing. Tell the user if unsure.`,
        );
      }
    }
    return notes;
  }

  const unpushed = Number(
    git("-C", primaryRoot, "rev-list", "--count", "HEAD", "--not", "--remotes"),
  );
  if (unpushed === 0 && dirtyTracked === "") {
    if (git("-C", primaryRoot, "switch", defaultBranch) !== null) {
      git("-C", primaryRoot, "pull", "--ff-only");
      notes.push(
        `Self-healed: the primary checkout was parked on "${primaryBranch}" (fully pushed, ` +
          `clean) — a previous session ended without switching back. It is now on ${defaultBranch} ` +
          `and fast-forwarded. Nothing for you to do about it.`,
      );
    } else {
      notes.push(
        `⚠️ The primary checkout is parked on "${primaryBranch}" and the automatic switch back ` +
          `to ${defaultBranch} failed. Run: git -C "${primaryRoot}" switch ${defaultBranch}`,
      );
    }
    return notes;
  }

  notes.push(
    `⚠️ The primary checkout is parked on "${primaryBranch}" with ` +
      (unpushed > 0 ? `${unpushed} unpushed commit(s)` : `uncommitted tracked changes`) +
      ` — NOT auto-switching, that work would be stranded. Push or commit it from the primary ` +
      `(git -C "${primaryRoot}" ...), then return it to ${defaultBranch}. Tell the user if unsure whose work it is.`,
  );
  return notes;
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

const unshallow = () => {
  if (git("rev-parse", "--is-shallow-repository") !== "true") return "";
  try {
    execFileSync("git", ["fetch", "--unshallow", "--quiet", "origin"], {
      stdio: "ignore",
      timeout: 180000,
    });
    return "";
  } catch {
    return (
      `\n\n⚠️ This clone is SHALLOW and un-shallowing failed (network/timeout). History ` +
      `comparisons against origin are unreliable: an apparent divergence or "unpushed commits" ` +
      `on ${git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")?.split("/").pop() || "main"} ` +
      `is likely phantom. Run git fetch --unshallow origin before diagnosing any branch state.`
    );
  }
};
const shallowNote = unshallow();

git("fetch", "origin", "--prune", "--quiet");

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
      `Echo 🚀 in your reply after queuing a merge so the chat shows it.` +
      healPrimary(primaryRoot)
        .map((note) => `\n\n${note}`)
        .join("") +
      shallowNote,
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

emit(lines.join("\n") + shallowNote);
