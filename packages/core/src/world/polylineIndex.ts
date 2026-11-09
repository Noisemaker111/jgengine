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

/** Where the polyline comes closest to the query, within the query's bound. @internal */
export interface PolylineIndexHit {
  /** Index of the winning segment, i.e. the one from `points[segment]` to `points[segment + 1]`. */
  segment: number;
  /** Position along that segment, 0..1. */
  t: number;
  /** Distance from the query to the projected point. */
  distance: number;
  /** Projected point on the polyline. */
  point: Vec2;
}

/** A hit to pass as `out` to {@link PolylineIndex.nearest}, one per caller that reads it before its next query. @internal */
export function createPolylineHit(): PolylineIndexHit {
  return { segment: 0, t: 0, distance: 0, point: [0, 0] };
}

/** @internal */
export interface PolylineIndex {
  /**
   * Exact nearest segment sample within `limit`, or null when the polyline stays farther away. With
   * `out` the hit is written into it (its `point` array too) and returned, so a sampler that reads the
   * hit before its next query allocates nothing; without it every hit is a new object.
   */
  nearest(x: number, z: number, limit: number, out?: PolylineIndexHit): PolylineIndexHit | null;
  /** Segments tested by the most recent query — the bounded-work invariant tests assert on. */
  examined(): number;
}

/**
 * `reach` is the bound most queries will pass. A caller that always asks within a long bound (a coast
 * eases its land down across 100 m and more) passes it so the grid's cells are sized for that: a query
 * then walks a few dozen cells rather than hundreds of cells two segments wide.
 * @internal
 */
