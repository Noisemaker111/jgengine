import type { EmitterConfig } from "@jgengine/core/vfx/particles";

import type { WorldRuntime } from "../run/store";
import type { Track } from "../tracks/catalog";

export interface HazardBurst {
  config: EmitterConfig;
  count: number;
  blending: "additive" | "normal";
}

/** Seconds between puffs from one vent while its spurt is live. */
const SPURT_BEAT = 0.12;
/** Vents farther than this from the kart stay quiet: nobody sees them and particles cost. */
const SPURT_RANGE = 140;

function cycleLive(cycle: { period: number; active: number; phase?: number } | undefined, time: number): boolean {
  if (cycle === undefined) return true;
  const { period, active, phase = 0 } = cycle;
  return (((time - phase) % period) + period) % period < active;
}

/**
 * Molten slag thrown across the road while a spurt is live: an additive orange fountain from the
 * middle of the span, on a beat, so the player sees the pour coming and sees it stop.
 */
export function slagSpurts(track: Track, time: number, world: Pick<WorldRuntime, "spurts">, near: readonly [number, number, number]): HazardBurst[] {
  const out: HazardBurst[] = [];
  for (const span of track.hazardSpans) {
    if (span.kind !== "slag" || !cycleLive(span.cycle, time)) continue;
    const mid = track.course.pointAt(span.route, (span.from + span.to) / 2);
    if (Math.hypot(mid.x - near[0], mid.z - near[2]) > SPURT_RANGE) continue;
    const last = world.spurts.get(span.id) ?? -Infinity;
    if (time - last < SPURT_BEAT && time >= last) continue;
    world.spurts.set(span.id, time);
    const ax = Math.cos(mid.heading);
    const az = -Math.sin(mid.heading);
    out.push({
      blending: "additive",
      count: 26,
      config: {
        position: [mid.x, mid.elevation + 0.4, mid.z],
        spawnJitter: [Math.abs(ax) * mid.halfWidth + 1.5, 0.2, Math.abs(az) * mid.halfWidth + 1.5],
        direction: [0, 1, 0],
        spread: 0.7,
        speed: { min: 3, max: 9 },
        gravity: [0, -14, 0],
        drag: 0.1,
        lifetime: { min: 0.35, max: 0.9 },
        size: { start: 0.32, end: 0.06 },
        colorStart: 0xffc46b,
        colorEnd: 0xff3a0a,
        alpha: { start: 1, end: 0 },
        seed: `slag:${span.id}:${time.toFixed(2)}`,
      },
    });
  }
  return out;
}
