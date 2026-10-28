// @skill jgengine-world
/**
 * A glacier's flow over a landform grid, by one of two ice models:
 *
 * - `"first-order"`: the first-order Stokes velocity of {@link createFirstOrderIceFlow} (Blatter 1995;
 *   Pattyn 2003), which feels valley walls and bumps through the lateral and longitudinal stresses.
 *   The ice thickness relaxes by the implicit scheme of `iceFlow` with each face's flux scaled by
 *   the first-order flux over the shallow-ice flux on the same geometry, the cell's `fluxScale`; each
 *   step ends with one first-order solve that sets the sliding speed and the next `fluxScale`. At
 *   steady state the scaled flux is the first-order flux. The solve starts from the shallow-ice
 *   velocity profile times `fluxScale`, a function of the state alone, so a restored run repeats bit
 *   for bit.
 * - `"shallow-ice"`: the shallow-ice approximation alone, several times cheaper; neighbouring columns
 *   drag on each other's sliding through `lateralDrag`, a rough stand-in for the walls.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
import type { LandformTopology } from "../grid/landformGrid";
import { createFirstOrderIceFlow, type FirstOrderIceFlow } from "./firstOrderIceFlow";
import { createIceFlow, ICE_WEIGHT, type IceFlowSettings } from "./iceFlow";

/** Which ice model moves a glacier. */
export type GlacierModel = "first-order" | "shallow-ice";

/** How a glacier flows. @internal */
export interface GlacierFlowSettings extends IceFlowSettings {
  model: GlacierModel;
  /** Glen's rate factor A in Pa⁻³ a⁻¹ (the same A as `deformation`). */
  rateFactor: number;
  /** First-order layers per ice column. */
  layers: number;
}

/** A glacier solver for one grid. @internal */
export interface GlacierFlow {
  /** Sliding speed over the bed in m/yr per cell after the last {@link GlacierFlow.flow}. */
  readonly sliding: Float64Array;
  /**
   * Move `ice` (thickness in metres, in place) over `bed` for `years` in `steps` implicit steps and
   * set {@link GlacierFlow.sliding}. First-order flow reads and rewrites `fluxScale` (1 where unknown).
   */
  flow(bed: Float64Array, ice: Float64Array, fluxScale: Float64Array, years: number, steps: number, settings: GlacierFlowSettings): void;
}

const SCALE_MIN = 0.01;
const SCALE_MAX = 100;

/** A glacier solver for a topology. @internal */
// stateless: scratch arrays; the ice and its flux scale live in the caller's arrays.
export function createGlacierFlow(topology: LandformTopology): GlacierFlow {
  const { cols, rows, cells, cellSize } = topology;
  const shallow = createIceFlow(topology);
  const sliding = new Float64Array(cells);
  const gradX = new Float64Array(cells);
  const gradY = new Float64Array(cells);
  const meanX = new Float64Array(cells);
  const meanY = new Float64Array(cells);
  let firstOrder: FirstOrderIceFlow | undefined;
  let layers = 0;

  function surfaceGradients(bed: Float64Array, ice: Float64Array): void {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const east = col < cols - 1 ? i + 1 : i;
        const west = col > 0 ? i - 1 : i;
        const south = row < rows - 1 ? i + cols : i;
        const north = row > 0 ? i - cols : i;
        // Bare rock standing above this cell's ice counts as level with it, as in the solver's margins.
        const own = (bed[i] ?? 0) + (ice[i] ?? 0);
        const s = (j: number): number => {
          const top = (bed[j] ?? 0) + (ice[j] ?? 0);
          return (ice[j] ?? 0) <= 0 && top > own ? own : top;
        };
        gradX[i] = (s(east) - s(west)) / (cellSize * ((east === i ? 0 : 1) + (west === i ? 0 : 1)));
        gradY[i] = (s(south) - s(north)) / (cellSize * ((south === i ? 0 : 1) + (north === i ? 0 : 1)));
      }
    }
  }

  // Shallow-ice flux (Γ H⁵ |∇s|² + C ρg H²)|∇s| of cell i.
  function shallowFlux(i: number, h: number, settings: GlacierFlowSettings): number {
    const gx = gradX[i] ?? 0;
    const gy = gradY[i] ?? 0;
    const slope2 = gx * gx + gy * gy;
    const h2 = h * h;
    return (settings.deformation * h2 * h2 * h * slope2 + settings.sliding * ICE_WEIGHT * h2) * Math.sqrt(slope2);
  }

  // Start the solver from the shallow-ice velocity profile u(ζ) = u_b + (A/2)(ρg|∇s|)³H⁴(1 − (1 − ζ)⁴), times the flux scale.
  function guess(solver: FirstOrderIceFlow, ice: Float64Array, fluxScale: Float64Array, settings: GlacierFlowSettings): void {
    const { levels, u, v } = solver;
    const top = levels - 1;
    for (let i = 0; i < cells; i += 1) {
      const h = ice[i] ?? 0;
      const gx = gradX[i] ?? 0;
      const gy = gradY[i] ?? 0;
      const slope = Math.sqrt(gx * gx + gy * gy);
      const scale = fluxScale[i] ?? 1;
      const driving = ICE_WEIGHT * slope;
      const base = settings.sliding * driving * h;
      const shear = 0.5 * settings.rateFactor * driving * driving * driving * h * h * h * h;
      for (let k = 0; k < levels; k += 1) {
        const depth = 1 - k / top;
        const speed = h > 0 && slope > 0 ? scale * (base + shear * (1 - depth * depth * depth * depth)) : 0;
        u[i * levels + k] = slope > 0 ? (-speed * gx) / slope : 0;
        v[i * levels + k] = slope > 0 ? (-speed * gy) / slope : 0;
      }
    }
  }

  return {
    sliding,
    flow(bed, ice, fluxScale, years, steps, settings) {
      if (settings.model === "shallow-ice") {
        shallow.relax(bed, ice, years, steps, settings);
        sliding.set(shallow.sliding);
        return;
      }
      shallow.relax(bed, ice, years, steps, { ...settings, lateralDrag: 0, fluxScale });
      if (firstOrder === undefined || layers !== settings.layers) {
        firstOrder = createFirstOrderIceFlow({ cols, rows, dx: cellSize, layers: settings.layers });
        layers = settings.layers;
      }
      surfaceGradients(bed, ice);
      guess(firstOrder, ice, fluxScale, settings);
      firstOrder.solve(
        { bed, thickness: ice, friction: settings.sliding > 0 ? 1 / settings.sliding : Number.POSITIVE_INFINITY, rateFactor: settings.rateFactor },
        { tolerance: 1e-4, maxIterations: 30 },
      );
      firstOrder.slidingSpeed(bed, sliding);
      firstOrder.meanVelocity(meanX, meanY);
      for (let i = 0; i < cells; i += 1) {
        const h = ice[i] ?? 0;
        const flux = shallowFlux(i, h, settings);
        if (h <= 0 || !(flux > 1e-9)) {
          fluxScale[i] = 1;
          continue;
        }
        const ux = meanX[i] ?? 0;
        const uy = meanY[i] ?? 0;
        const ratio = (h * Math.sqrt(ux * ux + uy * uy)) / flux;
        fluxScale[i] = ratio < SCALE_MIN ? SCALE_MIN : ratio > SCALE_MAX ? SCALE_MAX : ratio;
      }
    },
  };
}
