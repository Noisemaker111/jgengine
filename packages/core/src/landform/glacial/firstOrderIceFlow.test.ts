import { describe, expect, test } from "bun:test";
import { fitPowerLaw } from "../validation/geomorphicLaws";
import { createFirstOrderIceFlow } from "./firstOrderIceFlow";
import { ICE_WEIGHT } from "./iceFlow";

// ISMIP-HOM (Pattyn et al. 2008, The Cryosphere 2, 95–108, CC BY 3.0): ice 1000 m thick on an
// inclined plane, A = 10⁻¹⁶ Pa⁻³ a⁻¹, periodic over L. A: bumps 500 sin ωx sin ωy, frozen bed, α = 0.5°.
// B: ripples 500 sin ωx. C: flat bed, α = 0.1°, β² = 1000 + 1000 sin ωx sin ωy. D: β² = 1000 + 1000 sin ωx.
// Published non-full-Stokes (first-order) ensemble, mean and standard deviation, of the largest
// (Table 4) and mean (Table 5) surface velocity along y = L/4, in m/a, for L = 5, 10, 20, 40, 80, 160 km.
type Ensemble = readonly (readonly [number, number])[];
const PUBLISHED: Record<"a" | "b" | "c" | "d", { max: Ensemble; mean: Ensemble; fullStokesMax: readonly number[] }> = {
  a: {
    max: [[15.33, 1.76], [26.04, 4.26], [41.03, 3.92], [64.73, 4.83], [88.33, 5.15], [104.77, 4.99]],
    mean: [[14.61, 1.79], [20.62, 3.23], [24.93, 2.2], [31.99, 2.07], [37.54, 1.58], [40.36, 1.07]],
    fullStokesMax: [14.56, 24.36, 39.73, 63.89, 87.1, 102.63],
  },
  b: {
    max: [[10.87, 1.4], [23.51, 4.29], [47.85, 4.14], [74.88, 5.13], [96.43, 5.76], [109.36, 4.52]],
    mean: [[10.54, 1.36], [18.24, 2.67], [27.8, 2.08], [35.55, 1.86], [39.76, 1.38], [41.38, 0.76]],
    fullStokesMax: [11.76, 22.82, 46.91, 73.77, 95.12, 108.33],
  },
  c: {
    max: [[12.14, 5.23], [15.39, 1.5], [18.31, 1.02], [28.48, 1.77], [60.99, 6.05], [141.38, 22.4]],
    mean: [[12.12, 5.22], [15.19, 1.46], [16.36, 0.94], [19.25, 0.95], [27.24, 1.44], [40.83, 3.79]],
    fullStokesMax: [16.0, 16.53, 19.05, 29.32, 60.15, 143.75],
  },
  d: {
    max: [[12.86, 4.88], [16.55, 1.08], [21.48, 2.14], [41.3, 4.29], [103.77, 28.82], [244.97, 31.18]],
    mean: [[12.85, 4.88], [16.28, 0.97], [18.33, 1.13], [24.2, 1.09], [38.46, 6.48], [58.3, 4.86]],
    fullStokesMax: [16.48, 17.11, 21.33, 41.51, 97.64, 238.44],
  },
};
const LENGTHS = [5, 10, 20, 40, 80, 160];

function ismipHom(experiment: "a" | "b" | "c" | "d", km: number, nodes: number): { max: number; mean: number } {
  const length = km * 1000;
  const threeD = experiment === "a" || experiment === "c";
  const cols = nodes;
  const rows = threeD ? nodes : 1;
  const dx = length / cols;
  const slope = Math.tan(((experiment === "a" || experiment === "b" ? 0.5 : 0.1) * Math.PI) / 180);
  const flow = createFirstOrderIceFlow({ cols, rows, dx, layers: 10, periodicX: true, periodicY: true });
  const bed = new Float64Array(cols * rows);
  const thickness = new Float64Array(cols * rows);
  const friction = new Float64Array(cols * rows);
  const w = (2 * Math.PI) / length;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = i * dx;
      const y = threeD ? j * dx : length / 4;
      const surface = -x * slope;
      const bump = experiment === "a" ? 500 * Math.sin(w * x) * Math.sin(w * y) : experiment === "b" ? 500 * Math.sin(w * x) : 0;
      bed[j * cols + i] = surface - 1000 + bump;
      thickness[j * cols + i] = 1000 - bump;
      friction[j * cols + i] = experiment === "c" ? 1000 + 1000 * Math.sin(w * x) * Math.sin(w * y) : experiment === "d" ? 1000 + 1000 * Math.sin(w * x) : Number.POSITIVE_INFINITY;
    }
  }
  const report = flow.solve({ bed, thickness, friction, rateFactor: 1e-16, dropX: -length * slope });
  expect(report.converged).toBe(true);
  const row = threeD ? rows / 4 : 0;
  let max = 0;
  let mean = 0;
  for (let i = 0; i < cols; i += 1) {
    const speed = flow.u[(row * cols + i) * flow.levels + flow.levels - 1] ?? 0;
    max = Math.max(max, speed);
    mean += speed / cols;
  }
  return { max, mean };
}

