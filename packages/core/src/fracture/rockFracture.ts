// @skill jgengine-world
/**
 * Break a rock by impact into convex fragments a game can simulate and draw. Whether it breaks follows
 * Vogel & Peukert (2003); how fine it breaks follows the JKMRC t10 law; fragment sizes follow the
 * Gaudin–Schuhmann distribution through that t10; the pieces are cells of a power diagram clipped to the
 * rock, small ones crowded near the impact point; and a few percent of the impact energy flies off as
 * fragment kinetic energy, faster for smaller pieces (Nakamura & Fujiwara 1991).
 *
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */

import type { SeededRng } from "../random/rng";
import { cellContains, cellVolume, clipCell, transformCell, type CellVec, type ConvexCell } from "./convexCell";
import { KWH_PER_TONNE, breakageProbability, jkT10 } from "./fragmentSize";
import { lerp } from "../math/scalar";

/** How a rock breaks by impact. */
export interface RockBreakage {
  id: string;
  /** Bulk density, kg/m³. */
  density: number;
  /** JKMRC t10 law: maximum t10, percent. */
  a: number;
  /** JKMRC t10 law: rate, t/kWh. */
  b: number;
  /** Vogel–Peukert material constant f_Mat, kg/(J m). */
  fMat: number;
  /** Vogel–Peukert x·W_m,min, J m/kg: the threshold specific energy of a particle `x` m across is this over x. */
  thresholdSizeEnergy: number;
}

/**
 * Granite. A and b sit inside the range of published drop-weight results for hard ores (A 45–100, b 0.4–3.3,
 * A×b 27–160), at A×b 42; the four presets keep the order the bonded-particle reference breaks the rocks in
 * (`scripts/reference/physics/bondedRock.ts`). f_Mat and x·W_min put a 50 mm piece at about one chance in four of
 * breaking at 10 J/kg, and grow easier with size as Vogel & Peukert (2003) found.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const GRANITE_BREAKAGE: RockBreakage = { id: "granite", density: 2650, a: 60, b: 0.7, fMat: 0.6, thresholdSizeEnergy: 0.04 };

/**
 * Berea sandstone: soft, A×b 120.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const SANDSTONE_BREAKAGE: RockBreakage = { id: "sandstone", density: 2100, a: 75, b: 1.6, fMat: 2.2, thresholdSizeEnergy: 0.01 };

/**
 * Indiana limestone: medium, A×b 60.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const LIMESTONE_BREAKAGE: RockBreakage = { id: "limestone", density: 2300, a: 65, b: 0.92, fMat: 1.0, thresholdSizeEnergy: 0.025 };

/**
 * Basalt: very hard, A×b 30.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const BASALT_BREAKAGE: RockBreakage = { id: "basalt", density: 2900, a: 55, b: 0.55, fMat: 0.4, thresholdSizeEnergy: 0.06 };

/**
 * The four rock breakage presets.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export const ROCK_BREAKAGE: readonly RockBreakage[] = [GRANITE_BREAKAGE, SANDSTONE_BREAKAGE, LIMESTONE_BREAKAGE, BASALT_BREAKAGE];

/** One piece of a broken rock. Its cell is in world space; `centre` is its centroid. */
export interface RockFragment {
  cell: ConvexCell;
  centre: [number, number, number];
  volume: number;
  mass: number;
  /** Equivalent sphere diameter, m. */
  size: number;
  velocity: [number, number, number];
}

/** What {@link fractureRock} did. */
export interface FractureResult {
  broken: boolean;
  /** Chance it had to break, 0..1. */
  probability: number;
  /** Specific impact energy, J/kg. */
  specificEnergy: number;
  /** t10 the law predicts, percent. */
  t10: number;
  fragments: RockFragment[];
  /** Mass below the smallest meshed fragment, kg: dust a game may draw as particles or a granular deposit. */
  finesMass: number;
}

/** Options of {@link fractureRock}. */
export interface FractureOptions {
  material: RockBreakage;
  /** Impact energy delivered, J. */
  energy: number;
  /** Where the blow lands, on or in the rock. */
  impactPoint: CellVec;
  rng: SeededRng;
  /** Velocity of the rock before the blow, m/s. */
  velocity?: CellVec;
  /** Most meshed fragments. Default 32. */
  maxFragments?: number;
  /** Share of the impact energy carried off by the fragments. Default 0.03 (Fujiwara & Tsukamoto 1980 measured 0.5–5%). */
  kineticFraction?: number;
  /** Break even when the probability draw says no (an editor preview). */
  force?: boolean;
}

