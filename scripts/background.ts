// `bun run background <start|await>`: run a long command detached, then wait for it once.
import { runVerb, type VerbTable } from "./subcommands";

export const BACKGROUND: VerbTable = {
  name: "background",
  summary: "run a long command in the background and wait for it on its exit, never on a timer",
  verbs: {
    start: { script: "scripts/bg-run.ts", detail: "-- <command>: start it detached and print its id" },
    await: { script: "scripts/bg-await.ts", detail: "<id>: block until that command exits, then print its tail and exit code" },
  },
  example: "bun run background start -- bun run verify:fast --full",
};

if (import.meta.main) process.exit(runVerb(BACKGROUND, process.argv.slice(2)));
