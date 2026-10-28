import { openGrownCrownWidthM } from "../../packages/core/src/plants/validation/crownAllometry";
import { crownWidthBandM, standDbhAtCm, standHeightAtM, type SpeciesReference } from "../../packages/core/src/plants/species/speciesReference";
import type { CrownForm } from "./speciesTraits";
import type { Trial, TrialReading } from "./speciesTrial";

/** What a fit holds one species to beyond its reference tables. */
export interface FitTarget {
  reference: SpeciesReference;
  form: CrownForm;
  maxCrownRadiusM: number;
  /** Shade-tolerant species must keep a leafy crown for 100 years under 0.2 light. */
  shadeTolerant: boolean;
}

const sq = (x: number): number => x * x;
const hinge = (x: number, lo: number, hi: number, scale: number): number => (x < lo ? sq((lo - x) / scale) : x > hi ? sq((x - hi) / scale) : 0);
const logRatio = (a: number, b: number): number => Math.log(Math.max(1e-6, a) / Math.max(1e-6, b));

/** Crown-shape bands of each form (Brown, McAlpine & Kormanik 1967), as the crown tests check them. */
function shapePenalty(form: CrownForm, r: TrialReading): number {
  if (form === "decurrent") return hinge(r.centroid, 0.4, 0.66, 0.03) + hinge(r.shoulder, r.age >= 50 ? 0.64 : 0.49, 2, 0.03);
  // A column keeps its width up the crown and stays under 0.4 of the tree's height across.
  if (form === "columnar") return hinge(r.centroid, 0.25, 0.55, 0.03) + hinge(r.shoulder, 0.5, 2, 0.03) + (r.age >= 50 ? hinge(r.crownWidthM / Math.max(0.1, r.heightM), 0, 0.4, 0.03) : 0);
  return hinge(r.centroid, 0, 0.33, 0.03) + (r.age >= 50 ? hinge(r.shoulder, 0, 0.42, 0.03) : 0);
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
      if (band !== null) add("tallo", hinge(Math.log(stand.crownWidthM), Math.log(band.lowM) + 0.06, Math.log(band.highM) - 0.06, 0.015) + 0.2 * sq(logRatio(stand.crownWidthM, 0.5 * (band.lowM + band.highM)) / 0.3));
      // The library test's limits, with a margin: ±15% height and ±25% DBH.
      add("limits", hinge(Math.abs(logRatio(stand.heightM, height)), 0, 0.11, 0.01) + hinge(Math.abs(logRatio(stand.dbhCm, dbh)), 0, 0.18, 0.01));
      if (reference.openCrownWidth !== undefined) {
        const ek = openGrownCrownWidthM(reference.openCrownWidth, open.dbhCm);
        add("openCrown", hinge(open.crownWidthM / ek, 0.85, 1.18, 0.05));
      }
      add("maxCrown", hinge(open.crownWidthM / 2, 0, target.maxCrownRadiusM, 0.5));
      add("crownRatio", hinge(open.crownRatio, 0.57, 1, 0.04) + (age >= 50 ? hinge(stand.crownRatio, 0, 0.5, 0.04) : 0));
      add("shape", shapePenalty(target.form, open) + shapePenalty(target.form, stand));
    }
    const shadeLeaf = trial.shadeLeafAreaM2[s];
    // A shaded sapling keeps a leafy crown but never outgrows an open-grown tree of its age.
    const openLeaf = trial.open[s]?.find((r) => r.age === 100)?.leafAreaM2 ?? 0;
    if (target.shadeTolerant && shadeLeaf !== undefined) add("shade", hinge(Math.log(Math.max(0.01, shadeLeaf)), Math.log(3), Math.log(Math.max(3, 0.5 * openLeaf)), 0.5) + (trial.shadeAlive[s] === true ? 0 : 20));
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
