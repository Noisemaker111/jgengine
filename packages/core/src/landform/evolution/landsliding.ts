// @skill jgengine-world
/**
 * Threshold landsliding: no slope stands steeper than its critical angle. Bare rock fails at the
 * angle its layer gives; loose regolith and debris rest at the angle of repose. Every cell is capped
 * at the lowest height its neighbours allow, min over j of (z_j + tan θ · d), found for the whole grid
 * at once by a Dijkstra sweep from the lowest cells up (the threshold-hillslope limit of Burbank et
 * al. 1996 and Montgomery & Brandon 2002). The failed rock falls as debris and comes to rest
 * downslope as a talus apron at the angle of repose.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { createCellHeap } from "../flow/cellHeap";
import type { LandformTopology } from "../grid/landformGrid";

/** What one landslide pass moved, in m³. @internal */
export interface LandslideReport {
  failed: number;
  exported: number;
}

/** A reusable landslide solver for one grid. @internal */
export interface Landslider {
  /**
   * Fail every slope steeper than it can stand and run the debris downslope to rest at `repose`
   * (rise over run). Bedrock stands at `rockCritical` per cell; loose `sediment` over it at `repose`,
   * and a loose-cover failure takes only the cover. Updates `height` and `sediment`, adds the debris
   * thickness laid on each cell to `laid` and the thickness each cell lost to `failed`.
   */
  collapse(height: Float64Array, sediment: Float64Array, rockCritical: Float64Array, repose: number, laid: Float64Array, failed: Float64Array): LandslideReport;
}

const TOLERANCE = 1e-9;
const PASSES = 4;

