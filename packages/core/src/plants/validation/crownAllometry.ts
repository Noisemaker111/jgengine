import { plantPow } from "../growth/plantMath";
import { CROWN_HULL_BINS, CROWN_HULL_SECTORS, type PlantStructure } from "../structure/plantStructure";

const INCH_CM = 2.54;
const FOOT_M = 0.3048;
/** Hopkins bioclimatic index of northern Wisconsin, the region the Carmean curves are for. */
const HOPKINS_INDEX_NORTHERN_WISCONSIN = 37.7;

/**
 * Ek 1974 open-grown crown width CW = a + b·D^c in feet from DBH in inches, used from 3 in DBH, as
 * coded in the Forest Vegetation Simulator's Lake States `cwcalc.f` (US public domain).
 */
export interface OpenCrownWidthEquation {
  a: number;
  b: number;
  c: number;
}

/**
 * Bechtold 2003 forest-grown crown width CW = a + b·D + cr·CR% + hi·HI in feet from DBH in inches,
 * used from 5 in DBH, as coded in FVS Lake States `cwcalc.f` (US public domain).
 */
export interface ForestCrownWidthEquation {
  a: number;
  b: number;
  cr: number;
  hi: number;
}

/**
 * Crown width in metres of an open-grown tree of `dbhCm` (Ek 1974). Below 3 in DBH it scales
 * linearly to zero, as FVS does.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function openGrownCrownWidthM(equation: OpenCrownWidthEquation, dbhCm: number): number {
  const { a, b, c } = equation;
  const d = dbhCm / INCH_CM;
  const at = (inches: number): number => a + b * plantPow(inches, c);
  return (d >= 3 ? at(d) : (at(3) * d) / 3) * FOOT_M;
}

/**
 * Crown width in metres of a forest-grown tree of `dbhCm` and crown ratio 0..1 (Bechtold 2003) in
 * northern Wisconsin. Below 5 in DBH it scales linearly to zero, as FVS does.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function forestGrownCrownWidthM(equation: ForestCrownWidthEquation, dbhCm: number, crownRatio: number): number {
  const { a, b, cr, hi } = equation;
  const d = dbhCm / INCH_CM;
  const at = (inches: number): number => a + b * inches + cr * crownRatio * 100 + hi * HOPKINS_INDEX_NORTHERN_WISCONSIN;
  return (d >= 5 ? at(d) : (at(5) * d) / 5) * FOOT_M;
}

/** A DBH class of measured stand-grown trees: its middle and the 10th, 50th and 90th percentile crown width. */
export interface CrownWidthClass {
  dbhCm: number;
  p10M: number;
  p50M: number;
  p90M: number;
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
