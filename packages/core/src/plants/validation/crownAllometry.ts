import { plantPow } from "../growth/plantMath";
import { CROWN_HULL_BINS, CROWN_HULL_SECTORS, type PlantStructure } from "../structure/plantStructure";

const INCH_CM = 2.54;
const FOOT_M = 0.3048;
/** Hopkins bioclimatic index of northern Wisconsin, the region the Carmean curves are for. */
const HOPKINS_INDEX_NORTHERN_WISCONSIN = 37.7;

/**
 * Published crown width of one species from its trunk: Ek 1974 for open-grown trees and Bechtold
 * 2003 for forest-grown ones, both in feet from DBH in inches, as coded in the Forest Vegetation
 * Simulator's Lake States `cwcalc.f` (US public domain).
 */
export interface CrownWidthEquations {
  speciesId: string;
  /** Ek 1974 open-grown CW = a + b·D^c, used from 3 in DBH. */
  open: { a: number; b: number; c: number };
  /** Bechtold 2003 forest-grown CW = a + b·D + cr·CR% + hi·HI, used from 5 in DBH. */
  forest: { a: number; b: number; cr: number; hi: number };
}

/** FVS `cwcalc.f` species 318, sugar maple. */
export const SUGAR_MAPLE_CROWN_WIDTH: CrownWidthEquations = {
  speciesId: "acer-saccharum",
  open: { a: 0.868, b: 4.15, c: 0.7514 },
  forest: { a: 4.9399, b: 1.0727, cr: 0.1096, hi: -0.0493 },
};

/** FVS `cwcalc.f` species 129, eastern white pine. */
export const EASTERN_WHITE_PINE_CROWN_WIDTH: CrownWidthEquations = {
  speciesId: "pinus-strobus",
  open: { a: 1.62, b: 3.197, c: 0.7981 },
  forest: { a: 0.3914, b: 0.9923, cr: 0.108, hi: 0 },
};

/**
 * Crown width in metres of an open-grown tree of `dbhCm` (Ek 1974). Below 3 in DBH it scales
 * linearly to zero, as FVS does.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function openGrownCrownWidthM(equations: CrownWidthEquations, dbhCm: number): number {
  const { a, b, c } = equations.open;
  const d = dbhCm / INCH_CM;
  const at = (inches: number): number => a + b * plantPow(inches, c);
  return (d >= 3 ? at(d) : (at(3) * d) / 3) * FOOT_M;
}

/**
 * Crown width in metres of a forest-grown tree of `dbhCm` and crown ratio 0..1 (Bechtold 2003) in
 * northern Wisconsin. Below 5 in DBH it scales linearly to zero, as FVS does.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function forestGrownCrownWidthM(equations: CrownWidthEquations, dbhCm: number, crownRatio: number): number {
  const { a, b, cr, hi } = equations.forest;
  const d = dbhCm / INCH_CM;
  const at = (inches: number): number => a + b * inches + cr * crownRatio * 100 + hi * HOPKINS_INDEX_NORTHERN_WISCONSIN;
  return (d >= 5 ? at(d) : (at(5) * d) / 5) * FOOT_M;
}

/** A DBH class of measured stand-grown trees: its middle and the 10th and 90th percentile crown width. */
export interface CrownWidthClass {
  dbhCm: number;
  p10M: number;
  p50M: number;
  p90M: number;
}

/**
 * Measured crown widths of stand-grown trees by DBH class, from the Tallo database (Jucker et al.
 * 2022, CC BY 4.0): every record of the species with both DBH and crown radius.
 */
export const TALLO_CROWN_WIDTH: Readonly<Record<string, readonly CrownWidthClass[]>> = {
  // n = 4841
  "acer-saccharum": [
    { dbhCm: 7.5, p10M: 2.4, p50M: 3.6, p90M: 4.7 },
    { dbhCm: 12.5, p10M: 3.0, p50M: 4.6, p90M: 6.1 },
    { dbhCm: 17.5, p10M: 3.0, p50M: 4.6, p90M: 7.1 },
    { dbhCm: 25, p10M: 4.3, p50M: 6.1, p90M: 8.5 },
    { dbhCm: 35, p10M: 6.1, p50M: 7.6, p90M: 10.7 },
    { dbhCm: 45, p10M: 6.7, p50M: 9.1, p90M: 10.9 },
    { dbhCm: 57.5, p10M: 6.8, p50M: 9.7, p90M: 12.5 },
    { dbhCm: 72.5, p10M: 7.6, p50M: 11.1, p90M: 13.7 },
  ],
  // n = 330
  "pinus-strobus": [
    { dbhCm: 12.5, p10M: 2.6, p50M: 4.0, p90M: 4.7 },
    { dbhCm: 17.5, p10M: 2.7, p50M: 4.9, p90M: 6.2 },
    { dbhCm: 25, p10M: 3.2, p50M: 5.2, p90M: 6.4 },
    { dbhCm: 35, p10M: 4.3, p50M: 6.4, p90M: 8.1 },
    { dbhCm: 45, p10M: 4.7, p50M: 7.2, p90M: 9.8 },
    { dbhCm: 57.5, p10M: 7.2, p50M: 9.0, p90M: 11.5 },
    { dbhCm: 72.5, p10M: 8.8, p50M: 11.4, p90M: 14.7 },
  ],
};