/** A landslide solver for a topology. @internal */
// stateless: scratch buffers every collapse refills before use; nothing carries between calls.
export function createLandslider(topology: LandformTopology): Landslider {
  const { cells, neighbour, distance, base, cellArea } = topology;
  const heap = createCellHeap(cells * 9);
  const cap = new Float64Array(cells);
  const limit = new Float64Array(cells);
  const floor = new Float64Array(cells);
  const flux = new Float64Array(cells);
  const foot = new Float64Array(cells);
  const reach = new Float64Array(cells);
  const level = new Float64Array(cells);
  const seen = new Int32Array(cells);
  const joined = new Int32Array(cells);
  const members = new Int32Array(cells);
  let stamp = 0;

  function oversteep(height: Float64Array): boolean {
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1) continue;
      const h = height[i] ?? 0;
      if (h <= (floor[i] ?? 0) + TOLERANCE) continue;
      const slope = limit[i] ?? 1;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n >= 0 && h - (height[n] ?? 0) > slope * (distance[k] ?? 1) + TOLERANCE) return true;
      }
    }
    return false;
  }

  // The highest each cell may stand: min over neighbours of (their cap + slope · distance), never
  // below its floor, swept from the lowest cells up like Dijkstra's shortest paths.
  function capAll(height: Float64Array): void {
    heap.clear();
    for (let i = 0; i < cells; i += 1) {
      cap[i] = height[i] ?? 0;
      heap.push(i, cap[i] ?? 0);
    }
    for (;;) {
      const c = heap.pop();
      if (c < 0) break;
      if (heap.lastKey !== cap[c]) continue;
      const from = cap[c] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[c * 8 + k] ?? -1;
        if (n < 0 || base[n] === 1) continue;
        const reachable = from + (limit[n] ?? 1) * (distance[k] ?? 1);
        if (reachable >= (cap[n] ?? 0)) continue;
        const bottom = floor[n] ?? 0;
        const allowed = reachable > bottom ? reachable : bottom;
        if (allowed < (cap[n] ?? 0)) {
          cap[n] = allowed;
          heap.push(n, allowed);
        }
      }
    }
  }

  function fail(height: Float64Array, sediment: Float64Array, failed: Float64Array): number {
    let moved = 0;
    for (let i = 0; i < cells; i += 1) {
      const drop = (height[i] ?? 0) - (cap[i] ?? 0);
      if (drop <= 0) continue;
      height[i] = cap[i] ?? 0;
      failed[i] = (failed[i] ?? 0) + drop;
      const cover = sediment[i] ?? 0;
      sediment[i] = cover > drop ? cover - drop : 0;
      flux[i] = drop * cellArea;
      moved += drop * cellArea;
    }
    return moved;
  }

  // Debris falls down the steepest path until the ground is gentler than the angle of repose: the
  // foot of the slope. There it builds a talus cone, max(ground, apex − tan φ · d), whose apex is set
  // so the cone holds exactly the fallen volume. Cells join the cone in order of the apex height at
  // which debris first reaches them (never below the cells it crossed), so the cone is solved in one
  // sorted sweep and keeps every cubic metre.
  function fall(height: Float64Array, repose: number): number {
    heap.clear();
    for (let i = 0; i < cells; i += 1) if ((flux[i] ?? 0) > 0) heap.push(i, -(height[i] ?? 0));
    let exported = 0;
    for (;;) {
      const i = heap.pop();
      if (i < 0) break;
      const volume = flux[i] ?? 0;
      if (volume <= 0) continue;
      flux[i] = 0;
      if (base[i] === 1) {
        exported += volume;
        continue;
      }
      const h = height[i] ?? 0;
      let next = -1;
      let steepest = 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n < 0) continue;
        const slope = (h - (height[n] ?? 0)) / (distance[k] ?? 1);
        if (slope > steepest) {
          steepest = slope;
          next = n;
        }
      }
      if (next >= 0 && steepest >= repose) {
        flux[next] = (flux[next] ?? 0) + volume;
        heap.push(next, -(height[next] ?? 0));
      } else foot[i] = (foot[i] ?? 0) + volume;
    }
    return exported;
  }

  function cone(origin: number, volume: number, height: Float64Array, sediment: Float64Array, repose: number, laid: Float64Array): void {
    stamp += 1;
    heap.clear();
    seen[origin] = stamp;
    reach[origin] = 0;
    level[origin] = height[origin] ?? 0;
    heap.push(origin, level[origin] ?? 0);
    let count = 0;
    let sum = 0;
    for (;;) {
      const c = heap.pop();
      if (c < 0) break;
      const key = heap.lastKey;
      if (joined[c] === stamp || key !== (level[c] ?? 0)) continue;
      if (count > 0 && (volume + sum) / count <= key) break;
      joined[c] = stamp;
      members[count] = c;
      count += 1;
      sum += key;
      const d = reach[c] ?? 0;
      const floor = level[c] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[c * 8 + k] ?? -1;
        if (n < 0 || base[n] === 1 || joined[n] === stamp) continue;
        const nd = d + (distance[k] ?? 1);
        if (seen[n] === stamp && (reach[n] ?? 0) <= nd) continue;
        seen[n] = stamp;
        reach[n] = nd;
        // Debris reaches a cell only over the cells before it, so its level never sits below theirs.
        const own = (height[n] ?? 0) + repose * nd;
        level[n] = own > floor ? own : floor;
        heap.push(n, level[n] ?? 0);
      }
    }
    const apex = (volume + sum) / count;
    for (let j = 0; j < count; j += 1) {
      const c = members[j] ?? 0;
      const thickness = apex - (level[c] ?? 0);
      if (thickness <= 0) continue;
      height[c] = (height[c] ?? 0) + thickness;
      sediment[c] = (sediment[c] ?? 0) + thickness;
      laid[c] = (laid[c] ?? 0) + thickness;
    }
  }

  function runout(height: Float64Array, sediment: Float64Array, repose: number, laid: Float64Array): number {
    foot.fill(0);
    const exported = fall(height, repose);
    for (let i = 0; i < cells; i += 1) {
      const volume = foot[i] ?? 0;
      if (volume > 0) cone(i, volume / cellArea, height, sediment, repose, laid);
    }
    return exported;
  }

  return {
    collapse(height, sediment, rockCritical, repose, laid, failed) {
      const report: LandslideReport = { failed: 0, exported: 0 };
      for (let pass = 0; pass < PASSES; pass += 1) {
        let moved = false;
        // Rock first: the whole column fails where bare rock is too steep.
        limit.set(rockCritical);
        floor.fill(Number.NEGATIVE_INFINITY);
        if (oversteep(height)) {
          capAll(height);
          report.failed += fail(height, sediment, failed);
          report.exported += runout(height, sediment, repose, laid);
          moved = true;
        }
        // Then loose cover, which slides off down to the rock beneath it.
        limit.fill(repose);
        for (let i = 0; i < cells; i += 1) floor[i] = (height[i] ?? 0) - (sediment[i] ?? 0);
        if (oversteep(height)) {
          capAll(height);
          report.failed += fail(height, sediment, failed);
          report.exported += runout(height, sediment, repose, laid);
          moved = true;
        }
        if (!moved) break;
      }
      return report;
    },
  };
}
