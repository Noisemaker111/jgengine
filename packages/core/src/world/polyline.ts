import type { Vec2 } from "./geometry";
import { distance, lerp, normalize, perp, sub } from "./vec2";

/** A polyline prepared for repeated distance/fraction sampling, with cumulative arc-length precomputed. */
export interface Polyline {
  readonly points: readonly Vec2[];
  readonly cumulative: readonly number[];
  readonly length: number;
}

/** The closest point on a polyline to a query point, with where it lands along the line. */
export interface PolylineHit {
  readonly point: Vec2;
  readonly distanceAlong: number;
  readonly segment: number;
  readonly lateral: number;
}

/** Prepare a polyline from ordered points, computing cumulative arc-length once for O(log n) sampling.
 * @internal
 */
export function polyline(points: readonly Vec2[]): Polyline {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1]! + distance(points[i - 1]!, points[i]!));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] ?? 0 };
}

function segmentAt(line: Polyline, dist: number): { index: number; t: number } {
  const { cumulative } = line;
  const clamped = dist < 0 ? 0 : dist > line.length ? line.length : dist;
  let lo = 1;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! < clamped) lo = mid + 1;
    else hi = mid;
  }
  const start = cumulative[lo - 1]!;
  const span = cumulative[lo]! - start;
  return { index: lo, t: span <= 0 ? 0 : (clamped - start) / span };
}

/** Point at an absolute arc-length distance along the line, clamped to the endpoints.
 * @internal
 */
export function pointAtDistance(line: Polyline, dist: number): Vec2 {
  if (line.points.length === 0) return [0, 0];
  if (line.points.length === 1) return line.points[0]!;
  const { index, t } = segmentAt(line, dist);
  return lerp(line.points[index - 1]!, line.points[index]!, t);
}

/** Point at a `[0, 1]` fraction of the line's total length.
 * @internal
 */
export function pointAtFraction(line: Polyline, fraction: number): Vec2 {
  return pointAtDistance(line, fraction * line.length);
}

/** Unit tangent (direction of travel) at an absolute distance along the line.
 * @internal
 */
export function tangentAtDistance(line: Polyline, dist: number): Vec2 {
  if (line.points.length < 2) return [0, 1];
  const { index } = segmentAt(line, dist);
  return normalize(sub(line.points[index]!, line.points[index - 1]!));
}

/** Closest point on the line to `query`, reporting arc-length position, segment index, and signed lateral offset.
 * @internal
 */
export function closestPoint(line: Polyline, query: Vec2): PolylineHit {
  const { points, cumulative } = line;
  if (points.length === 0) return { point: [0, 0], distanceAlong: 0, segment: 0, lateral: 0 };
  if (points.length === 1) {
    return { point: points[0]!, distanceAlong: 0, segment: 0, lateral: distance(points[0]!, query) };
  }
  let best: PolylineHit = { point: points[0]!, distanceAlong: 0, segment: 0, lateral: Infinity };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const segLenSq = abx * abx + aby * aby;
    const t = segLenSq <= 0 ? 0 : Math.max(0, Math.min(1, ((query[0] - a[0]) * abx + (query[1] - a[1]) * aby) / segLenSq));
    const point: Vec2 = [a[0] + abx * t, a[1] + aby * t];
    const lateral = distance(point, query);
    if (lateral < best.lateral) {
      const along = cumulative[i - 1]! + t * Math.sqrt(segLenSq);
      const side = Math.sign(perp(normalize([abx, aby]))[0] * (query[0] - point[0]) + perp(normalize([abx, aby]))[1] * (query[1] - point[1]));
      best = { point, distanceAlong: along, segment: i - 1, lateral: lateral * (side === 0 ? 1 : side) };
    }
  }
  return best;
}