/**
 * The 10th–90th percentile crown width in metres of measured stand-grown trees at `dbhCm`,
 * interpolated between Tallo DBH classes; below the first class it scales linearly to zero. Null for a
 * species with no record.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function measuredCrownWidthBandM(speciesId: string, dbhCm: number): { lowM: number; highM: number } | null {
  const classes = TALLO_CROWN_WIDTH[speciesId];
  const first = classes?.[0];
  if (classes === undefined || first === undefined) return null;
  if (dbhCm <= first.dbhCm) return { lowM: (first.p10M * dbhCm) / first.dbhCm, highM: (first.p90M * dbhCm) / first.dbhCm };
  let below = first;
  for (const next of classes) {
    if (dbhCm <= next.dbhCm) {
      const t = (dbhCm - below.dbhCm) / (next.dbhCm - below.dbhCm);
      return { lowM: below.p10M + (next.p10M - below.p10M) * t, highM: below.p90M + (next.p90M - below.p90M) * t };
    }
    below = next;
  }
  return { lowM: below.p10M, highM: below.p90M };
}

/** Where a crown carries its spread, from its envelope. */
export interface CrownProfile {
  /**
   * Height of the crown's spread as a share of crown length, 0 at its base and 1 at its top: the
   * centroid of the squared sector-mean radius. A cone is 0.25, a paraboloid 0.33 and a sphere 0.5.
   */
  centroid: number;
  /**
   * Radius at three quarters up the crown over the widest radius: a cone is about 0.25, a paraboloid
   * 0.5 and an ellipsoid 0.87.
   */
  shoulder: number;
}

/**
 * Crown profile of a plant from its envelope's sector-mean radius per height bin. An excurrent
 * conifer carries its spread low with a narrow top; a decurrent broadleaf carries it near mid-crown
 * with full shoulders. One long low limb moves the centroid only as far as its share of the crown.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownProfile(structure: PlantStructure): CrownProfile {
  const hull = structure.crownHull;
  const raw = new Float64Array(CROWN_HULL_BINS);
  let weight = 0;
  let moment = 0;
  for (let bin = 0; bin < CROWN_HULL_BINS; bin += 1) {
    let sum = 0;
    for (let sector = 0; sector < CROWN_HULL_SECTORS; sector += 1) sum += hull[2 + bin * CROWN_HULL_SECTORS + sector] ?? 0;
    const radius = sum / CROWN_HULL_SECTORS;
    raw[bin] = radius;
    weight += radius * radius;
    moment += (radius * radius * (bin + 0.5)) / CROWN_HULL_BINS;
  }
  // The shoulder reads a three-bin running mean, so one ragged bin neither makes nor breaks it.
  const smooth = new Float64Array(CROWN_HULL_BINS);
  let widest = 0;
  for (let bin = 0; bin < CROWN_HULL_BINS; bin += 1) {
    const own = raw[bin] ?? 0;
    const value = ((bin > 0 ? (raw[bin - 1] ?? own) : own) + own + (bin < CROWN_HULL_BINS - 1 ? (raw[bin + 1] ?? own) : own)) / 3;
    smooth[bin] = value;
    if (value > widest) widest = value;
  }
  const x = 0.75 * CROWN_HULL_BINS - 0.5;
  const low = Math.floor(x);
  const t = x - low;
  const atShoulder = (smooth[low] ?? 0) * (1 - t) + (smooth[low + 1] ?? 0) * t;
  return { centroid: weight > 0 ? moment / weight : 0, shoulder: widest > 0 ? atShoulder / widest : 0 };
}
