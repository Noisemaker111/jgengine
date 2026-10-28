// @skill jgengine-world
/**
 * A glacier's flow over a landform grid, by one of two ice models:
 *
 * - `"first-order"`: the first-order Stokes velocity of {@link createFirstOrderIceFlow} (Blatter 1995;
 *   Pattyn 2003), which feels valley walls and bumps through the lateral and longitudinal stresses.
 *   The thickness evolves by the implicit mass balance of `iceFlow`, each face's flux scaled so that
 *   on the last solve's geometry it equals the first-order flux through that face: the depth-mean
 *   first-order velocity on the face times the face's ice thickness. Each call ends with one
 *   first-order solve that sets the sliding speed and the next face scales. Because every face is
 *   matched on its own, neighbouring faces cannot disagree, and a settled glacier carries exactly
 *   the first-order flux. The solve starts from the shallow-ice velocity profile times the mean of a
 *   cell's face scales, a function of the state alone, so a restored run repeats bit for bit.
 * - `"shallow-ice"`: the shallow-ice approximation alone, several times cheaper; neighbouring columns
 *   drag on each other's sliding through `lateralDrag`, a rough stand-in for the walls.
 *
 * @capability landform-glacial glaciers that flow, slide, carve their valleys wider and deeper and lay moraines
 */
import type { LandformTopology } from "../grid/landformGrid";
import { createFirstOrderIceFlow, type FirstOrderIceFlow } from "./firstOrderIceFlow";
import { createIceFlow, ICE_WEIGHT, type IceAdvanceReport, type IceFlowSettings } from "./iceFlow";

/** Which ice model moves a glacier. */
export type GlacierModel = "first-order" | "shallow-ice";

/** How a glacier flows. @internal */
export interface GlacierFlowSettings extends IceFlowSettings {
  model: GlacierModel;
  /** Glen's rate factor A in Pa⁻³ a⁻¹ (the same A as `deformation`). */
  rateFactor: number;
  /** First-order layers per ice column. */
  layers: number;
  /** Longest implicit ice step in years. */
  maxStep: number;
}

/** A glacier solver for one grid. @internal */
export interface GlacierFlow {
  /** Sliding speed over the bed in m/yr per cell after the last {@link GlacierFlow.flow}. */
  readonly sliding: Float64Array;
  /**
   * Move `ice` (thickness in metres, in place) over `bed` for `years` and set {@link GlacierFlow.sliding}.
   * First-order flow reads and rewrites the face flux scales `eastScale` and `southScale` (1 where unknown).
   */
  flow(bed: Float64Array, ice: Float64Array, eastScale: Float64Array, southScale: Float64Array, years: number, settings: GlacierFlowSettings): IceAdvanceReport;
}

/** A glacier solver for a topology. @internal */
// stateless: scratch arrays; the ice and its face scales live in the caller's arrays.
export function createGlacierFlow(topology: LandformTopology): GlacierFlow {
  const { cols, rows, cells, cellSize } = topology;
  const shallow = createIceFlow(topology);
  const sliding = new Float64Array(cells);
  const gradX = new Float64Array(cells);
  const gradY = new Float64Array(cells);
  const meanX = new Float64Array(cells);
  const meanY = new Float64Array(cells);
  const friction = new Float64Array(cells);
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

  // Mean flux scale of the faces around cell i.
  function cellScale(i: number, eastScale: Float64Array, southScale: Float64Array): number {
    const col = i % cols;
    let sum = 0;
    let count = 0;
    if (col < cols - 1) {
      sum += eastScale[i] ?? 1;
      count += 1;
    }
    if (col > 0) {
      sum += eastScale[i - 1] ?? 1;
      count += 1;
    }
    if (i + cols < cells) {
      sum += southScale[i] ?? 1;
      count += 1;
    }
    if (i >= cols) {
      sum += southScale[i - cols] ?? 1;
      count += 1;
    }
    return count > 0 ? sum / count : 1;
  }

  // Start the solver from the shallow-ice velocity profile u(ζ) = u_b + (A/2)(ρg|∇s|)³H⁴(1 − (1 − ζ)⁴), times the cell's scale.
  function guess(solver: FirstOrderIceFlow, ice: Float64Array, eastScale: Float64Array, southScale: Float64Array, settings: GlacierFlowSettings): void {
    const { levels, u, v } = solver;
    const top = levels - 1;
    for (let i = 0; i < cells; i += 1) {
      const h = ice[i] ?? 0;
      const gx = gradX[i] ?? 0;
      const gy = gradY[i] ?? 0;
      const slope = Math.sqrt(gx * gx + gy * gy);
      const scale = cellScale(i, eastScale, southScale);
      const driving = ICE_WEIGHT * slope;
      const base = settings.sliding * (settings.temperate?.[i] ?? 1) * driving * h;
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
    flow(bed, ice, eastScale, southScale, years, settings) {
      if (settings.model === "shallow-ice") {
        const report = shallow.advance(bed, ice, years, settings, { maxStep: settings.maxStep });
        sliding.set(shallow.sliding);
        return report;
      }
      const report = shallow.advance(bed, ice, years, { ...settings, lateralDrag: 0, eastScale, southScale }, { maxStep: settings.maxStep });
      if (firstOrder === undefined || layers !== settings.layers) {
        firstOrder = createFirstOrderIceFlow({ cols, rows, dx: cellSize, layers: settings.layers });
        layers = settings.layers;
      }
      surfaceGradients(bed, ice);
      guess(firstOrder, ice, eastScale, southScale, settings);
      for (let i = 0; i < cells; i += 1) {
        const c = settings.sliding * (settings.temperate?.[i] ?? 1);
        friction[i] = c > 0 ? 1 / c : Number.POSITIVE_INFINITY;
      }
      firstOrder.solve(
        { bed, thickness: ice, friction, rateFactor: settings.rateFactor },
        { tolerance: 1e-4, maxIterations: 30 },
      );
      firstOrder.slidingSpeed(bed, sliding);
      firstOrder.meanVelocity(meanX, meanY);
      shallow.matchFaces(bed, ice, settings, meanX, meanY, eastScale, southScale);
      return report;
    },
  };
}