describe("first-order (Blatter–Pattyn) ice flow against ISMIP-HOM", () => {
  for (const [experiment, nodes, lengths] of [
    ["b", 40, LENGTHS],
    ["d", 40, LENGTHS],
    ["a", 20, [5, 40, 160]],
    ["c", 20, [5, 40, 160]],
  ] as const) {
    test(`experiment ${experiment.toUpperCase()}: surface speed falls within the published first-order ensemble at every length`, () => {
      const published = PUBLISHED[experiment];
      for (const km of lengths) {
        const k = LENGTHS.indexOf(km);
        const { max, mean } = ismipHom(experiment, km, nodes);
        const [maxMean, maxSpread] = published.max[k] ?? [0, 0];
        const [meanMean, meanSpread] = published.mean[k] ?? [0, 0];
        expect(Math.abs(max - maxMean)).toBeLessThanOrEqual(maxSpread);
        expect(Math.abs(mean - meanMean)).toBeLessThanOrEqual(meanSpread);
        // Where the first-order approximation holds (bumps 20 km and longer, frozen bed), it also meets full Stokes.
        if ((experiment === "a" || experiment === "b") && km >= 20) expect(Math.abs(max / (published.fullStokesMax[k] ?? 1) - 1)).toBeLessThan(0.03);
      }
    }, 60_000);
  }

  test("ice at rest stays at rest, and a flat slab's speed matches the analytic shear flow", () => {
    // A slab of thickness H on slope α, frozen bed: u_s = (A/2)(ρg sin α)³ H⁴ for Glen's n = 3 (the shallow-ice answer is exact here).
    const flow = createFirstOrderIceFlow({ cols: 4, rows: 1, dx: 1000, layers: 20, periodicX: true, periodicY: true });
    const slope = Math.tan((0.5 * Math.PI) / 180);
    const bed = Float64Array.from([0, -1000 * slope, -2000 * slope, -3000 * slope]);
    const thickness = new Float64Array(4).fill(1000);
    flow.solve({ bed, thickness, rateFactor: 1e-16, dropX: -4000 * slope }, { tolerance: 1e-8 });
    const exact = 0.5 * 1e-16 * (ICE_WEIGHT * Math.sin(Math.atan(slope))) ** 3 * 1000 ** 4;
    // The model's slope is tan α and its driving stress ρgH tan α: the first-order equations drop the cos α.
    const firstOrder = 0.5 * 1e-16 * (ICE_WEIGHT * slope) ** 3 * 1000 ** 4;
    expect(Math.abs((flow.surfaceSpeed()[0] ?? 0) / firstOrder - 1)).toBeLessThan(0.005);
    expect(Math.abs(firstOrder / exact - 1)).toBeLessThan(2e-4);
    const still = createFirstOrderIceFlow({ cols: 3, rows: 3, dx: 100, layers: 4 });
    still.solve({ bed: new Float64Array(9), thickness: new Float64Array(9).fill(100), rateFactor: 1e-16 });
    expect(still.surfaceSpeed().every((speed) => speed === 0)).toBe(true);
  });
});

// Harbor's (1992) experiment in the form of Seddik, Greve, Sugiyama & Naruse (2009): a V-shaped valley
// filled with 480 m of ice, 1200 m wide at the surface, sloping 4° down-valley, uniform along it.
// Sliding u_b = c·τ_b, erosion E = 10⁻⁴ u_b² normal to the bed, 1 kyr steps, the ice's cross-section
// area held fixed. Seddik et al. report the power-law exponent of the cross-section rising from 1 to
// about 1.1 (c = 10 m a⁻¹ MPa⁻¹) up to 2.05 (c = 50) after 50 kyr, with sliding of 6–7 m/a at c = 50,
// and form ratios (depth over top width) of 0.40–0.53.
const HALF_WIDTH = 600;
const DEPTH = 480;
const DOMAIN = 1000;
const DY = 40;
const ROWS = (2 * DOMAIN) / DY + 1;

interface SectionRun {
  exponents: number[];
  /** Depth over top width of the valley, D/W, the form ratio of Seddik et al. */
  formRatio: number;
  centre: number[];
  fastest: number[];
}

function exponentOf(bed: Float64Array): number {
  let floor = 0;
  for (let j = 0; j < ROWS; j += 1) if ((bed[j] ?? 0) < (bed[floor] ?? 0)) floor = j;
  const walls: number[] = [];
  for (const side of [-1, 1]) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let j = floor + side; j >= 0 && j < ROWS && Math.abs(-DOMAIN + j * DY) <= HALF_WIDTH; j += side) {
      xs.push(Math.abs(j - floor) * DY);
      ys.push((bed[j] ?? 0) - (bed[floor] ?? 0));
    }
    walls.push(fitPowerLaw(xs, ys).exponent);
  }
  return ((walls[0] ?? 0) + (walls[1] ?? 0)) / 2;
}

