/**
 * Deepward's real game tick for the native experiment: bundle it for the native app's embedded V8,
 * and bench it under Bun on the perf walk.
 *
 *   bun games/deepward/scripts/native-rules.ts bundle <out.js>   one IIFE file defining globalThis.__jgRules
 *   bun games/deepward/scripts/native-rules.ts bench [seconds]   60 Hz ticks along the walk, per-tick ms
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Scenario } from "./native-rules.entry";

const repoRoot = join(import.meta.dir, "..", "..", "..");

/** The perf walk as held-key bits per tick: W held, A and D swapped every 1.5 s (perf-breakdown's "walk"). */
export function walkHeld(t: number): number {
  return 1 | (Math.floor(t / 1.5) % 2 === 0 ? 4 : 8);
}

export async function bundleRules(out: string): Promise<void> {
  mkdirSync(dirname(out), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "native-rules.entry.ts")],
    target: "browser",
    format: "iife",
    minify: false,
    sourcemap: "none",
    // A classic script has no import.meta: the production build's env, and a file URL the asset paths resolve against.
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
      "import.meta.env.NODE_ENV": '"production"',
      "import.meta.env.VITE_JGENGINE_DEV_PROXY": "undefined",
      "import.meta.env": '{"DEV":false,"PROD":true,"NODE_ENV":"production"}',
      "import.meta.url": '"file:///jgengine/native-rules.js"',
    },
    // Vite asset imports (`?url`, `?raw`, `?worker`) and stylesheets only feed the browser renderer and UI,
    // which the native host replaces, so they bundle as empty strings.
    plugins: [{
      name: "native-asset-stubs",
      setup(build) {
        build.onResolve({ filter: /\?(url|raw|worker|inline)$|\.css$/ }, (args) => ({ path: args.path, namespace: "native-stub" }));
        build.onLoad({ filter: /.*/, namespace: "native-stub" }, () => ({ contents: "export default \"\";", loader: "js" }));
      },
    }],
  });
  if (!result.success) throw new Error(`bundle failed:\n${result.logs.map(String).join("\n")}`);
  const [artifact] = result.outputs;
  if (artifact === undefined) throw new Error("bundle produced no output");
  await Bun.write(out, artifact);
  console.log(`native rules: wrote ${out} (${(artifact.size / 1e6).toFixed(1)} MB)`);
}

export async function benchRules(seconds: number, scenario: Scenario = "home"): Promise<{ p50: number; p99: number; mean: number; ticks: number }> {
  const { createNativeRules, COL } = await import("./native-rules.entry");
  const rules = createNativeRules(undefined, scenario);
  // Let the boot promise settle (it reads the save record), as the host's first frames do.
  for (let i = 0; i < 300 && rules.columns[COL.ready] !== 1; i += 1) { rules.tick(1 / 60, 0, Number.NaN); await Promise.resolve(); await Bun.sleep(1); }
  const dt = 1 / 60;
  const times: number[] = [];
  for (let i = 0; i < seconds * 60; i += 1) {
    const t0 = performance.now();
    rules.tick(dt, walkHeld(i * dt), Number.NaN);
    times.push(performance.now() - t0);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const c = rules.columns;
  console.log(`native rules (bun, ${scenario}): ${times.length} ticks, p50 ${q(0.5).toFixed(3)} ms, p99 ${q(0.99).toFixed(3)} ms, mean ${mean.toFixed(3)} ms; player at ${c[COL.x]?.toFixed(2)}, ${c[COL.z]?.toFixed(2)} mode ${c[COL.mode]} food ${c[COL.food]?.toFixed(1)}`);
  return { p50: q(0.5), p99: q(0.99), mean, ticks: times.length };
}

/**
 * The data the Rust port of the tick (native/crates/jg-rules) runs on, read from the game's own modules so
 * the port never carries a second copy: the authored floors and solids, the Fitter's senses, the movement and
 * body tuning, and where each scenario starts once the real tick has booted it.
 */
export async function exportRulesWorld(out: string): Promise<void> {
  const world = await import("../src/world");
  const { clutterFootprint } = await import("../src/game/interiorPlan");
  const { FITTER_SIGHT, FITTER_CONE_DEG, FITTER_HEARING } = await import("../src/game/controls");
  const { BODY, HOME_DRAIN, GALLEY_FEEDS_BELOW, MEAL } = await import("../src/game/survival");
  const { MOVEMENT_TUNING } = await import("../../../packages/core/src/movement/movementModel");
  const { STRATA } = await import("../src/game/strata");
  const { createNativeRules, COL } = await import("./native-rules.entry");
  const rect = (r: { x: number; z: number; w: number; d: number }) => ({ x: r.x, z: r.z, w: r.w, d: r.d });
  const places = ["home", "vault"] as const;
  const solids = Object.fromEntries(places.map((place) => [place, [
    ...world.STATION_SOLIDS.filter((r) => r.place === place).map(rect),
    ...(place === "home" ? [] : world.floorDressing(place).props.map(({ slot }) => { const b = clutterFootprint(slot); return { x: b.x, z: b.z, w: b.w * 0.8, d: b.d * 0.8 }; })),
    ...(place === "vault" ? world.PROPS.map(rect) : []),
  ]]));
  const starts: Record<string, number[]> = {};
  for (const scenario of ["home", "dive"] as const) {
    const rules = createNativeRules(undefined, scenario);
    for (let i = 0; i < 300 && rules.columns[COL.ready] !== 1; i += 1) { rules.tick(1 / 60, 0, Number.NaN); await Bun.sleep(1); }
    starts[scenario] = Array.from(rules.columns);
  }
  const data = {
    bounds: world.WORLD_BOUNDS,
    rooms: Object.fromEntries(places.map((place) => [place, world.ROOMS.filter((r) => r.place === place).map(rect)])),
    solids,
    radius: 0.28,
    navCell: 0.5,
    fitter: { spawn: world.PRINT_SPAWN, sight: FITTER_SIGHT, coneDeg: FITTER_CONE_DEG, hearing: FITTER_HEARING, memorySeconds: 0.5, speed: 2.5, receivingBackZ: world.RECEIVING_BACK_Z },
    movement: { ...MOVEMENT_TUNING, walkSpeed: 4.4 },
    body: { meters: BODY.map((m) => ({ id: m.id, max: m.max, rate: m.rate })), homeDrain: HOME_DRAIN, galleyFeedsBelow: GALLEY_FEEDS_BELOW, meal: MEAL, vaultDrain: STRATA.vault.drain },
    starts,
  };
  mkdirSync(dirname(out), { recursive: true });
  await Bun.write(out, JSON.stringify(data, null, 1));
  const count = (m: Record<string, unknown[]>) => Object.values(m).reduce((n, v) => n + v.length, 0);
  console.log(`native rules: wrote ${out} (${count(data.rooms)} rooms, ${count(solids)} solids)`);
}

if (import.meta.main) {
  const [verb, arg] = process.argv.slice(2);
  if (verb === "bundle") await bundleRules(arg ?? join(repoRoot, ".scratch", "native", "rules", "deepward.js"));
  else if (verb === "world") await exportRulesWorld(arg ?? join(repoRoot, ".scratch", "native", "rules", "deepward.world.json"));
  else if (verb === "bench") await benchRules(Number(arg ?? 13), (process.argv[4] ?? "home") as Scenario);
  else { console.error("usage: bun games/deepward/scripts/native-rules.ts bundle <out.js> | world <out.json> | bench [seconds] [home|dive]"); process.exit(2); }
}
