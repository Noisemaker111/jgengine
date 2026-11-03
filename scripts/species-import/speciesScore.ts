import { openGrownCrownWidthM } from "../../packages/core/src/plants/validation/crownAllometry";
import { crownWidthBandM, standDbhAtCm, standHeightAtM, type SpeciesReference } from "../../packages/core/src/plants/species/speciesReference";
import type { CrownForm } from "../../packages/core/src/plants/species/plantSpecies";
import { CROWN_ARCHITECTURE_MEASURES, CROWN_ARCHITECTURE_MISSES_ALLOWED, crownArchitectureMisses, crownShapeBands, type CrownArchitecture, type CrownArchitectureTarget, type MeasureBand } from "../../packages/core/src/plants/validation/crownArchitecture";
import type { Trial, TrialReading } from "./speciesTrial";

/** What a fit holds one species to beyond its reference tables. */
export interface FitTarget {
  reference: SpeciesReference;
  form: CrownForm;
  /** Fork, limbs, openness and leaf shell of the open-grown tree at the architecture age. */
  architecture: CrownArchitectureTarget;
  maxCrownRadiusM: number;
  /** Shade-tolerant species must keep a leafy crown for 100 years under 0.2 light. */
  shadeTolerant: boolean;
}

const sq = (x: number): number => x * x;
const hinge = (x: number, lo: number, hi: number, scale: number): number => (x < lo ? sq((lo - x) / scale) : x > hi ? sq((x - hi) / scale) : 0);
const logRatio = (a: number, b: number): number => Math.log(Math.max(1e-6, a) / Math.max(1e-6, b));

const inBand = (x: number, b: MeasureBand | undefined, scale: number): number => (b === undefined ? 0 : hinge(x, b[0], b[1], scale));

/** Crown-shape bands of each form, as the crown tests check them. */
function shapePenalty(form: CrownForm, r: TrialReading): number {
  const bands = crownShapeBands(form, r.age);
  return inBand(r.centroid, bands.centroid, 0.03) + inBand(r.shoulder, bands.shoulder, 0.03) + inBand(r.crownWidthM / Math.max(0.1, r.heightM), bands.widthPerHeight, 0.03);
}

/** How far a measure may stray outside its band before it costs as much as a 1-sigma height miss. */
const ARCHITECTURE_SCALE: Readonly<Record<keyof CrownArchitecture, number>> = {
  forkRatio: 0.05,
  forkHeightShare: 0.05,
  scaffoldLimbs: 1,
  shellShare: 0.03,
  gapFraction: 0.03,
  limbAngleDeg: 4,
  centroid: 0.03,
  shoulder: 0.03,
};

/** Margin the fit keeps inside each band, as the height and DBH terms do, so a fitted tree passes the test. */
const ARCHITECTURE_MARGIN: Readonly<Record<keyof CrownArchitecture, number>> = {
  forkRatio: 0.06,
  forkHeightShare: 0.04,
  scaffoldLimbs: 0.5,
  shellShare: 0.02,
  gapFraction: 0.02,
  limbAngleDeg: 3,
  centroid: 0.02,
  shoulder: 0.02,
};

function architecturePenalty(target: CrownArchitectureTarget, measured: CrownArchitecture): number {
  let sum = 0;
  for (const key of CROWN_ARCHITECTURE_MEASURES) {
    const band = target[key];
    if (band !== undefined) sum += hinge(measured[key], band[0] + ARCHITECTURE_MARGIN[key], band[1] - ARCHITECTURE_MARGIN[key], ARCHITECTURE_SCALE[key]);
  }
  return sum;
}

/** Score of each check the library test would fail, so a fit never trades a failing check for a closer fit elsewhere. */
const TEST_MISS_COST = 10;

/**
 * Guardrail misfit of the seeded individuals, leaving out the worst ones the library test allows to
 * miss, plus a fixed cost for each further seed that misses.
 */
function seededArchitecturePenalty(target: CrownArchitectureTarget, individuals: readonly CrownArchitecture[]): number {
  const penalties = individuals.map((measured) => architecturePenalty(target, measured)).sort((a, b) => a - b);
  const misses = individuals.filter((measured) => crownArchitectureMisses(target, measured).length > 0).length;
  const near = penalties.slice(0, Math.max(0, penalties.length - CROWN_ARCHITECTURE_MISSES_ALLOWED)).reduce((sum, p) => sum + p, 0);
  return near + TEST_MISS_COST * Math.max(0, misses - CROWN_ARCHITECTURE_MISSES_ALLOWED);
}