function carveSection(slidingPerMPa: number, model: "first-order" | "shallow-ice"): SectionRun {
  const c = slidingPerMPa * 1e-6;
  const slope = Math.tan((4 * Math.PI) / 180);
  const flow = createFirstOrderIceFlow({ cols: 1, rows: ROWS, dx: 100, dy: DY, layers: 10, periodicX: true });
  const bed = new Float64Array(ROWS);
  for (let j = 0; j < ROWS; j += 1) bed[j] = (DEPTH * Math.abs(-DOMAIN + j * DY)) / HALF_WIDTH;
  const thickness = new Float64Array(ROWS);
  const sliding = new Float64Array(ROWS);
  const area = (surface: number): number => bed.reduce((sum, b) => sum + Math.max(surface - b, 0) * DY, 0);
  const iceArea = area(DEPTH);
  const run: SectionRun = { exponents: [], formRatio: 0, centre: [], fastest: [] };
  for (let kyr = 0; ; kyr += 1) {
    let lo = Math.min(...bed);
    let hi = lo + 2 * DEPTH;
    for (let k = 0; k < 60; k += 1) {
      const mid = 0.5 * (lo + hi);
      if (area(mid) > iceArea) hi = mid;
      else lo = mid;
    }
    for (let j = 0; j < ROWS; j += 1) thickness[j] = Math.max(lo - (bed[j] ?? 0), 0);
    if (model === "first-order") {
      expect(flow.solve({ bed, thickness, friction: 1 / c, rateFactor: 2.14e-16, dropX: -100 * slope }, { tolerance: 1e-4 }).converged).toBe(true);
      flow.slidingSpeed(bed, sliding);
    } else {
      // Shallow ice: τ_b = ρgH sin α, so sliding follows the ice thickness.
      for (let j = 0; j < ROWS; j += 1) sliding[j] = c * ICE_WEIGHT * (thickness[j] ?? 0) * Math.sin(Math.atan(slope));
    }
    if (kyr % 10 === 0) {
      run.exponents.push(exponentOf(bed));
      run.centre.push(sliding[(ROWS - 1) / 2] ?? 0);
      run.fastest.push(Math.max(...sliding));
    }
    if (kyr === 50) {
      run.formRatio = (DEPTH - Math.min(...bed)) / (2 * HALF_WIDTH);
      return run;
    }
    const next = Float64Array.from(bed);
    for (let j = 1; j < ROWS - 1; j += 1) {
      if ((thickness[j] ?? 0) <= 0) continue;
      const u = sliding[j] ?? 0;
      const fall = ((bed[j] ?? 0) - (bed[j - 1] ?? 0)) / DY;
      const rise = ((bed[j + 1] ?? 0) - (bed[j] ?? 0)) / DY;
      const g = Math.max(Math.max(fall, 0), -Math.min(rise, 0));
      next[j] = (bed[j] ?? 0) - 1000 * 1e-4 * u * u * Math.sqrt(1 + g * g);
    }
    bed.set(next);
  }
}

describe("first-order ice carves a V into a U (Harbor 1992; Seddik et al. 2009)", () => {
  test("walls drag on the ice, so the V's axis slides slowest, and over 50 kyr the cross-section's exponent rises from 1 to about 2", () => {
    const run = carveSection(50, "first-order");
    // The tight bottom of the V holds the ice back: a central minimum of sliding, the corner effect.
    expect((run.centre[0] ?? 0) / (run.fastest[0] ?? 1)).toBeLessThan(0.4);
    expect(run.fastest[0] ?? 0).toBeGreaterThan(6);
    expect(run.fastest[0] ?? 0).toBeLessThan(8);
    for (let k = 1; k < run.exponents.length; k += 1) expect(run.exponents[k] ?? 0).toBeGreaterThan(run.exponents[k - 1] ?? 0);
    expect(run.exponents[0] ?? 0).toBeCloseTo(1, 6);
    // Seddik et al.: 2.05 after 50 kyr, sliding 6–7 m/a, the central minimum all but gone.
    expect(Math.abs((run.exponents[5] ?? 0) - 2.05)).toBeLessThan(0.15);
    expect(run.centre[5] ?? 0).toBeGreaterThan(6);
    expect((run.centre[5] ?? 0) / (run.fastest[5] ?? 1)).toBeGreaterThan(0.95);
    expect(Math.abs(run.formRatio - 0.53)).toBeLessThan(0.05);
  }, 60_000);

  test("slower sliding carves less: at c = 10 m a⁻¹ MPa⁻¹ the valley is still nearly a V after 50 kyr", () => {
    const exponent = carveSection(10, "first-order").exponents[5] ?? 0;
    expect(exponent).toBeGreaterThan(1.02);
    expect(exponent).toBeLessThan(1.25);
  }, 60_000);

  test("shallow ice, blind to the walls, slides fastest on the axis and saws a slot instead of a U", () => {
    const run = carveSection(50, "shallow-ice");
    for (let k = 0; k < run.centre.length; k += 1) expect(run.centre[k]).toBe(run.fastest[k]);
    // Deeper than it is wide: a slot canyon, which a power law alone would misread as steep U walls.
    expect(run.formRatio).toBeGreaterThan(1.5);
  });
});
