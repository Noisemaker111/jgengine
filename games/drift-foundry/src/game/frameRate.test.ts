import { describe, expect, test } from "bun:test";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runPlayScript, type PlayScriptSpec } from "@jgengine/shell/play";
import { game } from "../game.config";
import { runSessionStore } from "./run/session";

/**
 * The same corridor run at 30 and 144 fps must cover the same distance.
 *
 * The throttle is held over an explicit window of simulation ticks, so both runs press it on the same
 * step of game time and only the display cadence differs. A play script's own `use`/`move` windows are
 * counted in frames, which start a simulation tick apart at 30 and 144 fps; that is a harness phase
 * offset, not a difference in the simulation, and it cannot be told apart from one inside the run.
 *
 * `simulation.hz: 60` in the game config is what makes the kart, rivals, compactor and run clock see
 * one 1/60 step either way. The probe samples per simulation step (`ctx.sim.addStage`) rather than per
 * frame, so a coarse frame rate cannot hide a difference.
 */

const SLOW_FPS = 30;
const FAST_FPS = 144;
/** Throttle held for exactly this many simulation steps, at either frame rate. */
const HOLD_FROM_TICK = 30;
const HOLD_TO_TICK = 150;
/** Two runs over the same simulation steps may differ by this much before the config is at fault. */
const TRAVEL_TOLERANCE_M = 0.005;
/** A kart that never moved would prove nothing. */
const MIN_TRAVEL_M = 5;

const frames = (seconds: number, fps: number): number => Math.round(seconds * fps);

function kartPositionOf(ctx: GameContext) {
  return runSessionStore.peek(ctx)?.snapshot().pose.position ?? null;
}

function drive(fps: number): { meters: number; ticks: number } {
  const trail = new Map<number, readonly [number, number, number]>();
  const script: PlayScriptSpec = {
    seed: "drift-frame-rate-throttle",
    dt: 1 / fps,
    // Two extra frames past the hold so the last step is simulated at both rates.
    ticks: frames(HOLD_TO_TICK / 60, fps) + 2,
    setup(ctx) {
      runSessionStore.peek(ctx)?.start();
      ctx.sim.addStage({
        id: "frame-rate-throttle",
        phase: "beforeMovement",
        run: (_dt, tick) => {
          ctx.input.publish(tick >= HOLD_FROM_TICK && tick < HOLD_TO_TICK ? ["throttle"] : []);
        },
      });
      ctx.sim.addStage({
        id: "frame-rate-throttle-sample",
        phase: "afterTick",
        run: (_dt, tick) => {
          const position = kartPositionOf(ctx);
          if (position !== null) trail.set(tick, position);
        },
      });
    },
    expect: [],
  };
  const run = runPlayScript(game, script);
  const from = trail.get(HOLD_FROM_TICK);
  const to = trail.get(HOLD_TO_TICK);
  if (from === undefined || to === undefined) throw new Error(`drive at ${fps} fps only reached tick ${Math.max(0, ...trail.keys())} - the fixed-step loop is not advancing this run`);
  return { meters: Math.hypot(to[0] - from[0], to[2] - from[2]), ticks: run.ticks };
}

describe("Drift Foundry runs the same at any frame rate", () => {
  test("the kart covers the same distance at 30 and 144 fps", () => {
    const slow = drive(SLOW_FPS);
    const fast = drive(FAST_FPS);
    console.log(
      `Drift kart ${HOLD_FROM_TICK}..${HOLD_TO_TICK}: 30 fps ${slow.meters.toFixed(3)} m, 144 fps ${fast.meters.toFixed(3)} m, delta ${Math.abs(slow.meters - fast.meters).toFixed(4)} m`,
    );
    expect(slow.meters).toBeGreaterThan(MIN_TRAVEL_M);
    expect(Math.abs(slow.meters - fast.meters)).toBeLessThan(TRAVEL_TOLERANCE_M);
  });
});
