// @skill jgengine-world
/**
 * Sea cliffs and shore platforms. Waves arrive with full energy across water deeper than wave base
 * and lose it exponentially with the distance they travel over shallow water, E = e^(−d/W*), so a
 * cliff retreats at R = R₀·E: fast while the sea is deep at its foot, slower as the platform it
 * leaves widens (Sunamura 1992; the energy-dissipating platform of Anderson, Densmore & Ellis 1999).
 * The waves also wear the submerged platform down at a rate that falls exponentially with depth.
 *
 * A cliff cell retreats R·dt of its width: it loses that share of a column as tall as the land
 * behind it, down to a notch just below sea level, so the coast moves smoothly between cells. The
 * shallow-water distance is a Dijkstra sweep over sea cells from deep water; long steps split into
 * sub-steps of at most a tenth of a cell of retreat, up to a fixed count.
 *
 * @capability landform-coastal sea cliffs that retreat under waves and leave shore platforms and beaches
 */
import { plantExp } from "../../plants/growth/plantMath";
import { createCellHeap } from "../flow/cellHeap";
import type { LandformTopology } from "../grid/landformGrid";

/** Wave settings for one pass. @internal */
export interface WaveSettings {
  /** Sea surface in metres. */
  seaLevel: number;
  /** Cliff retreat rate R₀ in m/yr under waves arriving across deep water. */
  cliffRetreat: number;
  /** Distance W* in metres of shallow water over which waves lose a factor e of their energy. */
  attenuation: number;
  /** Depth in metres below which water no longer damps waves. */
  waveBase: number;
  /** Lowering rate in m/yr of a platform at the waterline under full waves. */
  platformErosion: number;
  /** Depth in metres over which platform lowering falls by e. */
  platformDepthScale: number;
  /** Depth below sea level in metres a retreating cliff is cut to. */
  notchDepth: number;
}

/** A reusable wave solver for one grid. @internal */
export interface WaveEroder {
  /** Wave energy 0..1 reaching each sea cell, and each cliff cell from its sea, after the last pass. */
  readonly energy: Float64Array;
  /** 1 on cells joined to open sea, after the last pass. */
  readonly sea: Uint8Array;
  /**
   * Erode `height` in place for `dt` years, adding the metres removed from each cell to `cut`.
   * Returns the sub-steps used.
   */
  erode(height: Float64Array, settings: WaveSettings, dt: number, cut: Float64Array, maxSubsteps: number): number;
}

/** A wave solver for a topology. @internal */
// stateless: scratch fields; the coast itself lives in the caller's height array.
export function createWaveEroder(topology: LandformTopology): WaveEroder {
  const { cells, cellSize, base, neighbour, distance } = topology;
  const sea = new Uint8Array(cells);
  const energy = new Float64Array(cells);
  const reach = new Float64Array(cells);
  const queue = new Int32Array(cells);
  const heap = createCellHeap(cells * 8 + 8);

  // Open sea: below sea level and joined, through cells below sea level, to a base-level cell.
  function markSea(height: Float64Array, seaLevel: number): void {
    sea.fill(0);
    let written = 0;
    for (let i = 0; i < cells; i += 1) {
      if (base[i] !== 1 || (height[i] ?? 0) >= seaLevel) continue;
      sea[i] = 1;
      queue[written] = i;
      written += 1;
    }
    for (let read = 0; read < written; read += 1) {
      const c = queue[read] ?? 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[c * 8 + k] ?? -1;
        if (n < 0 || sea[n] === 1 || (height[n] ?? 0) >= seaLevel) continue;
        sea[n] = 1;
        queue[written] = n;
        written += 1;
      }
    }
  }

  // Distance waves travel over shallow water to reach each sea cell, then the energy that arrives.
  function waveEnergy(height: Float64Array, settings: WaveSettings): void {
    heap.clear();
    reach.fill(Number.POSITIVE_INFINITY);
    for (let i = 0; i < cells; i += 1) {
      if (sea[i] !== 1 || settings.seaLevel - (height[i] ?? 0) < settings.waveBase) continue;
      reach[i] = 0;
      heap.push(i, 0);
    }
    while (heap.size > 0) {
      const c = heap.pop();
      const d = heap.lastKey;
      if (c < 0 || d > (reach[c] ?? 0)) continue;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[c * 8 + k] ?? -1;
        if (n < 0 || sea[n] !== 1) continue;
        const next = d + (distance[k] ?? cellSize);
        if (next >= (reach[n] ?? 0)) continue;
        reach[n] = next;
        heap.push(n, next);
      }
    }
    energy.fill(0);
    for (let i = 0; i < cells; i += 1) {
      if (sea[i] === 1) {
        const d = reach[i] ?? Number.POSITIVE_INFINITY;
        energy[i] = d === Number.POSITIVE_INFINITY ? 0 : plantExp(-d / settings.attenuation);
      }
    }
    // A cliff takes the strongest waves of the sea cells beside it.
    for (let i = 0; i < cells; i += 1) {
      if (sea[i] === 1 || base[i] === 1) continue;
      let best = 0;
      for (let k = 0; k < 8; k += 1) {
        const n = neighbour[i * 8 + k] ?? -1;
        if (n >= 0 && sea[n] === 1 && (energy[n] ?? 0) > best) best = energy[n] ?? 0;
      }
      energy[i] = best;
    }
  }

  return {
    energy,
    sea,
    erode(height, settings, dt, cut, maxSubsteps) {
      const fastest = settings.cliffRetreat * dt;
      let substeps = Math.ceil(fastest / (0.1 * cellSize));
      if (substeps < 1) substeps = 1;
      if (substeps > maxSubsteps) substeps = maxSubsteps;
      const h = dt / substeps;
      const notch = settings.seaLevel - settings.notchDepth;
      for (let s = 0; s < substeps; s += 1) {
        markSea(height, settings.seaLevel);
        waveEnergy(height, settings);
        for (let i = 0; i < cells; i += 1) {
          if (base[i] === 1) continue;
          const e = energy[i] ?? 0;
          if (e <= 0) continue;
          const z = height[i] ?? 0;
          let loss = 0;
          if (sea[i] === 1) {
            const depth = settings.seaLevel - z;
            if (settings.platformErosion > 0) loss = settings.platformErosion * e * plantExp(-depth / settings.platformDepthScale) * h;
          } else if (z > notch) {
            // The face is as tall as the land behind it, so each metre of retreat removes a whole column.
            let top = z;
            for (let k = 0; k < 8; k += 1) {
              const n = neighbour[i * 8 + k] ?? -1;
              if (n >= 0 && sea[n] !== 1 && (height[n] ?? 0) > top) top = height[n] ?? 0;
            }
            loss = ((top - notch) * settings.cliffRetreat * e * h) / cellSize;
            if (loss > z - notch) loss = z - notch;
          }
          if (loss <= 0) continue;
          height[i] = z - loss;
          cut[i] = (cut[i] ?? 0) + loss;
        }
      }
      markSea(height, settings.seaLevel);
      waveEnergy(height, settings);
      return substeps;
    },
  };
}
