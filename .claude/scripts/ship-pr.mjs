import { execFileSync } from "node:child_process";

const dry = process.argv.includes("--dry-run");
const ROCKET = "\u{1F680}";

const read = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

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
  pr = JSON.parse(read("gh", ["pr", "view", "--json", "number,title,isDraft,url"]));
} catch {
  mutate("gh", ["pr", "create", "--fill", "--head", branch]);
  pr = JSON.parse(read("gh", ["pr", "view", "--json", "number,title,isDraft,url"]));
}

let title = pr.title;
if (!title.startsWith(ROCKET)) {
  title = `${ROCKET} ${title}`;
  mutate("gh", ["pr", "edit", String(pr.number), "--title", title]);
}
if (pr.isDraft) mutate("gh", ["pr", "ready", String(pr.number)]);

try {
  mutate("gh", ["pr", "merge", String(pr.number), "--squash", "--delete-branch"]);
} catch (e) {
  const msg = String(e?.stderr ?? e?.message ?? e);
  if (!/checked out|worktree/i.test(msg)) {
    console.error(`ship-pr: merge failed for #${pr.number}\n${msg}`);
    process.exit(1);
  }
  console.log(`(local branch left in place — it is checked out in this worktree; ExitWorktree to remove)`);
}

console.log(`${dry ? "[dry-run] would ship" : `${ROCKET} shipped`} #${pr.number}  ${title}\n${pr.url}`);
