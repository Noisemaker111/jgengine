export type Vec3 = readonly [number, number, number];

export function distanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function polylineCumulative(points: readonly Vec3[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distanceXZ(points[i - 1], points[i]));
  }
  return cumulative;
}

export function polylineLength(points: readonly Vec3[]): number {
  const cumulative = polylineCumulative(points);
  return cumulative[cumulative.length - 1] ?? 0;
}

export function pointAtDistance(points: readonly Vec3[], distance: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  if (points.length === 1) return points[0];
  const cumulative = polylineCumulative(points);
  const total = cumulative[cumulative.length - 1];
  const clamped = Math.min(Math.max(distance, 0), total);
  for (let i = 1; i < cumulative.length; i += 1) {
    if (clamped <= cumulative[i]) {
      const span = cumulative[i] - cumulative[i - 1];
      const t = span === 0 ? 0 : (clamped - cumulative[i - 1]) / span;
      return lerp3(points[i - 1], points[i], t);
    }
  }
  return points[points.length - 1];
}

export function pointAtFraction(points: readonly Vec3[], fraction: number): Vec3 {
  const total = polylineLength(points);
  return pointAtDistance(points, total * Math.min(Math.max(fraction, 0), 1));
}

export interface ClosestPointResult {
  readonly point: Vec3;
  readonly t: number;
  readonly distance: number;
}

export function closestPointOnSegmentXZ(p: Vec3, a: Vec3, b: Vec3): ClosestPointResult {
  const abx = b[0] - a[0];
  const abz = b[2] - a[2];
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq === 0 ? 0 : Math.min(Math.max(((p[0] - a[0]) * abx + (p[2] - a[2]) * abz) / lengthSq, 0), 1);
  const point: Vec3 = [a[0] + abx * t, a[1] + (b[1] - a[1]) * t, a[2] + abz * t];
  return { point, t, distance: distanceXZ(p, point) };
}

export function tangentAlong(a: Vec3, b: Vec3): readonly [number, number] {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

export function perpendicularOf(tangent: readonly [number, number]): readonly [number, number] {
  return [-tangent[1], tangent[0]];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
