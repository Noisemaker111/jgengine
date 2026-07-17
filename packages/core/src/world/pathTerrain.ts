/**
 * Path-driven terrain modifiers: one authored centerline reshapes a heightfield across a corridor —
 * flatten a roadbed, grade a constant-slope ramp, carve a river/trench, and hold retaining walls where
 * the corridor cuts or fills into the surrounding ground. Genre-agnostic: roads, rails, rivers,
 * trenches, runways, and accessibility ramps are all the same profile with different numbers, so no game
 * hand-rolls its own flatten-mask generator. Pure XZ math over a polyline — deterministic, bounded
 * (O(points) per sample), and serializable; it composes onto any height sampler and pairs with
 * `resolveTerrainField` so the same authored path drives both the rendered mesh and player collision.
 * @capability path-terrain flatten / grade / carve a heightfield from an authored path with retaining profiles
 * @consumer packages/core/src/world/terrain.ts (resolveTerrainField), Games/the-robots roads
 */
import type { Vec2 } from "./geometry";

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const clamped = clamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Where a path corridor drives its centerline height:
 * - `sample` — follow the base terrain under the centerline, so the corridor drapes level across its
 *   width while still tracking the hills the path crosses (the natural policy for a road or trail).
 * - `fixed` — hold one constant height for the whole corridor (a level causeway, runway, or dam crest).
 * - `grade` — interpolate linearly from `start` to `end` height along the path's arc length, a
 *   constant-slope ramp between two anchors (a switchback, a graded rail bed, an accessibility ramp).
 */
export type PathHeightPolicy =
  | { readonly kind: "sample" }
  | { readonly kind: "fixed"; readonly height: number }
  | { readonly kind: "grade"; readonly start: number; readonly end: number };

/**
 * Retaining behavior for a path corridor's shoulders. A wall rises only where the corridor already cuts or
 * fills into the surrounding ground by at least `threshold` — gentle stretches stay open — so a road
 * through a canyon gets held banks while the same profile on flat ground does not. The wall fades in
 * smoothly across `taper` above the threshold so it never steps on or off between adjacent samples.
 */
export interface PathRetaining {
  /** Crest height raised above the corridor edge on both shoulders (canyon walls, road berms, levee banks). */
  readonly wallHeight: number;
  /** Minimum cut/fill (world units) between corridor and surrounding ground before a wall rises. Default 0 (wall the whole path). */
  readonly threshold?: number;
  /** Cut/fill band above `threshold` over which the wall fades from none to full height. Default equal to `threshold`. */
  readonly taper?: number;
}

/**
 * A serializable path-driven terrain modifier. The `points` centerline reshapes the heightfield across a
 * corridor of `width`, feathering back to the surrounding ground across `shoulder`. `height` sets the
 * centerline target (sample / fixed / grade); `depth` carves a channel below it (deepest at the
 * centerline, easing to zero at the core edge — rivers and trenches); `retaining` raises walls where the
 * cut/fill exceeds a threshold; `maxCut`/`maxFill` cap how far the ground may move from its base height.
 * All fields are plain data (numbers, string enums, point arrays) so a profile round-trips through the
 * scene document and evaluates identically at author time and runtime.
 */
export interface TerrainPathProfile {
  /** Centerline vertices in world XZ; needs at least two points. Repeat the first point as the last for a closed loop. */
  readonly points: readonly Vec2[];
  /** Full corridor width; the reshaped core extends `width / 2` either side of the centerline. */
  readonly width: number;
  /** Blend-ring width outside the core where the corridor height smoothsteps back to the surrounding ground. Default `width * 0.5`. */
  readonly shoulder?: number;
  /** Centerline target-height policy. Default `{ kind: "sample" }` (drape level across the base terrain). */
  readonly height?: PathHeightPolicy;
  /** Carve depth below the target height, deepest at the centerline and easing to zero at the core edge (0 = flat corridor). Default 0. */
  readonly depth?: number;
  /** Never cut the ground more than this far below its base height. Omit for unlimited cut. */
  readonly maxCut?: number;
  /** Never fill the ground more than this far above its base height. Omit for unlimited fill. */
  readonly maxFill?: number;
  /** Raise retaining walls along the shoulders where the corridor cuts/fills into the surrounding ground. */
  readonly retaining?: PathRetaining;
}

/** A centerline prepared for corridor sampling: points plus cumulative arc-length. */
interface Corridor {
  readonly points: readonly Vec2[];
  readonly cumulative: readonly number[];
  readonly total: number;
}

/** Nearest point on a corridor: unsigned lateral distance, arc-length position, and the projected point. */
interface CorridorHit {
  readonly lateral: number;
  readonly along: number;
  readonly point: Vec2;
}

interface ResolvedProfile {
  readonly corridor: Corridor;
  readonly half: number;
  readonly shoulder: number;
  readonly reach: number;
  readonly height: PathHeightPolicy;
  readonly depth: number;
  readonly maxCut?: number;
  readonly maxFill?: number;
  readonly wallHeight: number;
  readonly threshold: number;
  readonly taper: number;
}

function buildCorridor(points: readonly Vec2[]): Corridor {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
}

/**
 * Closest point on the corridor to `(x, z)`: unsigned lateral distance and arc-length position. Self-
 * contained (each segment projects independently and the minimum lateral wins) so a vertex always reports
 * a near-zero lateral, regardless of which side of the line the neighbours fall.
 */
