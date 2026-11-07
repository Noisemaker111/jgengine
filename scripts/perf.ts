// `bun run perf <game> | perf <gate|fps-gap|network|server|timing|flight|boat|fracture|live>`: every performance measurement.
import { runVerb, type VerbTable } from "./subcommands";

export const PERF: VerbTable = {
  name: "perf",
  summary: "measure performance: one game's frame report, the frame gate, the 360 fps gap, network, test timing, or an open game",
  verbs: {
    play: { script: "scripts/perf-play.ts", guardSeconds: 420, detail: "<game...>: play each headless in one browser and print its frame report (also `bun run perf <game>`)" },
    gate: { script: "scripts/perf-gate.ts", guardSeconds: 1500, detail: "measure every playable game; fail a p95 frame over 16.7 ms on the RTX 3070 at 1600x900, or GL objects allocated after warmup" },
    "fps-gap": { script: "scripts/perf-fps-gap.ts", guardSeconds: 900, detail: "[--games a,b] [--markdown]: measure every game at the gate's conditions and print each against 360 fps (2.78 ms), with its costs grouped into ranked engine work; a report, not a gate" },
    network: { script: "scripts/perf-network.ts", detail: "<game...>: bytes and requests per game, cold and cached" },
    server: { script: "scripts/perf-server.ts", guardSeconds: 540, detail: "[--players 16,32,64,128]: N players posing in one room on the real host and router; wall and CPU ms, MB and messages out per game second" },
    timing: { script: "scripts/bench-cpu.ts", guardSeconds: 900, detail: "run the test files that carry wall-clock budgets with the budgets enforced" },
    flight: { script: "scripts/flight-compare.ts", guardSeconds: 300, detail: "[game...]: fly each game's fixed-wing aircraft and the reference flight model through the same tests; print game / reference / real" },
    boat: { script: "scripts/boat-compare.ts", guardSeconds: 300, detail: "[game...]: run each game's boats and a reference hull (Holtrop–Mennen, Savitsky) through the same straight-line tests; print game / reference / real" },
    fracture: { script: "scripts/fracture-compare.ts", guardSeconds: 120, detail: "break a granite block with fractureRock, StructureGraph.toDebris and toDebrisBodies; print pieces, t10 and energy into motion beside the JKMRC law" },
    live: { script: "scripts/debug-report.ts", guardSeconds: 60, detail: "<game>: read the report a game open in a browser is producing and gate it" },
    desktop: { script: "scripts/perf-desktop.ts", detail: "<debug-port> --out <file>: read a diagnostic desktop app's existing frame report" },
  },
  fallback: "play",
  example: "bun run perf deepward",
};

if (import.meta.main) process.exit(runVerb(PERF, process.argv.slice(2)));
