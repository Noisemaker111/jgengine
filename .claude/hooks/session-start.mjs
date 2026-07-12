import { execFileSync } from "node:child_process";

const git = (...args) => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"], timeout: 30000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const gitIn = (input, ...args) => {
  try {
    return execFileSync("git", args, { input, stdio: ["pipe", "pipe", "ignore"], timeout: 30000 })
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

const contentAlreadyUpstream = (remoteRef, branch) => {
  const base = git("merge-base", remoteRef, branch);
  if (!base) return false;
  const upstream = new Set(patchIds(git("log", "-p", "--no-color", `${base}..${remoteRef}`)));
  if (upstream.size === 0) return false;
  const combined = patchIds(git("diff", "--no-color", base, branch))[0];
  if (combined && upstream.has(combined)) return true;
  const local = patchIds(git("log", "-p", "--no-color", `${remoteRef}..${branch}`));
  return local.length > 0 && local.every((id) => upstream.has(id));
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
      `comparisons against origin are unreliable — run git fetch --unshallow origin before ` +
      `diagnosing any branch state.`
    );
  }
};
const shallowNote = unshallow();

git("fetch", "origin", "--prune", "--quiet");

const branch = git("rev-parse", "--abbrev-ref", "HEAD") ?? "?";
const defaultBranch =
  (git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD") ?? "").split("/").pop() || "main";
const remoteMain = `origin/${defaultBranch}`;
const dirtyTracked = git("status", "--porcelain", "--untracked-files=no");
const notes = [];

if (branch === defaultBranch) {
  if (!dirtyTracked && git("merge", "--ff-only", remoteMain) !== null) {
    notes.push(`Fast-forwarded ${defaultBranch} to ${remoteMain}.`);
  }
} else if (branch !== "HEAD") {
  const remoteBranch = `origin/${branch}`;
  const hasRemoteBranch = git("rev-parse", "--verify", "--quiet", remoteBranch) !== null;

  if (hasRemoteBranch && !dirtyTracked) {
    const counts = git("rev-list", "--left-right", "--count", `${branch}...${remoteBranch}`);
    const [ahead, behind] = (counts ?? "0\t0").split(/\s+/).map(Number);
    if (behind > 0 && ahead === 0 && git("merge", "--ff-only", remoteBranch) !== null) {
      notes.push(`Fast-forwarded ${branch} to ${remoteBranch}.`);
    }
  }

  const unpushed = Number(git("rev-list", "--count", "HEAD", "--not", "--remotes")) || 0;
  const headSha = git("rev-parse", "HEAD");
  const mainSha = git("rev-parse", remoteMain);
  const behindMain =
    headSha !== mainSha && git("merge-base", "--is-ancestor", "HEAD", remoteMain) === "";
  if (!dirtyTracked && behindMain) {
    if (git("reset", "--hard", remoteMain) !== null) {
      notes.push(
        `Self-healed: "${branch}" pointed at history already contained in ${remoteMain} — ` +
          `restarted it from ${remoteMain}. Start committing on top of this fresh base.`,
      );
    }
  } else if (!dirtyTracked && contentAlreadyUpstream(remoteMain, branch)) {
    if (git("reset", "--hard", remoteMain) !== null) {
      notes.push(
        `Self-healed: every commit on "${branch}" was already squash-merged into ${remoteMain} ` +
          `(patch-id match). Restarted the branch from ${remoteMain} so new work does not stack ` +
          `on merged history — this is what used to cause the every-session merge conflicts. ` +
          `The old tip is recoverable via reflog. When you push, use --force-with-lease if the ` +
          `remote branch still carries the old history.`,
      );
    }
  } else if (unpushed > 0) {
    notes.push(
      `⚠️ "${branch}" carries ${unpushed} commit(s) not on any remote and not yet merged. ` +
        `This container is ephemeral — push early (git push -u origin ${branch}).`,
    );
  }
}

emit(
  [
    `Cloud session on branch "${branch}" (default: ${defaultBranch}).`,
    `Flow: commit here, push with git push -u origin ${branch}, open a PR via the GitHub MCP ` +
      `tools, subscribe_pr_activity on it, and squash-merge it immediately — the local gate ` +
      `already ran (queue auto-merge (squash) if required checks block the instant merge). The ` +
      `session ends only when the PR is merged AND the Actions run on its merge commit on ` +
      `${defaultBranch} is green. Nothing in this repo's Actions takes longer than ~1 minute: ` +
      `after the merge, have a cheap worker wait ~60s with one foreground Bash call — ` +
      `bun -e 'await Bun.sleep(60000)' (bare sleep is harness-blocked, backgrounded waits die ` +
      `with the turn) — then read the merge commit's runs in the same turn. ` +
      `Green → unsubscribe + stop. Red → fix forward from origin/${defaultBranch}. Still ` +
      `pending on a second look → treat as broken and investigate. Never arm send_later ` +
      `check-ins or scheduled remote sessions for CI. No worktrees — every session is its ` +
      `own isolated cloud container.`,
    ...notes,
  ].join("\n\n") + shallowNote,
);
