import { OPEN_TEMPERATE_SITE, type PlantEnvironment } from "../growth/plantEnvironment";
import { plantExp, plantPow } from "../growth/plantMath";
import type { CrownWidthClass, ForestCrownWidthEquation, OpenCrownWidthEquation } from "../validation/crownAllometry";
import { siteIndexHeightM, type SiteIndexCurve } from "../validation/heightAgeCurves";

/**
 * The stand a species is grown in to compare with its reference: fully stocked and even-aged, seen
 * from a dominant tree. FIA site trees and Tallo stand-grown crowns are dominant and codominant trees,
 * which hold more growing space than the stand's mean tree (Oliver & Larson 1996, Forest Stand
 * Dynamics), so the spacing index is 0.3 rather than the mean tree's 0.25.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const REFERENCE_STAND: PlantEnvironment = { ...OPEN_TEMPERATE_SITE, stand: { spacingIndex: 0.3 } };

/**
 * How far a stand-grown tree may sit from its tables and still pass, at 20, 50 and 100 years in
 * {@link REFERENCE_STAND}: height within 15% of its Carmean or FIA curve, DBH within 25% of its FIA
 * curve, crown width inside its Tallo band. One envelope for every tree species; the library test
 * holds every record to it and `bun run jgengine plants fit --until-pass` fits a record into it.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const STAND_ENVELOPE = { heightShare: 0.15, dbhShare: 0.25, ages: [20, 50, 100] } as const;

export interface GrowthCurve {
  a: number;
  k: number;
  p: number;
}

/**
 * What measured trees say one species should grow into, imported from public tables by
 * `bun run jgengine plants import` and fitted to by `plants fit`.
 */
export interface SpeciesReference {
  speciesId: string;
  carmean?: SiteIndexCurve;
  siteIndexFt: number;
  yearsToBreastHeight: number;
  siteTrees: { count: number; youngestYears: number; oldestYears: number };
  /** Height (m) and DBH (cm) of a dominant stand-grown tree by total age, fitted to FIA site trees. */
  standHeightM: GrowthCurve;
  standDbhCm: GrowthCurve;
  /**
   * Height–diameter relation of the same FIA site trees, DBH = a·(H − 1.3)^b in cm from metres: what
   * DBH a dominant tree of a given height carries, read where the site trees are younger than any.
   */
  dbhByHeight: { a: number; b: number };
  crownWidth: { trees: number; classes: readonly CrownWidthClass[] };
  openCrownWidth?: OpenCrownWidthEquation;
  forestCrownWidth?: ForestCrownWidthEquation;
}

/**
 * Height in metres of a dominant stand-grown tree of the species at `ageYears`: its Carmean curve on
 * the reference site index, else the curve fitted to its FIA site trees.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function standHeightAtM(reference: SpeciesReference, ageYears: number): number {
  return reference.carmean === undefined ? growthCurveAt(reference.standHeightM, ageYears) : siteIndexHeightM(reference.carmean, reference.siteIndexFt, ageYears);
}

/** @capability plant-validation published crown allometry and crown-shape measures to check a growth model against */
export function standDbhAtCm(reference: SpeciesReference, ageYears: number): number {
  if (ageYears >= reference.siteTrees.youngestYears) return growthCurveAt(reference.standDbhCm, ageYears);
  const aboveBreastHeight = standHeightAtM(reference, ageYears) - BREAST_HEIGHT_M;
  return aboveBreastHeight > 0 ? reference.dbhByHeight.a * plantPow(aboveBreastHeight, reference.dbhByHeight.b) : 0;
}

const BREAST_HEIGHT_M = 1.3;

/** @capability plant-validation published crown allometry and crown-shape measures to check a growth model against */
export function growthCurveAt(curve: GrowthCurve, ageYears: number): number {
  return curve.a * plantPow(1 - plantExp(-curve.k * ageYears), curve.p);
}

/**
 * The 10th–90th percentile crown width in metres of measured stand-grown trees of a species at
 * `dbhCm`, interpolated between its Tallo DBH classes; below the first class it scales linearly to
 * zero. Null when the species has no Tallo record.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function crownWidthBandM(reference: Pick<SpeciesReference, "crownWidth">, dbhCm: number): { lowM: number; highM: number } | null {
  const classes = reference.crownWidth.classes;
  const first = classes[0];
  if (first === undefined) return null;
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
