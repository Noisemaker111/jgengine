// Session start on this PC: say whether the checkout is cold, whether this branch has unpushed
// commits, and whether beta's AGENTS.md moved since it branched. Nothing else: the flow, worktrees
// and landing live in AGENTS.md.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const git = (...args) => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"], timeout: 15000 })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const notes = [];

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch && branch !== "HEAD" && branch !== "beta" && branch !== "main") {
  const unpushed = Number(git("rev-list", "--count", "HEAD", "--not", "--remotes")) || 0;
  if (unpushed > 0) notes.push(`"${branch}" has ${unpushed} commit(s) not pushed yet.`);
  // A lane resumed days later reads the rules as they were when it branched: one such lane still followed
  // the landing queue removed on Nov 7. lane:close already runs beta's landing code; this tells the agent
  // the rules moved too. It reads the last fetched origin/beta, so it never waits on the network.
  const forked = git("merge-base", "HEAD", "origin/beta");
  const rules = ["AGENTS.md", "games/AGENTS.md"];
  if (forked && git("diff", "--quiet", forked, "origin/beta", "--", ...rules) === null) {
    notes.push(
      `AGENTS.md changed on beta since "${branch}" branched, so the copy in this checkout is out of date. ` +
        "Beta's rules win: read what changed with `git diff HEAD...origin/beta -- AGENTS.md games/AGENTS.md`.",
    );
  }
}

const cold =
  !existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo")) &&
  !existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo.exe"));
if (cold && process.env.JG_PARENT_SOURCE_ONLY !== "1") {
  // Through `background start`, which creates the process outside this hook's Windows job: a detached
  // spawn stays in the job and died with the hook, leaving an empty log and no install (2026-11-08).
  let id = null;
  try {
    const started = execFileSync("bun", ["scripts/background.ts", "start", "--", "bun", "scripts/agent-bootstrap.ts"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      timeout: 45000,
    });
    id = started.toString().trim().split("\n").pop()?.trim() || null;
  } catch {}
  notes.push(
    id
      ? `Cold checkout: \`bun run agent:bootstrap\` was started in the background as task ${id} (log: .agent-bootstrap.log; \`bun run background status ${id}\`). ` +
          "Do not start it again and never kill it. Before tests, type-checks or gen, run `bun run agent:bootstrap --check`."
      : "degraded: the bootstrap could not be started. Cold checkout: run `bun run agent:bootstrap` as a harness background command before tests, type-checks or gen. Never kill a running install.",
  );
}

if (notes.length > 0) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: notes.join("\n\n") } }),
  );
}
process.exit(0);
