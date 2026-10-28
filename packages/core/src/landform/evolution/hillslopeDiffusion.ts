// @skill jgengine-world
/**
 * Linear hillslope diffusion, ∂z/∂t = ∇·(D ∇z) (Culling 1960; Fernandes & Dietrich 1997): soil creep
 * and rain splash move regolith downslope at a rate proportional to slope, rounding hilltops into
 * convex crests. Solved implicitly, one backward-Euler sweep along rows then one along columns, each a
 * tridiagonal (Thomas) solve: unconditionally stable and monotone at any time step, O(n).
 * Base-level cells hold their height; closed edges pass no flux.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import type { LandformTopology } from "../grid/landformGrid";

/** A reusable diffusion solver for one grid. @internal */
export interface HillslopeDiffuser {
  /** Diffuse `height` in place for `dt` years with per-cell diffusivity `diffusivity` (m²/yr). */
  diffuse(height: Float64Array, diffusivity: Float64Array, dt: number): void;
}

/** A diffuser for a topology. @internal */
export function createHillslopeDiffuser(topology: LandformTopology): HillslopeDiffuser {
  const { cols, rows, base, cellSize } = topology;
  const side = Math.max(cols, rows);
  const lower = new Float64Array(side);
  const diag = new Float64Array(side);
  const upper = new Float64Array(side);
  const rhs = new Float64Array(side);
  const solution = new Float64Array(side);

  function solve(count: number): void {
    // Thomas algorithm; the diagonal (1 + both coefficients) dominates, so no pivoting is needed.
    for (let j = 1; j < count; j += 1) {
      const w = (lower[j] ?? 0) / (diag[j - 1] ?? 1);
      diag[j] = (diag[j] ?? 1) - w * (upper[j - 1] ?? 0);
      rhs[j] = (rhs[j] ?? 0) - w * (rhs[j - 1] ?? 0);
    }
    solution[count - 1] = (rhs[count - 1] ?? 0) / (diag[count - 1] ?? 1);
    for (let j = count - 2; j >= 0; j -= 1) solution[j] = ((rhs[j] ?? 0) - (upper[j] ?? 0) * (solution[j + 1] ?? 0)) / (diag[j] ?? 1);
  }

  function sweep(height: Float64Array, diffusivity: Float64Array, factor: number, count: number, start: number, stride: number): void {
    for (let j = 0; j < count; j += 1) {
      const i = start + j * stride;
      rhs[j] = height[i] ?? 0;
      if (base[i] === 1) {
        lower[j] = 0;
        diag[j] = 1;
        upper[j] = 0;
        continue;
      }
      const d = diffusivity[i] ?? 0;
      const back = j > 0 ? factor * 0.5 * (d + (diffusivity[i - stride] ?? 0)) : 0;
      const ahead = j < count - 1 ? factor * 0.5 * (d + (diffusivity[i + stride] ?? 0)) : 0;
      lower[j] = -back;
      upper[j] = -ahead;
      diag[j] = 1 + back + ahead;
    }
    solve(count);
    for (let j = 0; j < count; j += 1) height[start + j * stride] = solution[j] ?? 0;
  }

  return {
    diffuse(height, diffusivity, dt) {
      const factor = dt / (cellSize * cellSize);
      for (let row = 0; row < rows; row += 1) sweep(height, diffusivity, factor, cols, row * cols, 1);
      for (let col = 0; col < cols; col += 1) sweep(height, diffusivity, factor, rows, col, cols);
    },
  };
}
