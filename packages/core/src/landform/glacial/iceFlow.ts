// @skill jgengine-world
/**
 * Valley glaciers by the shallow-ice approximation: ice thickness H over a bed b flows down its own
 * surface s = b + H by Glen's law (Glen 1955, n = 3) plus basal sliding u_b = C·τ_b³, with
 * τ_b = ρgH|∇s|, so the flux is q = −(Γ H⁵ + C (ρg)³ H⁴) |∇s|² ∇s, Γ = 2A(ρg)³/5. Ice gains and loses
 * mass by a balance that rises with altitude, b = min(β(s − ELA), b_max). Thickness steps
 * explicitly on the staggered grid of Mahaffy (1976), each sub-step limited by its stiffest edge.
 * Sliding is what erodes: the bed lowers at K_g·u_b (Harbor 1992; Braun, Zwartz & Tomkin 1999), which
 * widens a river's V into a U.
 *
 * @capability landform-glacial glaciers that flow, slide and carve U-shaped valleys and lay moraines
 */
import type { LandformTopology } from "../grid/landformGrid";

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
  /** Sliding coefficient C in m yr⁻¹ Pa⁻³. */
  sliding: number;
  /** Equilibrium line altitude in metres. */
  ela: number;
  /** Mass balance gradient β in (m/yr of ice) per metre of altitude. */
  balanceGradient: number;
  /** Largest accumulation in m/yr. */
  maxAccumulation: number;
}

/** A reusable ice solver for one grid. @internal */
export interface IceFlow {
  /** Sliding speed in m/yr at each cell centre after the last {@link IceFlow.advance}. */
  readonly sliding: Float64Array;
  /**
   * Advance `ice` (thickness in metres, in place) over `bed` for `years`, in at most `maxIterations`
   * sub-steps. `balance` (m/yr per cell) replaces the altitude rule when given. Returns the years advanced.
   */
  advance(bed: Float64Array, ice: Float64Array, years: number, settings: IceFlowSettings, maxIterations: number, balance?: Float64Array): number;
}

/** An ice solver for a topology. @internal */
// stateless: scratch flux arrays; the ice itself lives in the caller's array.
export function createIceFlow(topology: LandformTopology): IceFlow {
  const { cols, rows, cells, cellSize, base } = topology;
  const surface = new Float64Array(cells);
  const gradY = new Float64Array(cells);
  const gradX = new Float64Array(cells);
  const fluxX = new Float64Array(cells);
  const fluxY = new Float64Array(cells);
  const sliding = new Float64Array(cells);
  const dx = cellSize;
  const rhoG3 = ICE_WEIGHT * ICE_WEIGHT * ICE_WEIGHT;

  function gradients(): void {
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

  // Edge diffusivity D = (Γ H⁵ + C (ρg)³ H⁴) |∇s|²; flux = −D ∂s.
  function edgeDiffusivity(h: number, along: number, across: number, settings: IceFlowSettings): number {
    if (h <= 0) return 0;
    const h2 = h * h;
    const h4 = h2 * h2;
    const d = (settings.deformation * h4 * h + settings.sliding * rhoG3 * h4) * (along * along + across * across);
    return d;
  }

  return {
    sliding,
    advance(bed, ice, years, settings, maxIterations, balance) {
      let done = 0;
      for (let iteration = 0; iteration < maxIterations && done < years; iteration += 1) {
        for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (ice[i] ?? 0);
        gradients();
        let stiffest = 0;
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const i = row * cols + col;
            // Flux through the east face of i, then the south face.
            if (col < cols - 1) {
              const j = i + 1;
              const along = ((surface[j] ?? 0) - (surface[i] ?? 0)) / dx;
              const d = edgeDiffusivity(0.5 * ((ice[i] ?? 0) + (ice[j] ?? 0)), along, 0.5 * ((gradY[i] ?? 0) + (gradY[j] ?? 0)), settings);
              fluxX[i] = -d * along;
              if (d > stiffest) stiffest = d;
            } else fluxX[i] = 0;
            if (row < rows - 1) {
              const j = i + cols;
              const along = ((surface[j] ?? 0) - (surface[i] ?? 0)) / dx;
              const d = edgeDiffusivity(0.5 * ((ice[i] ?? 0) + (ice[j] ?? 0)), along, 0.5 * ((gradX[i] ?? 0) + (gradX[j] ?? 0)), settings);
              fluxY[i] = -d * along;
              if (d > stiffest) stiffest = d;
            } else fluxY[i] = 0;
          }
        }
        let dt = years - done;
        const stable = stiffest > 0 ? (0.2 * dx * dx) / stiffest : dt;
        if (stable < dt) dt = stable;
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const i = row * cols + col;
            if (base[i] === 1) {
              ice[i] = 0;
              continue;
            }
            const west = col > 0 ? (fluxX[i - 1] ?? 0) : 0;
            const north = row > 0 ? (fluxY[i - cols] ?? 0) : 0;
            const divergence = ((fluxX[i] ?? 0) - west + (fluxY[i] ?? 0) - north) / dx;
            let gain = balance?.[i];
            if (gain === undefined) {
              const rule = settings.balanceGradient * ((surface[i] ?? 0) - settings.ela);
              gain = rule < settings.maxAccumulation ? rule : settings.maxAccumulation;
            }
            const next = (ice[i] ?? 0) + dt * (gain - divergence);
            ice[i] = next > 0 ? next : 0;
          }
        }
        done += dt;
      }
      for (let i = 0; i < cells; i += 1) surface[i] = (bed[i] ?? 0) + (ice[i] ?? 0);
      gradients();
      for (let i = 0; i < cells; i += 1) {
        const h = ice[i] ?? 0;
        if (h <= 0) {
          sliding[i] = 0;
          continue;
        }
        const gx = gradX[i] ?? 0;
        const gy = gradY[i] ?? 0;
        const slope = Math.sqrt(gx * gx + gy * gy);
        const tau = ICE_WEIGHT * h * slope;
        sliding[i] = settings.sliding * tau * tau * tau;
      }
      return done;
    },
  };
}