const SIZE_BINS = 24;
const WEIGHT_PASSES = 8;

/**
 * Break `rock` (a convex cell, world space) with an impact of `energy` J at `impactPoint`.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fractureRock(rock: ConvexCell, options: FractureOptions): FractureResult {
  const { material, rng } = options;
  const { volume, centroid } = cellVolume(rock);
  const mass = volume * material.density;
  const size = Math.cbrt((6 * volume) / Math.PI);
  const specificEnergy = mass > 0 ? options.energy / mass : 0;
  const probability = breakageProbability(specificEnergy, size, material.fMat, material.thresholdSizeEnergy / size);
  const t10 = jkT10(specificEnergy / KWH_PER_TONNE, material.a, material.b);
  const velocity = options.velocity ?? [0, 0, 0];
  const whole: RockFragment = { cell: rock, centre: centroid, volume, mass, size, velocity: [velocity[0], velocity[1], velocity[2]] };
  const broken = options.force === true || rng() < probability;
  if (!broken || mass <= 0) return { broken: false, probability, specificEnergy, t10, fragments: [whole], finesMass: 0 };

  const sizes = fragmentSizes(size, Math.max(t10, 0.5), options.maxFragments ?? 32, rng);
  const fines = Math.min(sizes.fines, 0.95);
  const meshedVolume = sizes.sizes.reduce((sum, x) => sum + (Math.PI / 6) * x ** 3, 0);
  if (sizes.sizes.length < 2) return { broken: false, probability, specificEnergy, t10, fragments: [whole], finesMass: 0 };

  // Seeds: draw a point in the rock, then pull it toward the impact, more for smaller fragments.
  const largest = Math.max(...sizes.sizes);
  const bounds = convexCellBounds(rock);
  const seeds: [number, number, number][] = [];
  const impact = options.impactPoint;
  for (const x of sizes.sizes) {
    let point: CellVec = centroid;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const p: CellVec = [lerp(bounds.min[0], bounds.max[0], rng()), lerp(bounds.min[1], bounds.max[1], rng()), lerp(bounds.min[2], bounds.max[2], rng())];
      if (cellContains(rock, p)) {
        point = p;
        break;
      }
    }
    const pull = 0.2 + 0.8 * Math.sqrt(x / largest);
    seeds.push([impact[0] + (point[0] - impact[0]) * pull, impact[1] + (point[1] - impact[1]) * pull, impact[2] + (point[2] - impact[2]) * pull]);
  }
  // Power diagram: |x − p_i|² − w_i ≤ |x − p_j|² − w_j, weights from the target sizes.
  // Cells share the rock in proportion to the target volumes; a few weight updates bring each cell to its share.
  const targets = sizes.sizes.map((x) => ((Math.PI / 6) * x ** 3 * volume) / meshedVolume);
  const weights = sizes.sizes.map((x) => (x / 2) ** 2);
  let cells = powerCells(rock, seeds, weights);
  let best = cells;
  let bestError = Infinity;
  for (let pass = 0; pass <= WEIGHT_PASSES; pass += 1) {
    let error = 0;
    for (const [i, cell] of cells.entries()) {
      const have = cellVolume(cell).volume;
      const want = targets[i] ?? 0;
      error += Math.abs(have - want);
      // Move the weight by half the gap between the squared radii of the wanted and the present volume.
      weights[i] = (weights[i] ?? 0) + 0.5 * (Math.cbrt((3 * want) / (4 * Math.PI)) ** 2 - Math.cbrt((3 * Math.max(have, 0)) / (4 * Math.PI)) ** 2);
    }
    if (error < bestError) {
      bestError = error;
      best = cells;
    }
    if (pass < WEIGHT_PASSES) cells = powerCells(rock, seeds, weights);
  }
  cells = best;
  const shrink = Math.cbrt(1 - fines);
  const fragments: RockFragment[] = [];
  for (const cell of cells) {
    const measured = cellVolume(cell);
    if (measured.volume <= 0) continue;
    const shrunk = transformCell(cell, measured.centroid, shrink);
    const v = measured.volume * shrink ** 3;
    fragments.push({ cell: shrunk, centre: measured.centroid, volume: v, mass: v * material.density, size: Math.cbrt((6 * v) / Math.PI), velocity: [velocity[0], velocity[1], velocity[2]] });
  }
  burst(fragments, impact, (options.kineticFraction ?? 0.03) * options.energy);
  const meshedMass = fragments.reduce((sum, f) => sum + f.mass, 0);
  return { broken: true, probability, specificEnergy, t10, fragments, finesMass: Math.max(0, mass - meshedMass) };
}

/**
 * Fragment sizes for a parent `size` m across breaking to `t10` percent: the Gaudin–Schuhmann distribution
 * P(x) = (x/size)^m with m = −log₁₀(t10/100), so P(size/10) = t10, binned logarithmically and each bin rounded at random
 * to whole fragments. Bins past `maxFragments` fold into the fines.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function fragmentSizes(size: number, t10: number, maxFragments: number, rng: SeededRng): { sizes: number[]; exponent: number; fines: number } {
  const passing = Math.min(Math.max(t10 / 100, 1e-4), 0.95);
  const exponent = -Math.log10(passing);
  const cdf = (x: number): number => Math.min(1, (x / size) ** exponent);
  const parent = (Math.PI / 6) * size ** 3;
  const sizes: number[] = [];
  let carried = 0;
  let lowest = size;
  for (let k = 0; k < SIZE_BINS && sizes.length < maxFragments; k += 1) {
    const hi = size * 2 ** (-k / 2);
    const lo = size * 2 ** (-(k + 1) / 2);
    const x = Math.sqrt(hi * lo);
    const each = (Math.PI / 6) * x ** 3;
    // Round each bin at random and pass the volume it gained or lost to the next, finer bin.
    const exact = Math.max(0, ((cdf(hi) - cdf(lo)) * parent + carried) / each);
    const count = Math.floor(exact + rng());
    carried = (exact - count) * each;
    for (let n = 0; n < count && sizes.length < maxFragments; n += 1) sizes.push(x);
    lowest = lo;
  }
  return { sizes, exponent, fines: cdf(lowest) };
}

function powerCells(rock: ConvexCell, seeds: readonly CellVec[], weights: readonly number[]): ConvexCell[] {
  return seeds.map((p, i) => {
    let cell = rock;
    for (const [j, q] of seeds.entries()) {
      if (j === i) continue;
      const normal: CellVec = [2 * (q[0] - p[0]), 2 * (q[1] - p[1]), 2 * (q[2] - p[2])];
      const offset = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] - (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - (weights[j] ?? 0) + (weights[i] ?? 0);
      cell = clipCell(cell, { normal, offset });
      if (cell.faces.length === 0) break;
    }
    return cell;
  });
}

/** Add an outward burst carrying `energy` J, speed ∝ m^(−1/6). */
function burst(fragments: RockFragment[], origin: CellVec, energy: number): void {
  let sum = 0;
  for (const f of fragments) sum += 0.5 * f.mass * f.mass ** (-1 / 3);
  if (sum <= 0 || energy <= 0) return;
  const k = Math.sqrt(energy / sum);
  for (const f of fragments) {
    let dx = f.centre[0] - origin[0];
    let dy = f.centre[1] - origin[1];
    let dz = f.centre[2] - origin[2];
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-9) {
      dx = 0;
      dy = 1;
      dz = 0;
    } else {
      dx /= length;
      dy /= length;
      dz /= length;
    }
    const speed = k * f.mass ** (-1 / 6);
    f.velocity[0] += dx * speed;
    f.velocity[1] += dy * speed;
    f.velocity[2] += dz * speed;
  }
}

/**
 * Axis-aligned bounds of a cell.
 * @capability rock-fracture rock that breaks by impact into fragments sized by measured comminution laws
 */
export function convexCellBounds(cell: ConvexCell): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const face of cell.faces) {
    for (const p of face.vertices) {
      for (let k = 0; k < 3; k += 1) {
        const value = p[k] ?? 0;
        if (value < (min[k] ?? 0)) min[k] = value;
        if (value > (max[k] ?? 0)) max[k] = value;
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}
