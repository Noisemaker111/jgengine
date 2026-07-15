export type Vec2 = readonly [number, number];

export interface Footprint {
  w: number;
  d: number;
}

export interface Aabb {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface MoveOptions {
  bounds?: Aabb;
  radius?: number;
}

/**
 * A circular clearance around a gameplay spot (spawn, plot, path point, POI): scatter is repelled
 * from it and terrain is flattened toward its center. `feather` (meters) is the soft outer band —
 * full effect within `radius - feather`, ramping to zero at `radius`.
 */
export interface AvoidZone {
  x: number;
  z: number;
  radius: number;
  feather?: number;
}

/**
 * How strongly a point falls inside a clearance zone: 1 at/inside the solid core, ramping to 0 at
 * the zone's outer `radius` across its `feather` band, 0 outside. The max over all zones.
 * @internal — the falloff math behind scatter avoid and terrain flatten.
 */
export function zoneInfluence(x: number, z: number, zones: readonly AvoidZone[]): number {
  let best = 0;
  for (const zone of zones) {
    const dist = Math.hypot(x - zone.x, z - zone.z);
    if (dist >= zone.radius) continue;
    const feather = zone.feather ?? 0;
    const inner = zone.radius - Math.max(0, feather);
    const t = dist <= inner || feather <= 0 ? 1 : (zone.radius - dist) / feather;
    if (t > best) best = t;
  }
  return best;
}

export function snapToGrid(point: Vec2, size: number): Vec2 {
  if (!(size > 0)) return point;
  return [Math.round(point[0] / size) * size, Math.round(point[1] / size) * size];
}

export function footprintAabb(center: Vec2, footprint: Footprint, quarterTurns = 0): Aabb {
  const turned = ((quarterTurns % 2) + 2) % 2 === 1;
  const halfW = (turned ? footprint.d : footprint.w) / 2;
  const halfD = (turned ? footprint.w : footprint.d) / 2;
  return {
    minX: center[0] - halfW,
    maxX: center[0] + halfW,
    minZ: center[1] - halfD,
    maxZ: center[1] + halfD,
  };
}

export function expandAabb(aabb: Aabb, margin: number): Aabb {
  return {
    minX: aabb.minX - margin,
    maxX: aabb.maxX + margin,
    minZ: aabb.minZ - margin,
    maxZ: aabb.maxZ + margin,
  };
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function aabbContains(outer: Aabb, inner: Aabb): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minZ >= outer.minZ &&
    inner.maxZ <= outer.maxZ
  );
}

export function pointInAabb(point: Vec2, aabb: Aabb): boolean {
  return point[0] >= aabb.minX && point[0] <= aabb.maxX && point[1] >= aabb.minZ && point[1] <= aabb.maxZ;
}

export function clampToAabb(point: Vec2, aabb: Aabb): Vec2 {
  return [
    Math.min(Math.max(point[0], aabb.minX), aabb.maxX),
    Math.min(Math.max(point[1], aabb.minZ), aabb.maxZ),
  ];
}

function resolveAxis(main: number, cross: number, delta: number, blockers: readonly Aabb[], axisX: boolean): number {
  let next = main + delta;
  if (delta === 0) return next;
  for (const blocker of blockers) {
    const minMain = axisX ? blocker.minX : blocker.minZ;
    const maxMain = axisX ? blocker.maxX : blocker.maxZ;
    const minCross = axisX ? blocker.minZ : blocker.minX;
    const maxCross = axisX ? blocker.maxZ : blocker.maxX;
    if (cross <= minCross || cross >= maxCross) continue;
    if (delta > 0) {
      if (main <= minMain && next > minMain) next = minMain;
    } else {
      if (main >= maxMain && next < maxMain) next = maxMain;
    }
  }
  return next;
}

export function resolveMove(from: Vec2, delta: Vec2, blockers: readonly Aabb[], options: MoveOptions = {}): Vec2 {
  const radius = options.radius ?? 0;
  const expanded = radius === 0 ? blockers : blockers.map((blocker) => expandAabb(blocker, radius));
  let x = resolveAxis(from[0], from[1], delta[0], expanded, true);
  if (options.bounds) x = Math.min(Math.max(x, options.bounds.minX + radius), options.bounds.maxX - radius);
  let z = resolveAxis(from[1], x, delta[1], expanded, false);
  if (options.bounds) z = Math.min(Math.max(z, options.bounds.minZ + radius), options.bounds.maxZ - radius);
  return [x, z];
}

/** An axis-aligned ellipse: `center` with semi-axes `radiusX` and `radiusY`. */
export interface Ellipse {
  center: Vec2;
  radiusX: number;
  radiusY: number;
}

function normalizedRadius2(point: Vec2, ellipse: Ellipse): number {
  const nx = ellipse.radiusX > 0 ? (point[0] - ellipse.center[0]) / ellipse.radiusX : 0;
  const ny = ellipse.radiusY > 0 ? (point[1] - ellipse.center[1]) / ellipse.radiusY : 0;
  return nx * nx + ny * ny;
}

/** True when `point` sits inside (or on) the ellipse — the oval-arena containment test. */
export function pointInEllipse(point: Vec2, ellipse: Ellipse): boolean {
  return normalizedRadius2(point, ellipse) <= 1;
}

/** Clamp `point` to the ellipse boundary when it strays outside, else return it unchanged. */
export function clampToEllipse(point: Vec2, ellipse: Ellipse): Vec2 {
  const r2 = normalizedRadius2(point, ellipse);
  if (r2 <= 1) return point;
  const scale = 1 / Math.sqrt(r2);
  return [
    ellipse.center[0] + (point[0] - ellipse.center[0]) * scale,
    ellipse.center[1] + (point[1] - ellipse.center[1]) * scale,
  ];
}

/** Outward unit normal of the ellipse at the point nearest `point` — the boundary bounce direction. */
export function ellipseNormal(point: Vec2, ellipse: Ellipse): Vec2 {
  const nx = ellipse.radiusX > 0 ? (point[0] - ellipse.center[0]) / (ellipse.radiusX * ellipse.radiusX) : 0;
  const ny = ellipse.radiusY > 0 ? (point[1] - ellipse.center[1]) / (ellipse.radiusY * ellipse.radiusY) : 0;
  const len = Math.hypot(nx, ny);
  if (len < 1e-6) return [1, 0];
  return [nx / len, ny / len];
}
