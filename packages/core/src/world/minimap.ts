export type WorldXZ = readonly [number, number];

const TWO_PI = Math.PI * 2;

function normalizeAngle(angle: number): number {
  let value = angle % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

/**
 * Compass bearing (radians, 0 = map north = −Z, increasing clockwise toward +X
 * = east) from one world XZ point to another. Feeds both the minimap direction
 * and the compass strip.
 */
export function compassBearing(from: WorldXZ, to: WorldXZ): number {
  return normalizeAngle(Math.atan2(to[0] - from[0], -(to[1] - from[1])));
}

/** Bearing of an entity facing direction given its `rotationY` (yaw) in radians. */
export function headingToBearing(yaw: number): number {
  return normalizeAngle(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
}

export type Cardinal = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const CARDINALS: readonly Cardinal[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function bearingToCardinal(bearing: number): Cardinal {
  const index = Math.round(normalizeAngle(bearing) / (Math.PI / 4)) % 8;
  return CARDINALS[index]!;
}

/** Signed offset of `bearing` from `reference`, wrapped into (−π, π]. */
export function relativeBearing(bearing: number, reference: number): number {
  let delta = normalizeAngle(bearing) - normalizeAngle(reference);
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return delta;
}

export interface MinimapView {
  /** World XZ at the minimap center (usually the player position). */
  center: WorldXZ;
  /** World-unit distance from center to the minimap edge. */
  worldRadius: number;
  /** Pixel diameter of the minimap. */
  size: number;
  /**
   * Compass bearing that points up (rotating minimap) — pass
   * `headingToBearing(yaw)` so the map spins under a fixed north-up player
   * arrow. Omit for north-up.
   */
  rotate?: number;
}

export interface MinimapPoint {
  x: number;
  y: number;
  /** Radial distance in world units. */
  distance: number;
  /** True when within `worldRadius` of center. */
  inside: boolean;
}

/**
 * Project a world XZ (or XYZ) point into minimap pixel space. Origin is the
 * top-left of the `size×size` box; north (−Z) maps to −Y (up). Pass
 * `view.rotate` to spin the map under a fixed north-up player arrow.
 */
export function projectToMinimap(
  world: WorldXZ | readonly [number, number, number],
  view: MinimapView,
): MinimapPoint {
  const worldX = world[0];
  const worldZ = world.length === 3 ? world[2] : (world as WorldXZ)[1];
  let dx = worldX - view.center[0];
  let dz = worldZ - view.center[1];
  if (view.rotate !== undefined && view.rotate !== 0) {
    const cos = Math.cos(view.rotate);
    const sin = Math.sin(view.rotate);
    const rx = dx * cos + dz * sin;
    const rz = dz * cos - dx * sin;
    dx = rx;
    dz = rz;
  }
  const distance = Math.hypot(dx, dz);
  const half = view.size / 2;
  const scale = view.worldRadius === 0 ? 0 : half / view.worldRadius;
  return {
    x: half + dx * scale,
    y: half + dz * scale,
    distance,
    inside: distance <= view.worldRadius,
  };
}

/** Clamp a projected point to the minimap edge, preserving direction (edge markers). */
export function clampToMinimapEdge(point: MinimapPoint, size: number): { x: number; y: number } {
  const half = size / 2;
  const dx = point.x - half;
  const dy = point.y - half;
  const length = Math.hypot(dx, dy);
  if (length <= half || length === 0) return { x: point.x, y: point.y };
  const scale = half / length;
  return { x: half + dx * scale, y: half + dy * scale };
}
