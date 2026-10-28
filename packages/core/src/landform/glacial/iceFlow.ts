// @skill jgengine-world
/**
 * Valley glaciers by the shallow-ice approximation: ice thickness H over a bed b flows down its own
 * surface s = b + H by Glen's law (Glen 1955, n = 3) and slides over its bed at u_b = C·τ_b, with
 * τ_b = ρgH|∇s|, so the flux is q = −(Γ H⁵ |∇s|² + C ρg H²) ∇s, Γ = 2A(ρg)³/5. Ice gains and loses
 * mass by a balance that rises with altitude, b = min(β(s − ELA), b_max). Fluxes live on the cell
 * faces of Mahaffy's (1976) staggered grid, and a face passes no ice when the cell above it is bare.
 *
 * A glacier answers a change of climate or bed within centuries, far faster than a landscape step,
 * and is far too stiff on steep valley walls for explicit steps, so the ice is relaxed toward its
 * steady state: each step freezes the face coefficients, solves the surface implicitly (one
 * backward-Euler sweep along rows, one along columns) and moves halfway to that answer. The fixed
 * point is the exact steady state of the scheme (it matches Vialov's 1958 ice sheet), and the work
 * is bounded by the step count.
 *
 * Sliding is what erodes: the bed lowers at K_g·u_b (Harbor 1992; Braun, Zwartz & Tomkin 1999).
 * Neighbouring columns share stress through lateral drag (the side-drag term of depth-integrated
 * higher-order ice models), so ice beside bare rock slides slower. A glacier deepens and widens its
 * floor under the thickest ice and the oversteepened walls fail, so a river's V becomes a U.
 *
 * @capability landform-glacial glaciers that flow, slide and carve U-shaped valleys and lay moraines
 */
import type { LandformTopology } from "../grid/landformGrid";

const DRAG_PASSES = 40;
const DAMPING = 0.5;

/** Weight of ice per unit volume, ρg in Pa/m (910 kg/m³ × 9.81 m/s²). */
export const ICE_WEIGHT = 910 * 9.81;

/** Glen's flow rate factor A of temperate ice in Pa⁻³ yr⁻¹ (2.4·10⁻²⁴ Pa⁻³ s⁻¹, Cuffey & Paterson 2010). */
export const GLEN_RATE_FACTOR = 7.57e-17;

/**
 * Γ = 2A(ρg)³/(n + 2) of the shallow-ice flux for Glen's n = 3, in m⁻³ yr⁻¹.
 * @capability landform-glacial glaciers that flow, slide and carve U-shaped valleys and lay moraines
 */
export function iceDeformationRate(rateFactor: number = GLEN_RATE_FACTOR): number {
  return (2 * rateFactor * ICE_WEIGHT * ICE_WEIGHT * ICE_WEIGHT) / 5;
}

/** How ice flows and gains mass. @internal */
export interface IceFlowSettings {
  /** Γ of the deformation flux, m⁻³ yr⁻¹. */
  deformation: number;
  /** Sliding coefficient C in m yr⁻¹ Pa⁻¹. */
  sliding: number;
  /** Equilibrium line altitude in metres. */
  ela: number;
  /** Mass balance gradient β in (m/yr of ice) per metre of altitude. */
  balanceGradient: number;
  /** Largest accumulation in m/yr. */
  maxAccumulation: number;
  /** Effective ice viscosity in Pa·yr coupling neighbouring columns' sliding; 0 slides each column alone. */
  lateralDrag: number;
}

/** A reusable ice solver for one grid. @internal */
export interface IceFlow {
  /** Sliding speed in m/yr at each cell centre after the last {@link IceFlow.relax}. */
  readonly sliding: Float64Array;
  /**
   * Relax `ice` (thickness in metres, in place) over `bed` toward steady state over `years` in
   * `steps` damped implicit steps. `balance` (m/yr per cell) replaces the altitude rule when given.
   * Returns the largest |∂H/∂t| in m/yr left at the last step; 0 at steady state.
   */
  relax(bed: Float64Array, ice: Float64Array, years: number, steps: number, settings: IceFlowSettings, balance?: Float64Array): number;
}

