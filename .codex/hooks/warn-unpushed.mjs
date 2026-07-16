import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const EDIT_QUIET_MS = 5 * 60 * 1000;
const WARN_COOLDOWN_MS = 30 * 60 * 1000;

const gitRaw = (...args) => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).toString();
  } catch {
    return null;
  }
};

const git = (...args) => gitRaw(...args)?.trim() ?? null;

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  /* no stdin — treat as empty */
}
if (input.stop_hook_active) process.exit(0);

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (!branch || branch === "HEAD") process.exit(0);

const count = Number(git("rev-list", "--count", "HEAD", "--not", "--remotes"));
if (!Number.isFinite(count) || count <= 0) process.exit(0);

const defaultBranch =
  (git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD") ?? "").split("/").pop() || "main";
const remoteMain = `origin/${defaultBranch}`;
if (git("merge-base", "--is-ancestor", "HEAD", remoteMain) !== null) process.exit(0);
if (git("diff", "--quiet", `${remoteMain}...HEAD`) !== null) process.exit(0);

const now = Date.now();
const repoRoot = git("rev-parse", "--show-toplevel");
const statusRecords = (gitRaw("status", "--porcelain", "-z") ?? "").split("\0").filter(Boolean);
const dirtyPaths = [];
for (let i = 0; i < statusRecords.length; i += 1) {
  const record = statusRecords[i];
  dirtyPaths.push(record.slice(3));
  if (record[0] === "R" || record[0] === "C") i += 1;
}
const editsStillInFlight =
  repoRoot !== null &&
  dirtyPaths.some((relPath) => {
    try {
      return now - statSync(path.join(repoRoot, relPath)).mtimeMs < EDIT_QUIET_MS;
    } catch {
      return false;
    }
  });
if (editsStillInFlight) process.exit(0);

const gitDir = git("rev-parse", "--absolute-git-dir");
const lastWarnFile = gitDir === null ? null : path.join(gitDir, "warn-unpushed-last.json");
if (lastWarnFile !== null) {
  try {
    const lastWarn = JSON.parse(readFileSync(lastWarnFile, "utf8"));
    if (lastWarn.branch === branch && now - lastWarn.at < WARN_COOLDOWN_MS) process.exit(0);
  } catch {
    /* no prior warning recorded */
  }
}

const reason =
  `⚠️ ${count} commit${count === 1 ? "" : "s"} on branch "${branch}" ` +
  `are not on any remote. This is an ephemeral cloud container — if it is reclaimed, that work is lost.\n\n` +
  `Push before ending:  git push -u origin ${branch}\n` +
  `If that branch name is already taken on the remote with different history, back it up instead:  ` +
  `git push origin ${branch}:backup/${branch}`;

if (lastWarnFile !== null) {
  try {
    writeFileSync(lastWarnFile, JSON.stringify({ branch, at: now }));
  } catch {
    /* best effort */
  }
}

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
