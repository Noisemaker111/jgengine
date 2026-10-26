// `bun run games:capabilities <declare|probe>`: the per-game capability ledger tools. The ledger's
// sync is `bun run gen games-ledger` and its gates are `bun run check games-ledger games-capabilities`.
import { runVerb, type VerbTable } from "../../scripts/subcommands";

export const CAPABILITIES: VerbTable = {
  name: "games:capabilities",
  summary: "seed or prove each game's capabilities.json",
  verbs: {
    declare: { script: "games/scripts/capabilities-declare.ts", detail: "[game...] [--force]: seed a game's capabilities.json from its imports" },
    probe: { script: "games/scripts/capabilities-probe.ts", detail: "[game...]: boot each game that names a probe and prove the system is live" },
  },
  example: "bun run games:capabilities probe deepward",
};

if (import.meta.main) process.exit(runVerb(CAPABILITIES, process.argv.slice(2)));
