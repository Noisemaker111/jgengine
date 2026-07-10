export type Vec2 = readonly [number, number];

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vecScale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s];
}

export function vecLength(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}

export function vecNormalize(a: Vec2): Vec2 {
  const len = vecLength(a);
  return len < 1e-9 ? [0, 0] : [a[0] / len, a[1] / len];
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function headingToVec(headingRad: number): Vec2 {
  return [Math.sin(headingRad), Math.cos(headingRad)];
}

export function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

export function normalizeAngleDeg(angleDeg: number): number {
  let a = angleDeg % 360;
  if (a < 0) a += 360;
  return a;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
