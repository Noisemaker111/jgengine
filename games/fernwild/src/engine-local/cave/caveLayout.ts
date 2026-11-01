// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
import type { WorldSolid } from "@jgengine/core/world/worldSolids";

/** Ground height under a point, so the cave's floor, walls and roof follow the terrain. */
export type CaveGround = (x: number, z: number) => number;

/** A cave dug into the ground along a centreline: a tunnel from the mouth that opens into a chamber at its far end. */
export interface CaveConfig {
  /** Centreline in XZ, mouth first; the last point is the chamber's centre. At least two points. */
  path: readonly (readonly [number, number])[];
  /** Tunnel width wall to wall, metres. Default 7. */
  width?: number;
  /** Tunnel height floor to roof, metres. Default 6. */
  height?: number;
  /** Chamber radius at the far end, metres. Default 12. */
  chamber?: number;
  /** Rock over the roof and beside the walls, metres: how thick the hill the cave sits in is, and its collision. Default 6. */
  cover?: number;
  /** Seed for the rock's lumps. Default 1. */
  seed?: number;
}

/** Everything a game needs to place, draw and fill a cave. */
export interface CaveLayout {
  /** Centreline resampled about every half width, mouth first, ending at the chamber's centre. */
  path: readonly (readonly [number, number])[];
  width: number;
  height: number;
  cover: number;
  seed: number;
  chamber: { center: readonly [number, number]; radius: number };
  /** Collision: the rock (`cover` thick) along both sides of the tunnel and round the chamber, open where the tunnel joins it. */
  solids: WorldSolid[];
  /** Spots for creatures or loot: down the tunnel, then around the chamber. The last is the chamber's centre. */
  spots: readonly (readonly [number, number])[];
  /** Whether a point is under the cave's roof. */
  inside(x: number, z: number): boolean;
  /** How far in a point is, metres along the tunnel from the mouth (the chamber counts as the end); null outside. */
  depth(x: number, z: number): number | null;
}

const DEFAULTS = { width: 7, height: 6, chamber: 12, cover: 6, seed: 1 };
/** Sides of the chamber's wall ring. */
const CHAMBER_SIDES = 28;

type Point = readonly [number, number];

function resample(path: readonly Point[], step: number): Point[] {
  const out: Point[] = [path[0]!];
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const pieces = Math.max(1, Math.ceil(length / step));
    for (let k = 1; k <= pieces; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / pieces, a[1] + ((b[1] - a[1]) * k) / pieces]);
  }
  return out;
}

/** Distance from `p` to segment `a`-`b`, and how far along it (0..1) the nearest point lies. */
function toSegment(p: Point, a: Point, b: Point): { distance: number; t: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return { distance: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t)), t };
}

