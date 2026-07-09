import { readFileSync } from "node:fs";
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

const reason =
  `⚠️ ${count} commit${count === 1 ? "" : "s"} on branch "${branch}" ` +
  `are not on any remote. This is an ephemeral cloud container — if it is reclaimed, that work is lost.\n\n` +
  `Push before ending:  git push -u origin ${branch}\n` +
  `If that branch name is already taken on the remote with different history, back it up instead:  ` +
  `git push origin ${branch}:backup/${branch}`;

process.stdout.write(JSON.stringify({ decision: "block", reason }));
process.exit(0);
