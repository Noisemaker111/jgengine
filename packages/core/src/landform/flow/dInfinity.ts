// @skill jgengine-world
/**
 * D∞ flow accumulation (Tarboton 1997): each cell sends its water down the steepest of eight
 * triangular facets and splits it between the two cells that facet spans, so flow on an open slope
 * spreads the way it does on real ground instead of locking to eight directions. Runs on a
 * depression-free surface (the `drain` of a routing) so every cell reaches an outlet.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { plantAtan } from "../../plants/growth/plantMath";
import type { LandformTopology } from "../grid/landformGrid";

const QUARTER_PI = 0.78539816339744830962;

/**
 * D∞ upstream area per cell in m² over a depression-free `surface`, weighted by `rainfall` when given.
 * `fallback` names a downhill cell for any cell with no descending facet (a D8 receiver).
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
export function dInfinityArea(topology: LandformTopology, surface: ArrayLike<number>, fallback: ArrayLike<number>, rainfall?: ArrayLike<number>): Float64Array {
  const { cells, neighbour, cellSize, cellArea, base } = topology;
  const order = new Int32Array(cells);
  for (let i = 0; i < cells; i += 1) order[i] = i;
  order.sort((a, b) => {
    const ha = surface[a] ?? 0;
    const hb = surface[b] ?? 0;
    return ha > hb ? -1 : ha < hb ? 1 : a - b;
  });
  const area = new Float64Array(cells);
  for (let i = 0; i < cells; i += 1) area[i] = rainfall === undefined ? cellArea : cellArea * (rainfall[i] ?? 1);
  const diagonal = cellSize * Math.SQRT2;
  for (const i of order) {
    if (base[i] === 1) continue;
    const e0 = surface[i] ?? 0;
    let bestSlope = 0;
    let first = -1;
    let second = -1;
    let share = 0;
    // Facet f spans cardinal neighbour k1 and diagonal neighbour k2, adjacent in D8 order.
    for (let f = 0; f < 8; f += 1) {
      const cardinal = f % 2 === 0 ? f : (f + 1) % 8;
      const corner = f % 2 === 0 ? (f + 1) % 8 : f;
      const n1 = neighbour[i * 8 + cardinal] ?? -1;
      const n2 = neighbour[i * 8 + corner] ?? -1;
      if (n1 < 0 || n2 < 0) continue;
      const s1 = (e0 - (surface[n1] ?? 0)) / cellSize;
      const s2 = ((surface[n1] ?? 0) - (surface[n2] ?? 0)) / cellSize;
      let r: number;
      let s: number;
      if (s1 <= 0 && s2 <= 0) continue;
      if (s1 <= 0) {
        r = QUARTER_PI;
        s = (e0 - (surface[n2] ?? 0)) / diagonal;
      } else {
        r = plantAtan(s2 / s1);
        s = Math.sqrt(s1 * s1 + s2 * s2);
        if (r < 0) {
          r = 0;
          s = s1;
        } else if (r > QUARTER_PI) {
          r = QUARTER_PI;
          s = (e0 - (surface[n2] ?? 0)) / diagonal;
        }
      }
      if (s > bestSlope) {
        bestSlope = s;
        first = n1;
        second = n2;
        share = r / QUARTER_PI;
      }
    }
    const a = area[i] ?? 0;
    if (first < 0) {
      const r = fallback[i] ?? i;
      if (r !== i) area[r] = (area[r] ?? 0) + a;
      continue;
    }
    area[first] = (area[first] ?? 0) + a * (1 - share);
    area[second] = (area[second] ?? 0) + a * share;
  }
  return area;
}
