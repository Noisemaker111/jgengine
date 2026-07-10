export type Vec2 = readonly [number, number];

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vecScale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s];
}

export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function vecLength(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}

export function vecNormalize(a: Vec2): Vec2 {
  const len = vecLength(a);
  return len === 0 ? [0, 0] : [a[0] / len, a[1] / len];
}

export function vecPerp(a: Vec2): Vec2 {
  return [-a[1], a[0]];
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1]!, points[i]!);
  return total;
}

export function cumulativeLengths(points: readonly Vec2[]): number[] {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1]! + distance(points[i - 1]!, points[i]!));
  return lengths;
}

export function sampleAtDistance(points: readonly Vec2[], lengths: readonly number[], dist: number): Vec2 {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0]!;
  const total = lengths[lengths.length - 1] ?? 0;
  const clamped = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < clamped) i += 1;
  const segStart = lengths[i - 1]!;
  const segEnd = lengths[i]!;
  const span = segEnd - segStart;
  const t = span <= 0 ? 0 : (clamped - segStart) / span;
  return vecLerp(points[i - 1]!, points[i]!, t);
}

export function tangentAt(points: readonly Vec2[], lengths: readonly number[], dist: number): Vec2 {
  if (points.length < 2) return [0, 1];
  const total = lengths[lengths.length - 1] ?? 0;
  const clamped = Math.max(0, Math.min(total, dist));
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < clamped) i += 1;
  const dir = vecSub(points[i]!, points[i - 1]!);
  return vecNormalize(dir);
}

export function headingFromTangent(t: Vec2): number {
  return Math.atan2(t[0], t[1]);
}

export function offsetLateral(from: Vec2, toward: Vec2, lateral: number): Vec2 {
  const dir = vecNormalize(vecSub(toward, from));
  const perp = vecPerp(dir);
  return vecAdd(from, vecScale(perp, lateral));
}