/** An ice solver for a topology. @internal */
// stateless: scratch arrays; the ice itself lives in the caller's array.
export function createIceFlow(topology: LandformTopology): IceFlow {
  const { cols, rows, cells, cellSize, base } = topology;
  const surface = new Float64Array(cells);
  const gradY = new Float64Array(cells);
  const gradX = new Float64Array(cells);
  const east = new Float64Array(cells);
  const south = new Float64Array(cells);
  const start = new Float64Array(cells);
  const side = Math.max(cols, rows);
  const lower = new Float64Array(side);
  const diag = new Float64Array(side);
  const upper = new Float64Array(side);
  const rhs = new Float64Array(side);
  const solution = new Float64Array(side);
  const sliding = new Float64Array(cells);
  const driving = new Float64Array(cells);
  const dx = cellSize;

  function surfaceGradients(bed: Float64Array, ice: Float64Array): void {
    for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (ice[i] ?? 0);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const up = row > 0 ? i - cols : i;
        const down = row < rows - 1 ? i + cols : i;
        const left = col > 0 ? i - 1 : i;
        const right = col < cols - 1 ? i + 1 : i;
        gradY[i] = ((surface[down] ?? 0) - (surface[up] ?? 0)) / (dx * ((down === i ? 0 : 1) + (up === i ? 0 : 1)));
        gradX[i] = ((surface[right] ?? 0) - (surface[left] ?? 0)) / (dx * ((right === i ? 0 : 1) + (left === i ? 0 : 1)));
      }
    }
  }

  // Face diffusivity D = (Γ H⁵ + C (ρg)³ H⁴) |∇s|² between cells a and b; zero when the upper cell is bare.
  function faceDiffusivity(ice: Float64Array, a: number, b: number, along: number, across: number, settings: IceFlowSettings): number {
    if ((ice[along <= 0 ? a : b] ?? 0) <= 0) return 0;
    const h = 0.5 * ((ice[a] ?? 0) + (ice[b] ?? 0));
    const h2 = h * h;
    const h4 = h2 * h2;
    return settings.deformation * h4 * h * (along * along + across * across) + settings.sliding * ICE_WEIGHT * h2;
  }

  function solve(count: number): void {
    for (let j = 1; j < count; j += 1) {
      const w = (lower[j] ?? 0) / (diag[j - 1] ?? 1);
      diag[j] = (diag[j] ?? 1) - w * (upper[j - 1] ?? 0);
      rhs[j] = (rhs[j] ?? 0) - w * (rhs[j - 1] ?? 0);
    }
    solution[count - 1] = (rhs[count - 1] ?? 0) / (diag[count - 1] ?? 1);
    for (let j = count - 2; j >= 0; j -= 1) solution[j] = ((rhs[j] ?? 0) - (upper[j] ?? 0) * (solution[j + 1] ?? 0)) / (diag[j] ?? 1);
  }

  // One backward-Euler sweep of the surface along a line; `faces[i]` is the face after cell i.
  function sweep(faces: Float64Array, factor: number, count: number, first: number, stride: number): void {
    for (let j = 0; j < count; j += 1) {
      const i = first + j * stride;
      rhs[j] = surface[i] ?? 0;
      if (base[i] === 1) {
        lower[j] = 0;
        diag[j] = 1;
        upper[j] = 0;
        continue;
      }
      const back = j > 0 ? factor * (faces[i - stride] ?? 0) : 0;
      const ahead = j < count - 1 ? factor * (faces[i] ?? 0) : 0;
      lower[j] = -back;
      upper[j] = -ahead;
      diag[j] = 1 + back + ahead;
    }
    solve(count);
    for (let j = 0; j < count; j += 1) surface[first + j * stride] = solution[j] ?? 0;
  }

  function balanceAt(i: number, settings: IceFlowSettings, balance: Float64Array | undefined): number {
    const given = balance?.[i];
    if (given !== undefined) return given;
    const rule = settings.balanceGradient * ((surface[i] ?? 0) - settings.ela);
    return rule < settings.maxAccumulation ? rule : settings.maxAccumulation;
  }

  return {
    sliding,
    relax(bed, ice, years, steps, settings, balance) {
      const dt = years / steps;
      const factor = dt / (dx * dx);
      let residual = 0;
      for (let step = 0; step < steps; step += 1) {
        start.set(ice);
        surfaceGradients(bed, ice);
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const i = row * cols + col;
            east[i] = col < cols - 1 ? faceDiffusivity(ice, i, i + 1, ((surface[i + 1] ?? 0) - (surface[i] ?? 0)) / dx, 0.5 * ((gradY[i] ?? 0) + (gradY[i + 1] ?? 0)), settings) : 0;
            south[i] = row < rows - 1 ? faceDiffusivity(ice, i, i + cols, ((surface[i + cols] ?? 0) - (surface[i] ?? 0)) / dx, 0.5 * ((gradX[i] ?? 0) + (gradX[i + cols] ?? 0)), settings) : 0;
          }
        }
        for (let i = 0; i < cells; i += 1) {
          const gained = base[i] === 1 ? 0 : (start[i] ?? 0) + balanceAt(i, settings, balance) * dt;
          surface[i] = (bed[i] ?? 0) + (gained > 0 ? gained : 0);
        }
        for (let row = 0; row < rows; row += 1) sweep(east, factor, cols, row * cols, 1);
        for (let col = 0; col < cols; col += 1) sweep(south, factor, rows, col, cols);
        for (let i = 0; i < cells; i += 1) {
          const h = base[i] === 1 ? 0 : (surface[i] ?? 0) - (bed[i] ?? 0);
          ice[i] = (1 - DAMPING) * (start[i] ?? 0) + DAMPING * (h > 0 ? h : 0);
        }
        residual = 0;
        for (let i = 0; i < cells; i += 1) {
          const change = (ice[i] ?? 0) - (start[i] ?? 0);
          const rate = (change < 0 ? -change : change) / dt;
          if (rate > residual) residual = rate;
        }
      }
      surfaceGradients(bed, ice);
      for (let i = 0; i < cells; i += 1) {
        const h = ice[i] ?? 0;
        const gx = gradX[i] ?? 0;
        const gy = gradY[i] ?? 0;
        driving[i] = h > 0 ? ICE_WEIGHT * h * Math.sqrt(gx * gx + gy * gy) : 0;
        const tau = driving[i] ?? 0;
        sliding[i] = settings.sliding * tau;
      }
      // Lateral drag: a column sliding faster than its neighbours hands part of its driving stress to
      // them, and bare rock beside the ice holds it back: u = C·(τ_d + k·Σ(u_j − u)), k = ηH/Δx²,
      // solved for u cell by cell, sweeping the grid in place.
      const drag = settings.lateralDrag;
      const c = settings.sliding;
      if (drag > 0 && c > 0) {
        for (let pass = 0; pass < DRAG_PASSES; pass += 1) {
          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const i = row * cols + col;
              const h = ice[i] ?? 0;
              if (h <= 0 || base[i] === 1) continue;
              let around = 0;
              if (col > 0) around += sliding[i - 1] ?? 0;
              if (col < cols - 1) around += sliding[i + 1] ?? 0;
              if (row > 0) around += sliding[i - cols] ?? 0;
              if (row < rows - 1) around += sliding[i + cols] ?? 0;
              const k = (drag * h) / (dx * dx);
              sliding[i] = (c * ((driving[i] ?? 0) + k * around)) / (1 + 4 * k * c);
            }
          }
        }
      }
      return residual;
    },
  };
}
