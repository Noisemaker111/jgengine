// `bun run shoot`: the one capture command. A plain run is one guarded `shoot-dev` capture;
// `--prove` builds an evidence bundle (games/scripts/prove.ts), which runs and guards each of its
// own captures, so it is not held to a single capture's time limit.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

const root = fileURLToPath(new URL("..", import.meta.url));

/** One capture may take this long before the guard ends it. */
export const SHOOT_GUARD_SECONDS = 420;

const SHOOT_USAGE = {
  summary: "capture a game, a fixture or a page; --prove builds an evidence bundle instead",
  usage: "bun run shoot <game> [capture flags] | bun run shoot --prove <game> --view <name> [prove flags]",
  flags: [
    { flag: "--prove", detail: "capture each view at each size, a control pair and a driven flow into one manifest (bun run shoot --prove --help lists its flags)" },
    { flag: "capture flags", detail: "listed below" },
  ],
  example: "bun run shoot hold-the-line --mode play",
} as const;

/** The command a shoot argv runs: the prove bundle, or one guarded capture. */
export function shootCommand(argv: readonly string[]): string[] {
  if (argv[0] === "--prove") return ["games/scripts/prove.ts", ...argv.slice(1)];
  return ["scripts/guard.ts", String(SHOOT_GUARD_SECONDS), "bun scripts/shoot-dev.ts", ...argv];
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv[0] !== "--prove") printHelpIfAsked("shoot", SHOOT_USAGE, argv);
  const run = spawnSync(process.execPath, shootCommand(argv), { cwd: root, stdio: "inherit" });
  process.exit(run.status ?? 1);
}
