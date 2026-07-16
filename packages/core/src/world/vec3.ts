/** A 3D vector/point as an `[x, y, z]` tuple — the 3D companion to `Vec2` from `./vec2`. */
export type Vec3 = readonly [number, number, number];

/** Sum of two 3D vectors.
 * @internal
 */
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Difference `a - b` of two 3D vectors.
 * @internal
 */
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Scale a 3D vector by a scalar.
 * @internal
 */
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Negate a 3D vector.
 * @internal
 */
export function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

/** Dot product of two 3D vectors.
 * @internal
 */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Cross product `a × b`, a vector perpendicular to both operands.
 * @internal
 */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Euclidean length of a 3D vector.
 * @internal
 */
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Squared length of a 3D vector; cheaper than `length` when only comparing magnitudes.
 * @internal
 */
export function lengthSquared(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

/** Unit vector in the direction of `a`; returns the zero vector when `a` has no length.
 * @internal
 */
export function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len < 1e-9 ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

/** Distance between two points.
 * @internal
 */
export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Squared distance between two points; cheaper than `distance` for radius comparisons.
 * @internal
 */
export function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Linearly interpolate between points `a` and `b` by fraction `t`.
 * @internal
 */
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
