/**
 * Nearest-point queries against a polyline within a distance bound. The corridor sampler, road
 * draping and the palette's polyline regions ask "is this vertex near that line?" for every vertex of
 * a terrain mesh, so a linear scan of every segment per vertex turned one authored road into seconds
 * of boot time. This keeps the exact same arithmetic as a full scan while visiting only the segments
 * that can possibly win: a query returns the same segment, the same `t` and the same distance a scan
 * would, and `null` only when the whole polyline is farther away than the bound.
 * @internal
 */
import type { Vec2 } from "./geometry";
import { buildSpatialBuckets } from "./spatialBuckets";

/** Where the polyline comes closest to the query, within the query's bound. @internal */
export interface PolylineHit {
  /** Index of the winning segment, i.e. the one from `points[segment]` to `points[segment + 1]`. */
  segment: number;
  /** Position along that segment, 0..1. */
  t: number;
  /** Distance from the query to the projected point. */
  distance: number;
  /** Projected point on the polyline. */
  point: Vec2;
}

/** @internal */
export interface PolylineIndex {
  /** Exact nearest segment sample within `limit`, or null when the polyline stays farther away. */
  nearest(x: number, z: number, limit: number): PolylineHit | null;
  /** Segments tested by the most recent query — the bounded-work invariant tests assert on. */
  examined(): number;
}

/** @internal */
export function buildPolylineIndex(points: readonly Vec2[]): PolylineIndex {
  const count = Math.max(0, points.length - 1);
  const ax = new Float64Array(count);
  const az = new Float64Array(count);
  const abx = new Float64Array(count);
  const abz = new Float64Array(count);
  const lengthSq = new Float64Array(count);
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    ax[i] = a[0];
    az[i] = a[1];
    abx[i] = b[0] - a[0];
    abz[i] = b[1] - a[1];
    lengthSq[i] = abx[i]! * abx[i]! + abz[i]! * abz[i]!;
    minX = Math.min(minX, a[0], b[0]);
    maxX = Math.max(maxX, a[0], b[0]);
    minZ = Math.min(minZ, a[1], b[1]);
    maxZ = Math.max(maxZ, a[1], b[1]);
  }
  const span = count === 0 ? 1 : Math.max(maxX - minX, maxZ - minZ, 1);
  // Twice the average segment length keeps a typical reach inside one or two cells, so a query tests a
  // handful of segments; the 256-cell cap bounds memory on a very long, very dense polyline.
  const buckets = buildSpatialBuckets(Math.max(1, span / 256, (span / Math.max(1, count)) * 2));
  for (let i = 0; i < count; i += 1) {
    buckets.insert(i, Math.min(ax[i]!, ax[i]! + abx[i]!), Math.min(az[i]!, az[i]! + abz[i]!), Math.max(ax[i]!, ax[i]! + abx[i]!), Math.max(az[i]!, az[i]! + abz[i]!));
  }

  const candidates: number[] = [];
  let examined = 0;

  return {
    nearest(x, z, limit) {
      if (count === 0 || !(limit >= 0)) {
        examined = 0;
        return null;
      }
      if (x < minX - limit || x > maxX + limit || z < minZ - limit || z > maxZ + limit) {
        examined = 0;
        return null;
      }
      // A segment closer than `limit` passes through this box, so it is registered in one of its cells.
      // Clamping to the polyline's own box keeps an infinite bound from walking an infinite grid.
      const reach = limit * (1 + 1e-9) + 1e-9;
      buckets.query(Math.max(minX, x - reach), Math.max(minZ, z - reach), Math.min(maxX, x + reach), Math.min(maxZ, z + reach), candidates);
      examined = candidates.length;
      if (candidates.length === 0) return null;
      let bestSegment = -1;
      let bestT = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestX = 0;
      let bestZ = 0;
      for (const segment of candidates) {
        const offsetX = x - ax[segment]!;
        const offsetZ = z - az[segment]!;
        const segLengthSq = lengthSq[segment]!;
        const t = segLengthSq <= 0 ? 0 : Math.max(0, Math.min(1, (offsetX * abx[segment]! + offsetZ * abz[segment]!) / segLengthSq));
        const px = ax[segment]! + abx[segment]! * t;
        const pz = az[segment]! + abz[segment]! * t;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSegment = segment;
          bestT = t;
          bestX = px;
          bestZ = pz;
        }
      }
      if (bestSegment < 0 || bestDistance > limit) return null;
      return { segment: bestSegment, t: bestT, distance: bestDistance, point: [bestX, bestZ] };
    },
    examined: () => examined,
  };
}
