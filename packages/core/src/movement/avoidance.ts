/**
 * Local collision avoidance: nudge a set of circular agents apart so they stop
 * overlapping, kept deliberately separate from route planning so a game can
 * pair it with nav paths, flow fields, direct seek, or vehicle steering. It is a
 * short symmetric relaxation (Jacobi position correction) over a bounded uniform
 * hash grid — each agent only tests the 3×3 cells around it, so cost scales with
 * local density, never O(n²) across the whole world. Corrections are summed per
 * agent and applied after each pass, so the result is order-independent and
 * deterministic for a given agent list. Different radii and per-agent weights
 * (inverse mass; `0` = immovable anchor/obstacle) are honored.
 */

import type { Vec2 } from "./formation";

/** A circular agent that avoidance may push on the XZ plane. */
export interface AvoidanceAgent {
  /** Current XZ position; reassigned in place by {@link resolveLocalAvoidance}. */
  position: Vec2;
  /** Collision radius (world units). */
  radius: number;
}

/** Tuning for {@link resolveLocalAvoidance}. */
export interface LocalAvoidanceOptions {
  /** Relaxation passes; more converges denser packs. Default `2`. */
  iterations?: number;
  /** Fraction of each overlap resolved per pass, `0..1`. Lower is softer/less jittery. Default `1`. */
  strength?: number;
  /** Extra gap enforced beyond the two radii (world units). Default `0`. */
  padding?: number;
  /**
   * Per-agent inverse mass, parallel to the agent list. `0` pins an agent
   * (obstacle/leader); a heavier agent (smaller value) yields less. Omitted or
   * negative entries default to `1`. Two pinned agents never push each other.
   */
  weights?: readonly number[];
}

const CELL_KEY_STRIDE = 0x40000000;

function cellKey(cx: number, cz: number): number {
  return cx * CELL_KEY_STRIDE + cz;
}

/**
 * Resolve overlaps in `agents` in place and return how many overlapping pairs
 * remained on the final pass (`0` = fully separated). Uses a bounded uniform
 * hash grid sized to the largest agent, so only nearby agents are ever compared.
 * Deterministic: corrections are accumulated then applied per pass, independent
 * of agent order. Pass `weights` to pin or differentially push agents.
 *
 * @capability local-avoidance bounded deterministic local collision avoidance for moving agents
 * @consumer squad/crowd movement — keep grouped agents from overlapping without a whole-world scan
 */
export function resolveLocalAvoidance(
  agents: AvoidanceAgent[],
  options: LocalAvoidanceOptions = {},
): number {
  const count = agents.length;
  if (count < 2) return 0;

  const iterations = Math.max(1, Math.floor(options.iterations ?? 2));
  const strength = options.strength ?? 1;
  const padding = options.padding ?? 0;
  const weights = options.weights;

  let maxRadius = 0;
  for (let i = 0; i < count; i += 1) {
    if (agents[i]!.radius > maxRadius) maxRadius = agents[i]!.radius;
  }
  const cell = Math.max(2 * maxRadius + padding, 1e-6);
  const invCell = 1 / cell;

  const corrX = new Float64Array(count);
  const corrZ = new Float64Array(count);
  const grid = new Map<number, number[]>();

  let overlaps = 0;
  for (let pass = 0; pass < iterations; pass += 1) {
    grid.clear();
    for (let i = 0; i < count; i += 1) {
      const p = agents[i]!.position;
      const key = cellKey(Math.floor(p[0] * invCell), Math.floor(p[1] * invCell));
      let bucket = grid.get(key);
      if (bucket === undefined) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(i);
    }

    corrX.fill(0);
    corrZ.fill(0);
    overlaps = 0;

    for (let i = 0; i < count; i += 1) {
      const a = agents[i]!;
      const cx = Math.floor(a.position[0] * invCell);
      const cz = Math.floor(a.position[1] * invCell);
      const wi = weightOf(weights, i);
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = grid.get(cellKey(cx + dx, cz + dz));
          if (bucket === undefined) continue;
          for (let b = 0; b < bucket.length; b += 1) {
            const j = bucket[b]!;
            if (j <= i) continue;
            const wj = weightOf(weights, j);
            const totalWeight = wi + wj;
            if (totalWeight <= 0) continue;
            const bAgent = agents[j]!;
            const minDist = a.radius + bAgent.radius + padding;
            let ndx = bAgent.position[0] - a.position[0];
            let ndz = bAgent.position[1] - a.position[1];
            let dist = Math.hypot(ndx, ndz);
            if (dist >= minDist) continue;
            overlaps += 1;
            if (dist < 1e-9) {
              // Coincident: separate along a deterministic axis by index order.
              ndx = 1;
              ndz = 0;
              dist = 0;
            } else {
              ndx /= dist;
              ndz /= dist;
            }
            const penetration = (minDist - dist) * strength;
            const shareA = (wi / totalWeight) * penetration;
            const shareB = (wj / totalWeight) * penetration;
            corrX[i]! -= ndx * shareA;
            corrZ[i]! -= ndz * shareA;
            corrX[j]! += ndx * shareB;
            corrZ[j]! += ndz * shareB;
          }
        }
      }
    }

    for (let i = 0; i < count; i += 1) {
      const cxi = corrX[i]!;
      const czi = corrZ[i]!;
      if (cxi === 0 && czi === 0) continue;
      const p = agents[i]!.position;
      agents[i]!.position = [p[0] + cxi, p[1] + czi];
    }
  }
  return overlaps;
}

function weightOf(weights: readonly number[] | undefined, index: number): number {
  if (weights === undefined) return 1;
  const w = weights[index];
  return w === undefined || w < 0 ? 1 : w;
}
