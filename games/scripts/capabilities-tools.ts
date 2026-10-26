// `bun run games:capabilities probe`: boot each game and prove the capabilities its jgengine.json declares
// are live. `bun run jgengine sync` writes those answers; the ledger is `bun run gen games-ledger`.
import { runVerb, type VerbTable } from "../../scripts/subcommands";

export const CAPABILITIES: VerbTable = {
  name: "games:capabilities",
  summary: "prove the capabilities each game's jgengine.json declares",
  verbs: {
    probe: { script: "games/scripts/capabilities-probe.ts", detail: "[game...]: boot each game that names a probe and prove the system is live" },
  },
  example: "bun run games:capabilities probe deepward",
};

if (import.meta.main) process.exit(runVerb(CAPABILITIES, process.argv.slice(2)));
