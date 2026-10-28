// @skill jgengine-world
/**
 * Where water goes on a heightfield. Priority-Flood (Barnes, Lehman & Mulla 2014) fills every closed
 * depression to its spill height, which gives each lake its water surface; a tiny rise across the
 * filled flats (Priority-Flood+ε) lets steepest-descent D8 routing (O'Callaghan & Mark 1984) drain
 * through lakes to an outlet. Cells are then ordered receivers-before-donors (the stack of Braun &
 * Willett 2013), so drainage area accumulates and an implicit river solver runs in O(n).
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import type { LandformTopology } from "../grid/landformGrid";
import { createCellHeap, type CellHeap } from "./cellHeap";

/** Rise per cell across filled flats, in metres; small next to any relief, large next to rounding. */
export const FLAT_RISE = 1e-6;

/**
 * Flow routing of one heightfield. Arrays are owned by the router and overwritten by the next
 * {@link FlowRouter.route}.
 */
export interface FlowRouting {
  /** Water surface per cell: the height a closed depression fills to, the sea where it is higher, else the ground. */
  readonly water: Float64Array;
  /** Steepest-descent receiver per cell; a base-level cell is its own receiver. */
  readonly receiver: Int32Array;
  /** Distance to the receiver in metres (0 at base level). */
  readonly receiverDistance: Float64Array;
  /** Cells ordered so every receiver comes before its donors. */
  readonly stack: Int32Array;
  /** Upstream catchment of each cell in m², weighted by rainfall when given. */
  readonly area: Float64Array;
  /** The filled surface routing ran on: {@link FlowRouting.water} plus a tiny rise across flats. */
  readonly drain: Float64Array;
}

/** A reusable router for one grid: all buffers allocated once. @internal */
export interface FlowRouter extends FlowRouting {
  /**
   * Route `height`. `seaLevel` floods base-level cells below it, and every depression joined to them.
   * `rainfall`, when given, weights each cell's contribution to catchment area.
   */
  route(height: Float64Array, seaLevel: number, rainfall?: ArrayLike<number>): void;
}

/** A router for a topology. @internal */
export function createFlowRouter(topology: LandformTopology): FlowRouter {
  const { cells, neighbour, distance, base, cellArea } = topology;
  const water = new Float64Array(cells);
  const drain = new Float64Array(cells);
  const receiver = new Int32Array(cells);
  const receiverDistance = new Float64Array(cells);
  const stack = new Int32Array(cells);
  const area = new Float64Array(cells);
  const closed = new Uint8Array(cells);
  const donorCount = new Int32Array(cells);
  const donorStart = new Int32Array(cells + 1);
  const donors = new Int32Array(cells);
  const heap: CellHeap = createCellHeap(cells);

  function fill(height: Float64Array, seaLevel: number): void {
    closed.fill(0);
    heap.clear();
    for (let i = 0; i < cells; i += 1) {
      if (base[i] !== 1) continue;
      const h = height[i] ?? 0;
      const level = h > seaLevel ? h : seaLevel;
      water[i] = level;
      drain[i] = level;
      closed[i] = 1;
      heap.push(i, level);
    }
    for (;;) {
      const c = heap.pop();
      if (c < 0) break;
      const cWater = water[c] ?? 0;
      const cDrain = drain[c] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[c * 8 + k] ?? -1;
        if (n < 0 || closed[n] === 1) continue;
        closed[n] = 1;
        const h = height[n] ?? 0;
        water[n] = h > cWater ? h : cWater;
        const lifted = cDrain + FLAT_RISE;
        drain[n] = h > lifted ? h : lifted;
        heap.push(n, drain[n] ?? 0);
      }
    }
  }

  function receivers(): void {
    for (let i = 0; i < cells; i += 1) {
      if (base[i] === 1) {
        receiver[i] = i;
        receiverDistance[i] = 0;
        continue;
      }
      const d = drain[i] ?? 0;
      let best = i;
      let bestSlope = 0;
      let bestDistance = 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n < 0) continue;
        const run = distance[k] ?? 1;
        const slope = (d - (drain[n] ?? 0)) / run;
        if (slope > bestSlope) {
          bestSlope = slope;
          best = n;
          bestDistance = run;
        }
      }
      receiver[i] = best;
      receiverDistance[i] = bestDistance;
    }
  }

  function order(): void {
    donorCount.fill(0);
    for (let i = 0; i < cells; i += 1) {
      const r = receiver[i] ?? i;
      if (r !== i) donorCount[r] = (donorCount[r] ?? 0) + 1;
    }
    donorStart[0] = 0;
    for (let i = 0; i < cells; i += 1) donorStart[i + 1] = (donorStart[i] ?? 0) + (donorCount[i] ?? 0);
    donorCount.fill(0);
    for (let i = 0; i < cells; i += 1) {
      const r = receiver[i] ?? i;
      if (r === i) continue;
      donors[(donorStart[r] ?? 0) + (donorCount[r] ?? 0)] = i;
      donorCount[r] = (donorCount[r] ?? 0) + 1;
    }
    // Depth-first from every base-level cell. Cells still to visit wait at the tail of `stack`
    // while visited ones fill its head; together they never number more than the grid.
    let written = 0;
    for (let root = 0; root < cells; root += 1) {
      if (receiver[root] !== root) continue;
      let top = cells - 1;
      stack[top] = root;
      while (top < cells) {
        const c = stack[top] ?? 0;
        top += 1;
        stack[written] = c;
        written += 1;
        const from = donorStart[c] ?? 0;
        const to = donorStart[c + 1] ?? 0;
        for (let j = to - 1; j >= from; j -= 1) {
          top -= 1;
          stack[top] = donors[j] ?? 0;
        }
      }
    }
    if (written !== cells) throw new Error(`landform flow routing reached ${written} of ${cells} cells`);
  }

  function accumulate(rainfall: ArrayLike<number> | undefined): void {
    for (let i = 0; i < cells; i += 1) area[i] = rainfall === undefined ? cellArea : cellArea * (rainfall[i] ?? 1);
    for (let s = cells - 1; s >= 0; s -= 1) {
      const i = stack[s] ?? 0;
      const r = receiver[i] ?? i;
      if (r !== i) area[r] = (area[r] ?? 0) + (area[i] ?? 0);
    }
  }

  return {
    water,
    drain,
    receiver,
    receiverDistance,
    stack,
    area,
    route(height, seaLevel, rainfall) {
      fill(height, seaLevel);
      receivers();
      order();
      accumulate(rainfall);
    },
  };
}
