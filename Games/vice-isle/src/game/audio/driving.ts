import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** Live signal the driving loop feeds the engine/tyre audio each tick (#1051). */
export interface DrivingAudioParams {
  /** Car world position — the smoke-burst emitter anchor. */
  position: readonly [number, number, number];
  /** Throttle axis 0..1 — scales engine loop gain. */
  throttle: number;
  /** Normalised rpm 0..1 — pitches the engine loop. */
  normRpm: number;
  /** Lateral slip ratio — drives the tyre squeal gain/pitch. */
  slip: number;
  /** Friction budget exceeded on power this tick (launch chirp). */
  wheelspin: boolean;
  /** |forward speed| world units/s — gates smoke to real motion. */
  speed: number;
  /** One-based forward gear (0 reverse/neutral) — a change fires a shift click. */
  gear: number;
}

export interface DrivingAudio {
  /** Update the retained engine/tyre loops and fire gear/ smoke feedback for one driving tick. */
  tick(ctx: GameContext, params: DrivingAudioParams): void;
  /** Stop both loops (on vehicle exit / explosion) and reset gear + smoke state. */
  stop(ctx: GameContext): void;
}

const ENGINE_LOOP = "vi_engine";
const SQUEAL_LOOP = "vi_squeal";
/** ≤ 8 smoke bursts per second. */
const SMOKE_MIN_INTERVAL = 1 / 8;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * The Vice Isle driving audio driver (#1051): one retained engine loop pitched by rpm and gained by
 * throttle, one tyre-squeal loop held at gain 0 until the tyres break away (so it never clicks in and
 * out), a shift click on gear changes, and rate-limited tyre smoke while sliding or spinning at speed.
 */
export function createDrivingAudio(): DrivingAudio {
  let lastGear = -1;
  let lastSmokeAt = -1;
  return {
    tick(ctx, params) {
      ctx.game.audio.loop(ENGINE_LOOP, "engine_loop");
      ctx.game.audio.setLoop(ENGINE_LOOP, {
        rate: 0.55 + 1.45 * clamp01(params.normRpm),
        gain: 0.45 + 0.35 * clamp01(params.throttle),
      });

      // Keep the squeal loop alive at gain 0 rather than stop/start it, so a hard slide fades in cleanly.
      ctx.game.audio.loop(SQUEAL_LOOP, "tire_squeal");
      ctx.game.audio.setLoop(SQUEAL_LOOP, {
        gain: clamp01((params.slip - 0.35) / 0.5),
        rate: 0.9 + 0.3 * params.slip,
      });

      if (lastGear !== -1 && params.gear !== lastGear) ctx.game.audio.play("shift_click");
      lastGear = params.gear;

      if ((params.slip > 0.5 || params.wheelspin) && params.speed > 6) {
        const now = ctx.time.now();
        if (lastSmokeAt < 0 || now - lastSmokeAt >= SMOKE_MIN_INTERVAL) {
          lastSmokeAt = now;
          ctx.scene.entity.vfx({ kind: "glow", color: 0xdcdcdc, from: params.position, radius: 1.3, durationMs: 500 });
        }
      }
    },
    stop(ctx) {
      ctx.game.audio.stopLoop(ENGINE_LOOP);
      ctx.game.audio.stopLoop(SQUEAL_LOOP);
      lastGear = -1;
      lastSmokeAt = -1;
    },
  };
}
