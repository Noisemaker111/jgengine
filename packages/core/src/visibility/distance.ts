import type { Vec3 } from "./bounds";

export function distanceSquared(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Whether an object at `objectCenter` should be distance-culled from `cameraPos`.
 * Compares squared distances against squared thresholds — no per-object square root.
 * `nearestSurface` subtracts the object radius so a large object is not culled by the
 * distance to its far side. `hysteresis` widens the max band by a fixed world-unit
 * band for objects that were visible last check, so they don't flicker at the boundary.
 */
export function culledByDistance(
  cameraX: number, cameraY: number, cameraZ: number,
  objectX: number, objectY: number, objectZ: number,
  minDistance: number,
  maxDistance: number,
  radius = 0,
  hysteresis = 0,
): boolean {
  const distSq = distanceSquared(cameraX, cameraY, cameraZ, objectX, objectY, objectZ);
  if (minDistance > 0) {
    const nearFar = minDistance + radius;
    if (distSq < nearFar * nearFar) return true;
  }
  if (maxDistance !== Infinity && maxDistance !== Number.POSITIVE_INFINITY) {
    const farNear = maxDistance + radius + hysteresis;
    if (distSq > farNear * farNear) return true;
  }
  return false;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a[0], a[1], a[2], b[0], b[1], b[2]));
}
