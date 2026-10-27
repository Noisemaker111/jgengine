// `bun run shoot`: the one capture command. A plain run is one guarded `shoot-dev` capture;
// `--prove` builds an evidence bundle (games/scripts/prove.ts), which runs and guards each of its
// own captures, so it is not held to a single capture's time limit; `--at <commit>` captures that
// commit and puts the checkout back (scripts/probe-commit.ts). `--load` times cold opens of games
// on a production build of the site (scripts/load-check.ts), guarded per run of all games.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";
import { takeVerboseFlag } from "./verbosity";

const root = fileURLToPath(new URL("..", import.meta.url));

/** One capture may take this long before the guard ends it. */
export const SHOOT_GUARD_SECONDS = 420;
/** A capture at another commit checks out, reinstalls when needed and restarts servers first. */
export const AT_COMMIT_GUARD_SECONDS = 1200;

/** A load run builds the site once and opens every game cold; the guard covers all of it. */
export const LOAD_GUARD_SECONDS = 3600;

const SHOOT_USAGE = {
  summary: "capture a game, a fixture or a page; --prove builds an evidence bundle instead",
  usage: "bun run shoot <game> [capture flags] | bun run shoot --prove <game> --view <name> [prove flags] | bun run shoot --at <commit> <game> [capture flags]",
  flags: [
    { flag: "--load", detail: "cold-cache load times per game on a production build of the site (bun run shoot --load --help lists its flags)" },
    { flag: "--prove", detail: "capture each view at each size, a control pair and a driven flow into one manifest (bun run shoot --prove --help lists its flags)" },
    { flag: "--at <commit>", detail: "capture that commit, then restore the checkout to where it was, even on failure" },
    { flag: "--verbose", detail: "also print progress, reuse and timing lines (by default only the result, its warnings and failures)" },
    { flag: "capture flags", detail: "listed below" },
  ],
  example: "bun run shoot hold-the-line --mode play",
} as const;

/** The command a shoot argv runs: the prove bundle, or one guarded capture. */
export function shootCommand(argv: readonly string[]): string[] {
  if (argv[0] === "--prove") return ["games/scripts/prove.ts", ...argv.slice(1)];
  if (argv[0] === "--at") return ["scripts/guard.ts", String(AT_COMMIT_GUARD_SECONDS), "bun scripts/probe-commit.ts", ...argv.slice(1, 2), "--", ...argv.slice(2)];
  if (argv[0] === "--load") return ["scripts/guard.ts", String(LOAD_GUARD_SECONDS), "bun scripts/load-check.ts", ...argv.slice(1)];
  return ["scripts/guard.ts", String(SHOOT_GUARD_SECONDS), "bun scripts/shoot-dev.ts", ...argv];
}

if (import.meta.main) {
  const argv = takeVerboseFlag(process.argv.slice(2));
  if (argv[0] !== "--prove" && argv[0] !== "--at" && argv[0] !== "--load") printHelpIfAsked("shoot", SHOOT_USAGE, argv);
  const run = spawnSync(process.execPath, shootCommand(argv), { cwd: root, stdio: "inherit" });
  process.exit(run.status ?? 1);
}