/** A slab of wall from `a` to `b` in XZ, standing on the ground at its middle. */
function slab(a: Point, b: Point, thickness: number, height: number, ground: CaveGround): WorldSolid {
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const base = Math.min(ground(a[0], a[1]), ground(b[0], b[1]), ground(mid[0], mid[1]));
  return {
    center: [mid[0], base + height / 2 - 1, mid[1]],
    halfExtents: [length / 2, height / 2 + 1, thickness / 2],
    // Local x runs along the slab: rotationY maps local +x to (cos, -sin) in XZ.
    rotationY: -Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

/**
 * Lay out a cave along an authored centreline: wall collision down both sides of the tunnel, a round chamber
 * at the end walled all round except where the tunnel comes in, spots to put creatures and loot, and tests for
 * whether a point is inside. Pair with `caveMesh` to draw it.
 * @capability cave-layout a walkable cave (tunnel and chamber) from a centreline: collision, spawn spots, inside test
 */
export function caveLayout(config: CaveConfig, ground: CaveGround): CaveLayout {
  if (config.path.length < 2) throw new Error("caveLayout: a cave path needs a mouth and an end");
  const width = config.width ?? DEFAULTS.width;
  const height = config.height ?? DEFAULTS.height;
  const radius = config.chamber ?? DEFAULTS.chamber;
  const cover = config.cover ?? DEFAULTS.cover;
  const thickness = cover;
  const seed = config.seed ?? DEFAULTS.seed;
  const path = resample(config.path, width / 2);
  const center = path[path.length - 1]!;
  const half = width / 2;
  const wallHeight = height + cover;

  // How far along the tunnel each resampled point is.
  const along: number[] = [0];
  for (let i = 1; i < path.length; i += 1) along.push(along[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  const total = along[along.length - 1]!;

  const solids: WorldSolid[] = [];
  const side = (i: number, sign: number): Point => {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(path.length - 1, i + 1)]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Right of the heading (dx, dz) is (dz, -dx).
    const off = half + thickness / 2;
    return [path[i]![0] + ((b[1] - a[1]) / length) * off * sign, path[i]![1] - ((b[0] - a[0]) / length) * off * sign];
  };
  for (let i = 1; i < path.length; i += 1) {
    for (const sign of [1, -1]) {
      const a = side(i - 1, sign);
      const b = side(i, sign);
      // Inside the chamber the tunnel has opened out: no walls there.
      if (Math.hypot((a[0] + b[0]) / 2 - center[0], (a[1] + b[1]) / 2 - center[1]) < radius + thickness) continue;
      // Overlap the slabs a little so a corner never leaves a gap to squeeze through.
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.hypot(dx, dz) || 1;
      const grow = thickness / 2;
      solids.push(slab([a[0] - (dx / length) * grow, a[1] - (dz / length) * grow], [b[0] + (dx / length) * grow, b[1] + (dz / length) * grow], thickness, wallHeight, ground));
    }
  }

  // The tunnel meets the chamber from where the path enters its circle.
  let entry = path[0]!;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (Math.hypot(path[i]![0] - center[0], path[i]![1] - center[1]) > radius) {
      entry = path[i]!;
      break;
    }
  }
  const entryAngle = Math.atan2(entry[1] - center[1], entry[0] - center[0]);
  const ring = radius + thickness / 2;
  const gap = Math.asin(Math.min(1, half / ring));
  for (let k = 0; k < CHAMBER_SIDES; k += 1) {
    const a0 = (k / CHAMBER_SIDES) * Math.PI * 2;
    const a1 = ((k + 1) / CHAMBER_SIDES) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const off = Math.abs(Math.atan2(Math.sin(mid - entryAngle), Math.cos(mid - entryAngle)));
    if (off < gap + Math.PI / CHAMBER_SIDES) continue;
    const grow = 1.08;
    const cx = (a: number) => center[0] + Math.cos(a) * ring;
    const cz = (a: number) => center[1] + Math.sin(a) * ring;
    const spread = (a1 - a0) * (grow - 1) * 0.5;
    solids.push(slab([cx(a0 - spread), cz(a0 - spread)], [cx(a1 + spread), cz(a1 + spread)], thickness, wallHeight * 1.4, ground));
  }

  const spots: Point[] = [];
  for (const share of [0.3, 0.6]) {
    const target = share * Math.max(0, total - radius);
    const i = along.findIndex((value) => value >= target);
    spots.push(path[Math.max(0, i)]!);
  }
  for (let k = 0; k < 4; k += 1) {
    const angle = entryAngle + Math.PI * (0.5 + k * 0.33);
    spots.push([center[0] + Math.cos(angle) * radius * 0.55, center[1] + Math.sin(angle) * radius * 0.55]);
  }
  spots.push(center);

  const depth = (x: number, z: number): number | null => {
    if (Math.hypot(x - center[0], z - center[1]) <= radius) return total;
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let i = 1; i < path.length; i += 1) {
      const hit = toSegment([x, z], path[i - 1]!, path[i]!);
      // In front of the mouth is outside, however close to the centreline.
      if (i === 1 && hit.t <= 0 && hit.distance > 1e-9) continue;
      if (hit.distance <= half && hit.distance < bestDistance) {
        bestDistance = hit.distance;
        best = along[i - 1]! + (along[i]! - along[i - 1]!) * hit.t;
      }
    }
    return best;
  };

  return {
    path,
    width,
    height,
    cover,
    seed,
    chamber: { center, radius },
    solids,
    spots,
    inside: (x, z) => depth(x, z) !== null,
    depth,
  };
}
