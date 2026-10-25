import { TRACKS, type Track } from "./catalog";

/** Metres outside a track's bounds over which its own ground level fades back to the yard's. */
const LEVEL_FADE = 60;

function boundsDistance(track: Track, x: number, z: number): number {
  const b = track.course.bounds;
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * The yard's ground with every track laid into it: inside a track's bounds the land sits at that
 * track's own level (a slag lake bed, the smelter floor), fading back to `base` outside; every route
 * then rides its own elevation, banking down into that land. Row Six keeps the yard's own ground.
 * This is the terrain's `heightField` and the headless run's ground, so both agree where a kart is.
 */
export function yardGround(base: (x: number, z: number) => number, tracks: readonly Track[] = TRACKS): (x: number, z: number) => number {
  let ground = base;
  for (const track of tracks) {
    if (track.def.dressing === undefined) continue;
    const below = ground;
    const level = track.def.baseLevel;
    const leveled = level === 0
      ? below
      : (x: number, z: number): number => {
          const d = boundsDistance(track, x, z);
          if (d >= LEVEL_FADE) return below(x, z);
          const t = d / LEVEL_FADE;
          const w = 1 - t * t * (3 - 2 * t);
          return below(x, z) * (1 - w) + level * w;
        };
    const shaped = track.course.groundHeight(leveled, { shoulder: 3, falloff: 14 });
    ground = (x, z) => (boundsDistance(track, x, z) > 40 ? leveled(x, z) : shaped(x, z));
  }
  return ground;
}

/** The headless yard: flat ground with the tracks laid in. */
export const FLAT_YARD_GROUND = yardGround(() => 0);

/**
 * The yard's rolling ground under everything: a few metres of swell, the same broad low rises the
 * corridor always had, from a cheap sum of crossed waves so the terrain and every headless run agree.
 */
export function yardSwell(x: number, z: number): number {
  const a = Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.011 - 0.4);
  const b = Math.sin((x + z) * 0.027 + 2.1) * 0.5;
  const c = Math.cos((x - z * 0.6) * 0.051 + 0.7) * 0.25;
  return 1.2 * (a + b + c) / 1.75;
}

/** The ground the game renders and drives on: the swell with every track laid into it. */
export const YARD_GROUND = yardGround(yardSwell);
