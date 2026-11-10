// Puts tally's before/after numbers for one PR into its body: benchmarks the
// tasks the diff touches on base and head (tally.tasks.json), alternating.
// Never fails the caller — every problem prints `degraded:` and exits 0.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pr = process.argv[2];
if (!pr || !/^\d+$/.test(pr)) {
  console.log("usage: tally-pr.ts <pr-number>");
  process.exit(0);
}
// A land that must not run or wait on a timed step (a busy PC, a game open) sets TALLY_PR=off.
if (process.env["TALLY_PR"] === "off") {
  console.log("degraded: TALLY_PR=off; benchmark skipped");
  process.exit(0);
}
const cli = process.env["TALLY_CLI"] || join(homedir(), "Projects", "tally", "src", "cli.mjs");
if (!existsSync(cli)) {
  console.log("degraded: tally cli not found (set TALLY_CLI to tally's src/cli.mjs); benchmark skipped");
  process.exit(0);
}
const run = spawnSync(process.execPath, [cli, "pr", pr], { cwd: root, stdio: "inherit" });
if (run.error) console.log(`degraded: tally pr failed to start: ${run.error.message}`);
else if (run.status !== 0) console.log(`degraded: tally pr exited ${run.status}; benchmark skipped`);
process.exit(0);
