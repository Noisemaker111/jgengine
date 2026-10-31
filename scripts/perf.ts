// `bun run perf <game> | perf <gate|network|timing|flight|boat|fracture|live>`: every performance measurement.
import { runVerb, type VerbTable } from "./subcommands";

export const PERF: VerbTable = {
  name: "perf",
  summary: "measure performance: one game's frame report, the frame gate, network, test timing, or an open game",
  verbs: {
    play: { script: "scripts/perf-play.ts", guardSeconds: 420, detail: "<game...>: play each headless in one browser and print its frame report (also `bun run perf <game>`)" },
    gate: { script: "scripts/perf-gate.ts", guardSeconds: 1500, detail: "fail a reference game whose p95 frame is over 16.7 ms on the RTX 3070 at 1600x900, or that allocates GL objects after warmup" },
    network: { script: "scripts/perf-network.ts", detail: "<game...>: bytes and requests per game, cold and cached" },
    timing: { script: "scripts/bench-cpu.ts", guardSeconds: 900, detail: "run the test files that carry wall-clock budgets with the budgets enforced" },
    flight: { script: "scripts/flight-compare.ts", guardSeconds: 300, detail: "[game...]: fly each game's fixed-wing aircraft and the reference flight model through the same tests; print game / reference / real" },
    boat: { script: "scripts/boat-compare.ts", guardSeconds: 300, detail: "[game...]: run each game's boats and a reference hull (Holtrop–Mennen, Savitsky) through the same straight-line tests; print game / reference / real" },
    fracture: { script: "scripts/fracture-compare.ts", guardSeconds: 120, detail: "break a granite block with fractureRock, StructureGraph.toDebris and toDebrisBodies; print pieces, t10 and energy into motion beside the JKMRC law" },
    live: { script: "scripts/debug-report.ts", guardSeconds: 60, detail: "<game>: read the report a game open in a browser is producing and gate it" },
  },
  fallback: "play",
  example: "bun run perf deepward",
};

if (import.meta.main) process.exit(runVerb(PERF, process.argv.slice(2)));
