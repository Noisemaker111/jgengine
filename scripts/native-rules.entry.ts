/**
 * Deepward's real 60 Hz game tick, headless, behind one call per tick: the entry `bun run perf native`
 * bundles for the embedded V8 in the native app (row B) and benches under Bun.
 *
 * The API is batched so a host pays one boundary crossing per tick: `tick(dt, held)` takes the held
 * movement keys as bits and writes the results into `columns` (a Float64Array the host can share):
 * the player's position and heading, the HUD's meters and the tick count. The same layout is what
 * the Rust port of the tick (jg-rules) reads and writes.
 */
import "./native-rules.shims";
import { createHeadlessRunner } from "../packages/core/src/runtime/headlessRunner";
import { game } from "../games/deepward/src/game";
import { stageMidDive, viewStore, whenReady } from "../games/deepward/src/game/controls";

/** Column layout, shared with native/crates/jg-rules (`Col`). */
export const COL = { x: 0, y: 1, z: 2, heading: 3, food: 4, water: 5, scrip: 6, tick: 7, mode: 8, ready: 9 } as const;
export const COLUMNS = 16;
/** Held-key bits in `tick(dt, held)`. */
export const HELD = { forward: 1, back: 2, left: 4, right: 8 } as const;

const MODES = ["loading", "title", "home", "dive", "saving", "blocked", "reprinting"];

export interface NativeRules {
  columns: Float64Array;
  /** Advance one tick of `dt` seconds with the held keys (heading NaN keeps the current one); returns the scaled game dt the tick saw. */
  tick(dt: number, held: number, heading: number): number;
}

/** `home`: the walk at Marrow the scene export records. `dive`: a loaded dive in the vault, where the Fitter's senses and routing, the fauna and the suit meters all run each tick. */
export type Scenario = "home" | "dive";

export function createNativeRules(columns: Float64Array = new Float64Array(COLUMNS), scenario: Scenario = "home"): NativeRules {
  let clock = 0;
  const runner = createHeadlessRunner({ game, now: () => clock, seed: "native", maxStepSeconds: 1 / 30 });
  const ctx = runner.ctx;
  let ready = false;
  void whenReady(ctx).then(async () => {
    viewStore.update(ctx, (v) => ({ ...v, mode: v.mode === "loading" || v.mode === "title" ? "home" : v.mode }));
    ctx.time.play();
    if (scenario === "dive") await stageMidDive(ctx);
    ready = true;
  });
  const heldNames: string[] = [];
  const write = (): void => {
    const pose = ctx.scene.entity.get(ctx.player.userId);
    const v = viewStore.read(ctx);
    const body = (v as { deep?: { body?: { values?: Record<string, number> } } }).deep?.body?.values ?? {};
    columns[COL.x] = pose?.position[0] ?? 0;
    columns[COL.y] = pose?.position[1] ?? 0;
    columns[COL.z] = pose?.position[2] ?? 0;
    columns[COL.heading] = runner.look.heading;
    columns[COL.food] = body["food"] ?? 0;
    columns[COL.water] = body["water"] ?? 0;
    columns[COL.scrip] = (v as { scrip?: number }).scrip ?? 0;
    columns[COL.tick] = runner.tick();
    columns[COL.mode] = MODES.indexOf(v.mode);
    columns[COL.ready] = ready ? 1 : 0;
  };
  return {
    columns,
    tick(dt, held, heading) {
      clock += dt * 1000;
      heldNames.length = 0;
      if (held & HELD.forward) heldNames.push("moveForward");
      if (held & HELD.back) heldNames.push("moveBack");
      if (held & HELD.left) heldNames.push("moveLeft");
      if (held & HELD.right) heldNames.push("moveRight");
      if (Number.isFinite(heading)) runner.aim({ heading });
      const seen = runner.step(dt, { held: heldNames });
      write();
      return seen;
    },
  };
}

const host = globalThis as { __jgRules?: NativeRules; __jgScenario?: Scenario };
host.__jgRules = createNativeRules(undefined, host.__jgScenario ?? "home");
