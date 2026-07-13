import type { Vec2 } from "./geometry";

/** Sum of two 2D vectors. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

/** Difference `a - b` of two 2D vectors. */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

/** Scale a 2D vector by a scalar. */
export function scale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s];
}

/** Negate a 2D vector. */
export function negate(a: Vec2): Vec2 {
  return [-a[0], -a[1]];
}

/** Dot product of two 2D vectors. */
export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

/** 2D cross product (scalar z of the 3D cross), positive when `b` is counter-clockwise from `a`. */
export function cross(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

/** Euclidean length of a 2D vector. */
export function length(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}

/** Squared length of a 2D vector; cheaper than `length` when only comparing magnitudes. */
export function lengthSquared(a: Vec2): number {
  return a[0] * a[0] + a[1] * a[1];
}

/** Unit vector in the direction of `a`; returns the zero vector when `a` has no length. */
export function normalize(a: Vec2): Vec2 {
  const len = Math.hypot(a[0], a[1]);
  return len < 1e-9 ? [0, 0] : [a[0] / len, a[1] / len];
}

/** Distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Squared distance between two points; cheaper than `distance` for radius comparisons. */
export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Linearly interpolate between points `a` and `b` by fraction `t`. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Left-hand perpendicular of `a` (rotated 90° counter-clockwise). */
export function perp(a: Vec2): Vec2 {
  return [-a[1], a[0]];
}

/** Rotate a 2D vector by `radians` about the origin. */
export function rotate(a: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
}

/**
 * Reflect a velocity off a surface with unit `normal`, losing energy by `restitution` (0..1). At
 * `restitution` 1 the normal component mirrors elastically (`v − 2(v·n)n`); at 0 it is removed so the
 * vector slides along the surface. Only the normal component is scaled — tangential motion is kept — so
 * this is the wall/paddle/boundary bounce every arcade ball game hand-rolls.
 */
export function reflect(v: Vec2, normal: Vec2, restitution = 1): Vec2 {
  const vn = v[0] * normal[0] + v[1] * normal[1];
  const j = (1 + restitution) * vn;
  return [v[0] - j * normal[0], v[1] - j * normal[1]];
}

/** Unit vector for a heading measured clockwise from +Y (the engine's XZ-plane convention). */
export function fromHeading(headingRad: number): Vec2 {
  return [Math.sin(headingRad), Math.cos(headingRad)];
}

/** Heading in radians of a vector, measured clockwise from +Y to match `fromHeading`. */
export function heading(a: Vec2): number {
  return Math.atan2(a[0], a[1]);
}

/** Wrap an angle in radians into `[0, 2π)`. */
export function normalizeAngle(angleRad: number): number {
  const twoPi = Math.PI * 2;
  const a = angleRad % twoPi;
  return a < 0 ? a + twoPi : a;
}

/** Wrap an angle in degrees into `[0, 360)`. */
export function normalizeAngleDeg(angleDeg: number): number {
  const a = angleDeg % 360;
  return a < 0 ? a + 360 : a;
}
