// `bun run games:capabilities probe`: boot each game and prove the capabilities its jgengine.json declares
// are live. `bun run jgengine sync` writes those answers; the ledger is `bun run gen games-ledger`.
// `bun run games:capabilities handling`: score a game's cars against a real-physics reference car.
// `bun run games:capabilities locomotion`: score a game's walking player against a real person.
import { runVerb, type VerbTable } from "../../scripts/subcommands";

export const CAPABILITIES: VerbTable = {
  name: "games:capabilities",
  summary: "prove the capabilities each game's jgengine.json declares, and measure its vehicles and walking players against real physics",
  verbs: {
    probe: { script: "games/scripts/capabilities-probe.ts", detail: "[game...]: boot each game that names a probe and prove the system is live" },
    handling: {
      script: "games/scripts/handling-compare.ts",
      guardSeconds: 600,
      detail: "<module>#<export>... [--car <id>] [--json] | --validate: each VehicleSpec/tuning vs the reference car and a real car's published tests; --validate checks the reference cars themselves",
    },
    locomotion: {
      script: "games/scripts/locomotion-compare.ts",
      guardSeconds: 600,
      detail: "[game[:entity]...] [--sprint] [--json] | --creatures <module>#<export> | --falls | --validate: each game's walking player vs a real person (start, stop, turn, jump, landing, slope); --creatures scores creatures' walk and sprint against real animals; --falls drops the stock humanoid ragdoll vs a simulated person and injury limits; --validate checks the references",
    },
  },
  example: "bun run games:capabilities probe deepward",
};

if (import.meta.main) process.exit(runVerb(CAPABILITIES, process.argv.slice(2)));
