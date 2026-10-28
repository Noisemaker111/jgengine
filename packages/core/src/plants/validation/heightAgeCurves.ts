import { plantExp, plantPow } from "../growth/plantMath";

/**
 * A Carmean, Hahn & Jacobs 1989 (GTR NC-128) site-index curve in its Chapman–Richards form,
 * H = BH + b1·SI^b2·(1 − e^(b3·A))^(b4·SI^b5), heights in feet. Coefficients as printed in NC-128 and
 * reproduced in the Forest Vegetation Simulator's Lake States `htcalc.f` (both US public domain).
 */
export interface SiteIndexCurve {
  speciesId: string;
  curve: number;
  region: string;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  /** Feet added for curves fitted on breast-height age; 0 means A is total age. */
  breastHeightFt: number;
}

const FOOT_M = 0.3048;

/**
 * Height in metres at `ageYears` for a site index given in feet at base age 50.
 * @capability plant-validation published height-age curves to check a growth model against
 */
export function siteIndexHeightM(curve: SiteIndexCurve, siteIndexFt: number, ageYears: number): number {
  const asymptote = curve.b1 * plantPow(siteIndexFt, curve.b2);
  const shape = curve.b4 * plantPow(siteIndexFt, curve.b5);
  const heightFt = curve.breastHeightFt + asymptote * plantPow(1 - plantExp(curve.b3 * ageYears), shape);
  return heightFt * FOOT_M;
}