/** A trial's total misfit and its parts; lower is better. */
export interface TrialScore {
  total: number;
  parts: Record<string, number>;
}

/** Sum of squared misfits of a trial against its target, by part; lower is better. */
export function scoreTrial(target: FitTarget, trial: Trial): TrialScore {
  const { reference } = target;
  const parts: Record<string, number> = {};
  const add = (key: string, value: number): void => {
    parts[key] = (parts[key] ?? 0) + value;
  };
  const seeds = Math.max(1, trial.open.length);
  for (let s = 0; s < trial.open.length; s += 1) {
    for (const age of [20, 50, 100]) {
      const open = trial.open[s]?.find((r) => r.age === age);
      const stand = trial.stand[s]?.find((r) => r.age === age);
      if (open === undefined || stand === undefined || !open.alive || !stand.alive) {
        add("dead", 2000);
        continue;
      }
      const height = standHeightAtM(reference, age);
      const dbh = standDbhAtCm(reference, age);
      add("standHeight", sq(logRatio(stand.heightM, height) / 0.08));
      add("openHeight", hinge(open.heightM / height, 0.85, 1.15, 0.05));
      add("standDbh", sq(logRatio(stand.dbhCm, dbh) / 0.12));
      add("openDbh", hinge(open.dbhCm / dbh, 1, 3, 0.3));
      const band = crownWidthBandM(reference, stand.dbhCm);
      if (band !== null) {
        add("tallo", hinge(Math.log(stand.crownWidthM), Math.log(band.lowM) + 0.06, Math.log(band.highM) - 0.06, 0.015));
        add("talloCentre", 0.2 * sq(logRatio(stand.crownWidthM, 0.5 * (band.lowM + band.highM)) / 0.3));
      }
      // The library test's limits, with a margin: ±15% height and ±25% DBH.
      add("limits", hinge(Math.abs(logRatio(stand.heightM, height)), 0, 0.11, 0.01) + hinge(Math.abs(logRatio(stand.dbhCm, dbh)), 0, 0.18, 0.01));
      const outsideTallo = band !== null && (stand.crownWidthM < band.lowM || stand.crownWidthM > band.highM);
      const testMisses = (Math.abs(stand.heightM / height - 1) >= 0.15 ? 1 : 0) + (Math.abs(stand.dbhCm / dbh - 1) >= 0.25 ? 1 : 0) + (outsideTallo ? 1 : 0);
      add("testMisses", TEST_MISS_COST * testMisses);
      if (reference.openCrownWidth !== undefined) {
        const ek = openGrownCrownWidthM(reference.openCrownWidth, open.dbhCm);
        add("openCrown", hinge(open.crownWidthM / ek, 0.85, 1.18, 0.05));
      }
      add("maxCrown", hinge(open.crownWidthM / 2, 0, target.maxCrownRadiusM, 0.5));
      add("crownRatio", hinge(open.crownRatio, 0.57, 1, 0.04) + (age >= 50 ? hinge(stand.crownRatio, 0, 0.5, 0.04) : 0));
      add("shape", shapePenalty(target.form, open) + shapePenalty(target.form, stand));
    }
    add("architecture", seededArchitecturePenalty(target.architecture, trial.architecture));
    const shadeLeaf = trial.shadeLeafAreaM2[s];
    // A shaded sapling keeps a leafy crown but never outgrows an open-grown tree of its age.
    const openLeaf = trial.open[s]?.find((r) => r.age === 100)?.leafAreaM2 ?? 0;
    if (target.shadeTolerant && shadeLeaf !== undefined) add("shade", hinge(Math.log(Math.max(0.01, shadeLeaf)), Math.log(3), Math.log(Math.max(3, 0.5 * openLeaf)), 0.5) + (trial.shadeAlive[s] === true ? 0 : 20) + (trial.deepShadeAlive[s] === false ? 20 : 0));
  }
  let total = 0;
  for (const key of Object.keys(parts)) {
    const value = (parts[key] ?? 0) / seeds;
    parts[key] = value;
    total += value;
  }
  total += hinge(trial.ms / seeds, 0, 4000, 1500);
  // A stem that never reaches breast height has no DBH; rank it last rather than poison the search with NaN.
  return { total: Number.isFinite(total) ? total : 1e6, parts };
}
