// `bun run perf <game> | perf <gate|network|timing|flight|live>`: every performance measurement.
import { runVerb, type VerbTable } from "./subcommands";

export const PERF: VerbTable = {
  name: "perf",
  summary: "measure performance: one game's frame report, the frame gate, network, test timing, or an open game",
  verbs: {
    play: { script: "scripts/perf-play.ts", guardSeconds: 420, detail: "<game...>: play each headless in one browser and print its frame report (also `bun run perf <game>`)" },
    gate: { script: "scripts/perf-gate.ts", guardSeconds: 1500, detail: "fail when reference games exceed their render budgets after warmup" },
    network: { script: "scripts/perf-network.ts", detail: "<game...>: bytes and requests per game, cold and cached" },
    timing: { script: "scripts/bench-cpu.ts", guardSeconds: 900, detail: "run the test files that carry wall-clock budgets with the budgets enforced" },
    flight: { script: "scripts/flight-compare.ts", guardSeconds: 300, detail: "[game...]: fly each game's fixed-wing aircraft and the reference flight model through the same tests; print game / reference / real" },
    live: { script: "scripts/debug-report.ts", guardSeconds: 60, detail: "<game>: read the report a game open in a browser is producing and gate it" },
  },
  fallback: "play",
  example: "bun run perf deepward",
};

if (import.meta.main) process.exit(runVerb(PERF, process.argv.slice(2)));
