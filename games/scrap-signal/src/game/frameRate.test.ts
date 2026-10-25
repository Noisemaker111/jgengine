import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runPlayScript, type PlayScriptSpec } from "@jgengine/shell/play";
import { game } from "../game.config";

/**
 * The same run at 30 and 144 fps must cover the same ground and reach the same jump apex.
 *
 * Movement is held over an explicit window of simulation ticks, so both runs hold the key on the same
 * step of game time and only the display cadence differs. A play script's own `move`/`use` windows are
 * counted in frames, which start a simulation tick apart at 30 and 144 fps; that is a harness phase
 * offset, not a difference in the simulation, and it cannot be told apart from one inside the run.
 *
 * `simulation.hz: 60` in the game config is what makes the per-tick math see one 1/60 step either way.
 * The probe samples per simulation step (`ctx.sim.addStage`) rather than per frame, so a coarse frame
 * rate cannot hide a difference.
 */

const SLOW_FPS = 30;
const FAST_FPS = 144;
/** Forward held for exactly this many simulation steps, at either frame rate. */
const WALK_FROM_TICK = 30;
const WALK_TO_TICK = 150;
const JUMP_SECONDS = 1.5;
/** Two runs over the same simulation steps may differ by this much before the config is at fault. */
const TRAVEL_TOLERANCE_M = 0.005;
/** Jump apex is one engine value; a fixed step may only shift it by float rounding. */
const APEX_TOLERANCE_M = 0.005;

const frames = (seconds: number, fps: number): number => Math.round(seconds * fps);

function positionOf(ctx: GameContext) {
  return ctx.scene.entity.get(ctx.player.userId)?.position ?? null;
}

/** Leave the character-select gate and run the clock, the way the menu does. */
function beginRun(ctx: GameContext): void {
  ctx.game.commands.run("character.pick", { characterId: "gunk" });
  ctx.time.play();
}

function walk(fps: number): { meters: number; ticks: number } {
  const trail = new Map<number, readonly [number, number, number]>();
  const script: PlayScriptSpec = {
    seed: "scrap-frame-rate-walk",
    dt: 1 / fps,
    // Two extra frames past the hold so the last step is simulated at both rates.
    ticks: frames(WALK_TO_TICK / 60, fps) + 2,
    setup(ctx) {
      beginRun(ctx);
      ctx.sim.addStage({
        id: "frame-rate-walk",
        phase: "beforeMovement",
        run: (_dt, tick) => {
          ctx.input.publish(tick >= WALK_FROM_TICK && tick < WALK_TO_TICK ? ["moveForward"] : []);
        },
      });
      ctx.sim.addStage({
        id: "frame-rate-walk-sample",
        phase: "afterTick",
        run: (_dt, tick) => {
          const position = positionOf(ctx);
          if (position !== null) trail.set(tick, position);
        },
      });
    },
    expect: [],
  };
  const run = runPlayScript(game, script);
  const from = trail.get(WALK_FROM_TICK);
  const to = trail.get(WALK_TO_TICK);
  if (from === undefined || to === undefined) throw new Error(`walk at ${fps} fps only reached tick ${Math.max(0, ...trail.keys())} - the fixed-step loop is not advancing this run`);
  return { meters: Math.hypot(to[0] - from[0], to[2] - from[2]), ticks: run.ticks };
}

function jump(fps: number): { apex: number; ticks: number } {
  let ground = 0;
  let peak = Number.NEGATIVE_INFINITY;
  const script: PlayScriptSpec = {
    seed: "scrap-frame-rate-jump",
    dt: 1 / fps,
    ticks: frames(0.5 + JUMP_SECONDS, fps),
    setup(ctx) {
      beginRun(ctx);
      ground = positionOf(ctx)?.[1] ?? 0;
      ctx.sim.addStage({
        id: "frame-rate-jump",
        phase: "afterTick",
        run: () => {
          const y = positionOf(ctx)?.[1];
          if (y !== undefined && y > peak) peak = y;
        },
      });
    },
    steps: [{ tick: frames(0.5, fps), action: "use", actionId: "jump", ticks: 2, label: "tap jump" }],
    expect: [],
  };
  const run = runPlayScript(game, script);
  return { apex: peak - ground, ticks: run.ticks };
}

describe("Scrap Signal runs the same at any frame rate", () => {
  test("the walk covers the same distance at 30 and 144 fps", () => {
    const slow = walk(SLOW_FPS);
    const fast = walk(FAST_FPS);
    console.log(
      `Scrap walk ${WALK_FROM_TICK}..${WALK_TO_TICK}: 30 fps ${slow.meters.toFixed(3)} m, 144 fps ${fast.meters.toFixed(3)} m, delta ${Math.abs(slow.meters - fast.meters).toFixed(4)} m`,
    );
    // A walk that never left the spawn would prove nothing.
    expect(slow.meters).toBeGreaterThan(5);
    expect(Math.abs(slow.meters - fast.meters)).toBeLessThan(TRAVEL_TOLERANCE_M);
  });

  test("the jump reaches the same apex at 30 and 144 fps", () => {
    const slow = jump(SLOW_FPS);
    const fast = jump(FAST_FPS);
    console.log(
      `Scrap jump apex: 30 fps ${slow.apex.toFixed(3)} m, 144 fps ${fast.apex.toFixed(3)} m, delta ${Math.abs(slow.apex - fast.apex).toFixed(4)} m`,
    );
    expect(slow.apex).toBeGreaterThan(0.5);
    expect(Math.abs(slow.apex - fast.apex)).toBeLessThan(APEX_TOLERANCE_M);
  });
});
