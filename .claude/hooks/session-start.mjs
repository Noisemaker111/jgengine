// Session start on this PC: say whether the checkout is cold and whether this branch has
// unpushed commits. Nothing else: the flow, worktrees and landing live in AGENTS.md.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
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
}

const cold =
  !existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo")) &&
  !existsSync(join(process.cwd(), "node_modules", ".bin", "tsgo.exe"));
if (cold && process.env.JG_PARENT_SOURCE_ONLY !== "1") {
  let pid = null;
  try {
    const fd = openSync(join(process.cwd(), ".agent-bootstrap.log"), "a");
    const child = spawn("bun", ["scripts/agent-bootstrap.ts"], {
      cwd: process.cwd(),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", fd, fd],
    });
    child.unref();
    pid = child.pid ?? null;
  } catch {}
  notes.push(
    pid
      ? "Cold checkout: `bun run agent:bootstrap` was started in the background (log: .agent-bootstrap.log). " +
          "Do not start it again and never kill it. Before tests, type-checks or gen, run `bun run agent:bootstrap --check`."
      : "Cold checkout: run `bun run agent:bootstrap` in the background before tests, type-checks or gen. Never kill a running install.",
  );
}

if (notes.length > 0) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: notes.join("\n\n") } }),
  );
}
process.exit(0);