function nearestOnCorridor(corridor: Corridor, x: number, z: number): CorridorHit {
  let bestLateral = Number.POSITIVE_INFINITY;
  let bestAlong = 0;
  let bestPoint: Vec2 = corridor.points[0] ?? [x, z];
  for (let i = 1; i < corridor.points.length; i += 1) {
    const a = corridor.points[i - 1]!;
    const b = corridor.points[i]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const segLenSq = abx * abx + abz * abz;
    const t = segLenSq <= 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / segLenSq));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const lateral = Math.hypot(x - px, z - pz);
    if (lateral < bestLateral) {
      bestLateral = lateral;
      bestAlong = corridor.cumulative[i - 1]! + t * Math.sqrt(segLenSq);
      bestPoint = [px, pz];
    }
  }
  return { lateral: bestLateral, along: bestAlong, point: bestPoint };
}

function resolveProfile(profile: TerrainPathProfile): ResolvedProfile | null {
  if (profile.points.length < 2 || profile.width <= 0) return null;
  const corridor = buildCorridor(profile.points.map((point) => [point[0], point[1]] as Vec2));
  if (corridor.total <= 0) return null;
  const shoulder = Math.max(0, profile.shoulder ?? profile.width * 0.5);
  return {
    corridor,
    half: profile.width / 2,
    shoulder,
    reach: profile.width / 2 + shoulder,
    height: profile.height ?? { kind: "sample" },
    depth: Math.max(0, profile.depth ?? 0),
    ...(profile.maxCut === undefined ? {} : { maxCut: Math.max(0, profile.maxCut) }),
    ...(profile.maxFill === undefined ? {} : { maxFill: Math.max(0, profile.maxFill) }),
    wallHeight: Math.max(0, profile.retaining?.wallHeight ?? 0),
    threshold: Math.max(0, profile.retaining?.threshold ?? 0),
    taper: Math.max(0, profile.retaining?.taper ?? profile.retaining?.threshold ?? 0),
  };
}

/** Wall strength 0..1: full above `threshold + taper`, none below `threshold`, smooth between. */
function wallStrength(profile: ResolvedProfile, cutFill: number): number {
  if (profile.wallHeight <= 0) return 0;
  if (cutFill < profile.threshold) return 0;
  if (profile.taper <= 0) return 1;
  return smoothstep01((cutFill - profile.threshold) / profile.taper);
}

function clampCutFill(height: number, base: number, maxCut?: number, maxFill?: number): number {
  let out = height;
  if (maxFill !== undefined && out > base + maxFill) out = base + maxFill;
  if (maxCut !== undefined && out < base - maxCut) out = base - maxCut;
  return out;
}

function centerlineTarget(
  profile: ResolvedProfile,
  along: number,
  point: Vec2,
  base: (x: number, z: number) => number,
): number {
  const policy = profile.height;
  if (policy.kind === "fixed") return policy.height;
  if (policy.kind === "grade") {
    const fraction = profile.corridor.total <= 0 ? 0 : clamp01(along / profile.corridor.total);
    return policy.start + (policy.end - policy.start) * fraction;
  }
  return base(point[0], point[1]);
}

function applyProfileAt(
  profile: ResolvedProfile,
  x: number,
  z: number,
  surrounding: number,
  base: (x: number, z: number) => number,
): number {
  const hit = nearestOnCorridor(profile.corridor, x, z);
  const lateral = hit.lateral;
  if (lateral > profile.reach) return surrounding;
  const target = clampCutFill(
    centerlineTarget(profile, hit.along, hit.point, base),
    surrounding,
    profile.maxCut,
    profile.maxFill,
  );
  // Inside the core: carve a channel below the target, deepest at the centerline, level at the edge.
  if (lateral <= profile.half) {
    const edgeT = profile.half <= 0 ? 0 : lateral / profile.half;
    const carved = target - profile.depth * (1 - edgeT * edgeT);
    return clampCutFill(carved, surrounding, profile.maxCut, profile.maxFill);
  }
  // Shoulder: feather the corridor edge (target) back to the surrounding ground, or hold a retaining wall.
  const shoulderT = clamp01((lateral - profile.half) / profile.shoulder);
  const feathered = lerp(target, surrounding, smoothstep01(shoulderT));
  const strength = wallStrength(profile, Math.abs(target - surrounding));
  if (strength <= 0) return feathered;
  const crest = target + profile.wallHeight;
  const walled = shoulderT <= 0.5 ? lerp(target, crest, smoothstep01(shoulderT / 0.5)) : lerp(crest, surrounding, smoothstep01((shoulderT - 0.5) / 0.5));
  return lerp(feathered, walled, strength);
}

/**
 * Wraps a height sampler so each authored `TerrainPathProfile` reshapes it. Profiles apply in list order
 * (later profiles compose over earlier ones, so an intersection's last profile wins its core); each reads
 * the running height as its surrounding ground and the original `base` for `sample` centerline heights.
 * The returned sampler is pure and deterministic. Degenerate profiles (fewer than two points, non-positive
 * width or length) are skipped; with no usable profile the original `base` is returned unchanged.
 * @capability path-terrain compose flatten/grade/carve/retaining path profiles onto a height sampler
 */
export function withPathProfiles(
  base: (x: number, z: number) => number,
  profiles: readonly TerrainPathProfile[],
): (x: number, z: number) => number {
  const resolved: ResolvedProfile[] = [];
  for (const profile of profiles) {
    const prepared = resolveProfile(profile);
    if (prepared !== null) resolved.push(prepared);
  }
  if (resolved.length === 0) return base;
  return (x, z) => {
    let height = base(x, z);
    for (const profile of resolved) {
      height = applyProfileAt(profile, x, z, height, base);
    }
    return height;
  };
}
