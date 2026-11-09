// `bun run perf <game> | perf <gate|fps-gap|shadow-audit|network|server|timing|flight|boat|fracture|live|native>`: every performance measurement.
import { stayOutOfTheWay } from "./machine-priority";
import { runVerb, type VerbTable } from "./subcommands";

/**
 * Machine-wide rules every verb below runs under (`scripts/perf-lock.ts`, `scripts/machine-priority.ts`):
 *
 * - Timed work holds the one perf lock, taken before its Chrome launches, so two worktrees never
 *   time frames at once; a queued run prints `perf lock: waiting for pid <n> (…) …` once and its
 *   guard does not count the wait.
 * - This process and everything it spawns run at below-normal priority, so Jon's game and editor
 *   come first. The Chrome a mode measures is the exception, by mode:
 *   - normal priority for `play`, `gate`, `fps-gap`, `native` (the web row) and `desktop` (the app):
 *     their product is a frame time, and one taken below normal also measures whatever outranks it;
 *   - inherited below-normal for `shadow-audit` (texels, not time), `network` (bytes), `live`
 *     (reads a page Jon has open at its own priority), `timing`, `server`, `crowd`, `flight`,
 *     `boat` and `fracture` (CPU budgets measured against each other on the same run).
 *   Every record says what it waited for the lock and the priority it ran at.
 */
export const PERF: VerbTable = {
  name: "perf",
  summary: "measure performance: one game's frame report, the frame gate, the 360 fps gap, network, test timing, or an open game",
  verbs: {
    play: { script: "scripts/perf-play.ts", guardSeconds: 420, detail: "<game...>: play each headless in one browser and print its frame report (also `bun run perf <game>`)" },
    // Every game's session has its own hard deadline (gameSessionDeadlineMs), up to about 10 minutes
    // on a busy PC; these guards only back that up over a whole run of games.
    gate: { script: "scripts/perf-gate.ts", guardSeconds: 5400, detail: "measure every playable game; fail a p95 frame over 16.7 ms on the RTX 3070 at 1600x900, or GL objects allocated after warmup" },
    "fps-gap": { script: "scripts/perf-fps-gap.ts", guardSeconds: 5400, detail: "[--games a,b] [--markdown]: measure every game at the gate's conditions and print each against 360 fps (2.78 ms), with its costs grouped into ranked engine work and the GPU's work timed draw by draw; a report, not a gate" },
    "shadow-audit": { script: "scripts/perf-shadow-audit.ts", guardSeconds: 2700, detail: "[--games a,b] [--path walk|still]: play each game with the shadow cache's audit on and fail on any shadow-map texel that differs from a full redraw" },
    network: { script: "scripts/perf-network.ts", detail: "<game...>: bytes and requests per game, cold and cached" },
    server: { script: "scripts/perf-server.ts", guardSeconds: 540, detail: "[--players 16,32,64,128]: N players posing in one room on the real host and router; wall and CPU ms, MB and messages out per game second" },
    timing: { script: "scripts/bench-cpu.ts", guardSeconds: 900, detail: "run the test files that carry wall-clock budgets with the budgets enforced" },
    flight: { script: "scripts/flight-compare.ts", guardSeconds: 300, detail: "[game...]: fly each game's fixed-wing aircraft and the reference flight model through the same tests; print game / reference / real" },
    boat: { script: "scripts/boat-compare.ts", guardSeconds: 300, detail: "[game...]: run each game's boats and a reference hull (Holtrop–Mennen, Savitsky) through the same straight-line tests; print game / reference / real" },
    crowd: { script: "scripts/perf-crowd.ts", guardSeconds: 300, detail: "[--counts 1000,10000,100000]: time one crowd tick through createEntityStore + createSpatialIndex beside the same step over flat typed arrays" },
    fracture: { script: "scripts/fracture-compare.ts", guardSeconds: 120, detail: "break a granite block with fractureRock, StructureGraph.toDebris and toDebrisBodies; print pieces, t10 and energy into motion beside the JKMRC law" },
    live: { script: "scripts/debug-report.ts", guardSeconds: 60, detail: "<game>: read the report a game open in a browser is producing and gate it" },
    native: { script: "scripts/perf-native.ts", guardSeconds: 1800, detail: "<game> [--rows A,B,C,D] [--desktop <app.exe>] [--reuse]: the 360 fps experiment, the same frames on the current engine, the Rust native renderer with TS or Rust rules, and wasm+WebGPU; prints the table (native/README.md)" },
    // --all builds and measures every game in turn, about 5 minutes a game; a single --launch takes 2-3.
    desktop: { script: "scripts/perf-desktop.ts", guardSeconds: 5400, detail: "<debug-port> --out <file>: read a diagnostic desktop app's existing frame report; --launch <app.exe> [--uncapped] [--maps dir] [--flow game/name [--returning] [--trace]]: launch one at the gate's conditions and print the fps it reaches, or play a flow and list its hitches (--returning measures a second session with the first one's shader caches; --trace names what each process ran in each hitch); --all [--uncapped] [--games a,b] [--skip-build] [--reuse] [--markdown]: build every game's production desktop app, measure each in turn and print the 360 fps table (a report, not a gate)" },
  },
  fallback: "play",
  example: "bun run perf deepward",
};

if (import.meta.main) {
  // Every verb's guard and script inherit it from here.
  stayOutOfTheWay();
  process.exit(runVerb(PERF, process.argv.slice(2)));
}
