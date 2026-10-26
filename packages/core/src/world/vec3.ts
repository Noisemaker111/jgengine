import type { Vec3 } from "./geometry";

/** Sum of two 3D vectors.
 * @internal
 */
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Difference `a - b` of two 3D vectors.
 * @internal
 */
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Scale a 3D vector by a scalar.
 * @internal
 */
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Negate a 3D vector.
 * @internal
 */
function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

/** Dot product of two 3D vectors.
 * @internal
 */
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Cross product `a × b` of two 3D vectors.
 * @internal
 */
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Euclidean length of a 3D vector.
 * @internal
 */
function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Squared length of a 3D vector; cheaper than `length` when only comparing magnitudes.
 * @internal
 */
function lengthSquared(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

/** Unit vector in the direction of `a`; returns the zero vector when `a` has no length.
 * @internal
 */
function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len < 1e-9 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

/** Distance between two points.
 * @internal
 */
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Squared distance between two points; cheaper than `distance` for radius comparisons on hot paths.
 * @internal
 */
function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Linearly interpolate between points `a` and `b` by fraction `t`.
 * @internal
 */
function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 3D vector math on `Vec3` tuples: `vec3.add(a, b)`, `vec3.distance(a, b)`, …
 * @internal
 */
export const vec3 = {
  add,
  sub,
  scale,
  negate,
  dot,
  cross,
  length,
  lengthSquared,
  normalize,
  distance,
  distanceSquared,
  lerp,
} as const;
