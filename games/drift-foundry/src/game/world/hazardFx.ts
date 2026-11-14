import type { EmitterConfig } from "@jgengine/core/vfx/particles";

import { TRACK_OBJECT } from "../objects/catalog";
import type { WorldRuntime } from "../run/store";
import type { Track } from "../tracks/catalog";

export interface HazardBurst {
  config: EmitterConfig;
  count: number;
  blending: "additive" | "normal";
}

/** Seconds between bursts from one span while its tumble is live. */
const TUMBLE_BEAT = 0.12;
/** Spans farther than this from the cart stay quiet: nobody sees them and particles cost. */
const TUMBLE_RANGE = 140;

function cycleLive(cycle: { period: number; active: number; phase?: number } | undefined, time: number): boolean {
  if (cycle === undefined) return true;
  const { period, active, phase = 0 } = cycle;
  return (((time - phase) % period) + period) % period < active;
}

/**
 * A tumble crossing the aisle while it is live: oranges bouncing off the produce pyramids, or foam
 * balls raining out of the toy-aisle blasters - fat, bouncy, opaque particles thrown across the span
 * on a beat, so the player sees the avalanche coming and sees it stop.
 */
export function tumbleBursts(track: Track, time: number, world: Pick<WorldRuntime, "spurts">, near: readonly [number, number, number]): HazardBurst[] {
  const out: HazardBurst[] = [];
  const balls = track.def.dressing?.tumble === TRACK_OBJECT.ballBlaster;
  for (const span of track.hazardSpans) {
    if (span.kind !== "tumble" || !cycleLive(span.cycle, time)) continue;
    const mid = track.course.pointAt(span.route, (span.from + span.to) / 2);
    if (Math.hypot(mid.x - near[0], mid.z - near[2]) > TUMBLE_RANGE) continue;
    const last = world.spurts.get(span.id) ?? -Infinity;
    if (time - last < TUMBLE_BEAT && time >= last) continue;
    world.spurts.set(span.id, time);
    const ax = Math.cos(mid.heading);
    const az = -Math.sin(mid.heading);
    out.push({
      blending: "normal",
      count: 14,
      config: {
        position: [mid.x, mid.elevation + 0.6, mid.z],
        spawnJitter: [Math.abs(ax) * mid.halfWidth + 1.5, 0.3, Math.abs(az) * mid.halfWidth + 1.5],
        direction: [ax, 0.9, az],
        spread: 0.9,
        speed: { min: 2.5, max: 6 },
        gravity: [0, -16, 0],
        drag: 0.05,
        lifetime: { min: 0.5, max: 1.0 },
        size: { start: balls ? 0.42 : 0.36, end: balls ? 0.38 : 0.32 },
        colorStart: balls ? 0xff4fa0 : 0xffa21e,
        colorEnd: balls ? 0x5de0ce : 0xff7a00,
        alpha: { start: 1, end: 0.9 },
        seed: `tumble:${span.id}:${time.toFixed(2)}`,
      },
    });
  }
  return out;
}
