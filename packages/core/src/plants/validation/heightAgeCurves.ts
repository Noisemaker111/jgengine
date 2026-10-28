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

/** NC-128 curve 3: sugar maple, northern Wisconsin and Upper Michigan (Carmean 1978), total age. */
export const SUGAR_MAPLE_CARMEAN: SiteIndexCurve = {
  speciesId: "acer-saccharum",
  curve: 3,
  region: "northern Wisconsin and Upper Michigan",
  b1: 6.1308,
  b2: 0.6904,
  b3: -0.0195,
  b4: 10.1563,
  b5: -0.533,
  breastHeightFt: 0,
};

/** NC-128 curve 103: eastern white pine, northern Wisconsin (FVS `htcalc.f`), total age. */
export const EASTERN_WHITE_PINE_CARMEAN: SiteIndexCurve = {
  speciesId: "pinus-strobus",
  curve: 103,
  region: "northern Wisconsin",
  b1: 1.966,
  b2: 1,
  b3: -0.024,
  b4: 1.8942,
  b5: 0,
  breastHeightFt: 0,
};

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