export function buildPolylineIndex(points: readonly Vec2[], reach = 0): PolylineIndex {
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
  // handful of segments; the 256-cell cap bounds memory on a very long, very dense polyline; a quarter
  // of the caller's usual reach keeps a long-bound query to a few dozen cells.
  const cell = Math.max(1, span / 256, (span / Math.max(1, count)) * 2, reach / 4);
  // A flat grid over the polyline's own box, each cell's segments ascending in one shared array: a
  // query reads its cells by index, where a map of maps cost two hash lookups per cell, and takes each
  // cell's segments straight from the array with no gather, dedupe sort or copy.
  const columns = count === 0 ? 1 : Math.floor((maxX - minX) / cell) + 1;
  const rows = count === 0 ? 1 : Math.floor((maxZ - minZ) / cell) + 1;
  const cells = columns * rows;
  const columnOf = (x: number): number => Math.min(columns - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const rowOf = (z: number): number => Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / cell)));
  const cellStart = new Int32Array(cells + 1);
  const eachCell = (segment: number, visit: (key: number) => void): void => {
    const c0 = columnOf(Math.min(ax[segment]!, ax[segment]! + abx[segment]!));
    const c1 = columnOf(Math.max(ax[segment]!, ax[segment]! + abx[segment]!));
    const r0 = rowOf(Math.min(az[segment]!, az[segment]! + abz[segment]!));
    const r1 = rowOf(Math.max(az[segment]!, az[segment]! + abz[segment]!));
    for (let row = r0; row <= r1; row += 1) for (let column = c0; column <= c1; column += 1) visit(row * columns + column);
  };
  for (let i = 0; i < count; i += 1) eachCell(i, (key) => { cellStart[key + 1] = cellStart[key + 1]! + 1; });
  for (let key = 0; key < cells; key += 1) cellStart[key + 1] = cellStart[key + 1]! + cellStart[key]!;
  const cellSegments = new Int32Array(cellStart[cells]!);
  const fill = cellStart.slice(0, cells);
  for (let i = 0; i < count; i += 1) eachCell(i, (key) => { cellSegments[fill[key]!] = i; fill[key] = fill[key]! + 1; });
  // Per cell, the distance from its centre to the polyline less half the cell's diagonal: no point of
  // the cell is nearer than that, so a query there with a shorter bound misses without testing a
  // segment. Measured the first time a query lands in the cell; NaN until then.
  const clearance = new Float64Array(cells).fill(Number.NaN);
  const halfDiagonal = cell * Math.SQRT1_2;
  // The query that last tested each segment, so a segment registered in several cells, or met again
  // when a query widens its box, is measured once per query.
  const marks = new Int32Array(count);
  let generation = 0;
  let examined = 0;
  const found = createPolylineHit();

  /** Writes the nearest hit within `limit` into `found`; false when there is none. */
  const search = (x: number, z: number, limit: number): boolean => {
    generation += 1;
    if (generation >= 2147483647) {
      marks.fill(0);
      generation = 1;
    }
    examined = 0;
    // A segment closer than `r` passes through the box of half-size `r` round the query, so it is
    // registered in one of that box's cells. Start with a box a couple of cells wide and widen it only
    // while the best hit so far lies outside it: a query beside the line (the common case) walks a few
    // cells instead of every cell of a long bound, and the answer is the one the full box gives.
    // Clamping to the polyline's own box keeps an infinite bound from walking an infinite grid.
    let bestSegment = -1;
    let bestT = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestX = 0;
    let bestZ = 0;
    for (let r = Math.min(limit, cell * 2); ; r = Math.min(limit, r * 2)) {
      const reach = r * (1 + 1e-9) + 1e-9;
      const c0 = columnOf(x - reach);
      const c1 = columnOf(x + reach);
      const r1 = rowOf(z + reach);
      for (let row = rowOf(z - reach); row <= r1; row += 1) {
        for (let key = row * columns + c0, end = row * columns + c1; key <= end; key += 1) {
          for (let k = cellStart[key]!, last = cellStart[key + 1]!; k < last; k += 1) {
            const segment = cellSegments[k]!;
            if (marks[segment] === generation) continue;
            marks[segment] = generation;
            examined += 1;
            const offsetX = x - ax[segment]!;
            const offsetZ = z - az[segment]!;
            const segLengthSq = lengthSq[segment]!;
            const t = segLengthSq <= 0 ? 0 : Math.max(0, Math.min(1, (offsetX * abx[segment]! + offsetZ * abz[segment]!) / segLengthSq));
            const px = ax[segment]! + abx[segment]! * t;
            const pz = az[segment]! + abz[segment]! * t;
            const dx = x - px;
            const dz = z - pz;
            // Squared, so the scan takes no root per segment; the winner's distance is measured once below.
            const distance = dx * dx + dz * dz;
            // Ties go to the lowest segment index in whatever order the cells give them, exactly as one
            // scan of the whole bound would.
            if (distance < bestDistance || (distance === bestDistance && segment < bestSegment)) {
              bestDistance = distance;
              bestSegment = segment;
              bestT = t;
              bestX = px;
              bestZ = pz;
            }
          }
        }
      }
      if (bestDistance <= r * r || r >= limit) break;
    }
    if (bestSegment < 0) return false;
    const distance = Math.hypot(x - bestX, z - bestZ);
    if (distance > limit) return false;
    found.segment = bestSegment;
    found.t = bestT;
    found.distance = distance;
    const point = found.point as [number, number];
    point[0] = bestX;
    point[1] = bestZ;
    return true;
  };

  return {
    nearest(x, z, limit, out) {
      if (count === 0 || !(limit >= 0)) {
        examined = 0;
        return null;
      }
      if (x < minX - limit || x > maxX + limit || z < minZ - limit || z > maxZ + limit) {
        examined = 0;
        return null;
      }
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        const column = columnOf(x);
        const row = rowOf(z);
        const key = row * columns + column;
        let clear = clearance[key]!;
        if (clear !== clear) {
          clear = search(minX + (column + 0.5) * cell, minZ + (row + 0.5) * cell, Number.POSITIVE_INFINITY) ? found.distance - halfDiagonal : Number.POSITIVE_INFINITY;
          clearance[key] = clear;
        }
        // The margin outweighs any rounding in the measured distances, so a bound the cell could just
        // reach still searches.
        if (clear > limit + (limit + cell) * 1e-6) {
          examined = 0;
          return null;
        }
      }
      if (!search(x, z, limit)) return null;
      const target = out ?? createPolylineHit();
      target.segment = found.segment;
      target.t = found.t;
      target.distance = found.distance;
      const point = target.point as [number, number];
      point[0] = found.point[0];
      point[1] = found.point[1];
      return target;
    },
    examined: () => examined,
  };
}
