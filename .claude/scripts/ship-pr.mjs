import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry-run");
const ROCKET = "\u{1F680}";

const read = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const tryRead = (cmd, args) => {
  try {
    return read(cmd, args);
  } catch {
    return null;
  }
};
const mutate = (cmd, args) => {
  if (dry) {
    console.log(`[dry-run] ${cmd} ${args.join(" ")}`);
    return "";
  }
  return read(cmd, args);
};

const branch = read("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch === "main" || branch === "HEAD") {
  console.error(`ship-pr: refusing to ship from "${branch}" — run this from your worktree branch.`);
  process.exit(1);
}

mutate("git", ["push", "-u", "origin", branch]);

let pr;
try {
  pr = JSON.parse(read("gh", ["pr", "view", "--json", "number,url,title"]));
} catch {
  mutate("gh", ["pr", "create", "--fill", "--head", branch]);
  pr = JSON.parse(read("gh", ["pr", "view", "--json", "number,url,title"]));
}

mutate("gh", ["pr", "merge", String(pr.number), "--squash"]);
if (!dry) tryRead("git", ["push", "origin", "--delete", branch]);

const primary = read("git", ["worktree", "list", "--porcelain"])
  .split("\n")
  .find((l) => l.startsWith("worktree "))
  ?.slice("worktree ".length)
  .trim();

let primaryNote = "could not locate the primary checkout";
if (primary) {
  const cur = tryRead("git", ["-C", primary, "rev-parse", "--abbrev-ref", "HEAD"]);
  const dirty = tryRead("git", ["-C", primary, "status", "--porcelain"]);
  if (cur === "main") {
    primaryNote = "primary checkout already on main";
  } else if (dirty) {
    primaryNote = `primary checkout on "${cur}" has uncommitted changes — left as-is (a session may be using it): ${primary}`;
  } else if (dry) {
    primaryNote = `[dry-run] would return primary checkout to main if "${cur}" is fully merged: ${primary}`;
  } else {
    tryRead("git", ["-C", primary, "fetch", "origin", "main", "-q"]);
    const head = tryRead("git", ["-C", primary, "rev-parse", "HEAD"]);
    const merged =
      head !== null &&
      tryRead("git", ["-C", primary, "merge-base", "--is-ancestor", head, "origin/main"]) !== null;
    if (merged) {
      tryRead("git", ["-C", primary, "switch", "main"]);
      tryRead("git", ["-C", primary, "pull", "--ff-only"]);
      primaryNote = `primary checkout returned to main (was on "${cur}", already merged)`;
    } else {
      primaryNote = `primary checkout on "${cur}" has commits not yet on main — left as-is so nothing is lost: ${primary}`;
    }
  }
}

const rockets = `${ROCKET}${ROCKET}${ROCKET}`;
console.log(
  `\n${rockets}  ${dry ? "would merge" : "merged"} #${pr.number} — ${pr.title}\n` +
    `${pr.url}\n${primaryNote}\n` +
    `Next: ExitWorktree (remove) to drop this worktree, then echo ${ROCKET} in your reply so the chat shows it merged.`,
);
