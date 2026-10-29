// @skill jgengine-world
import { plantCos, plantSin } from "../growth/plantMath";
import type { LeafShapeParams } from "../species/plantSpecies";

const GOLDEN_ANGLE = 2.399963;
/**
 * Spine steps the structure's height and crown read; the mesh draws its own.
 * @internal
 */
export const FROND_STATS_SEGMENTS = 6;
/** Rise of a frond just unfolded, radians above horizontal. */
const NEWEST_RISE = 1.05;
/** How far a frond sinks each year it ages, radians: old palm fronds hang down the trunk. */
const DROOP_PER_YEAR = 0.6;
const LOWEST_RISE = -0.5;
/** Bend of the blade from its base to its tip under its own weight, radians. */
const BLADE_SAG = 0.7;

/**
 * Whether a leaf shape is a frond (pinnate palm and fern leaves) or a fan (palmate palm leaves): one
 * large leaf per metamer, drawn as an arched blade rather than a card.
 * @capability plant-mesh turn a grown plant into a styled mesh at four detail levels within fixed triangle budgets
 */
export function isFrondShape(shape: LeafShapeParams): boolean {
  return shape.kind === "frond" || shape.kind === "fan";
}

/**
 * Share of full length the fronds a plant grows in `year` reach: a tenth at first, full size after
 * its frond establishment years.
 * @internal
 */
export function frondLengthShare(growth: { frondEstablishmentYears?: number }, year: number): number {
  const years = growth.frondEstablishmentYears;
  if (years === undefined || years <= 0) return 1;
  return Math.min(1, 0.1 + (0.9 * year) / years);
}

/**
 * Fronds a leaf row stands for: its leaf area over one frond's (0.55 of length squared, as
 * `createPlantGrowth` grows them).
 * @internal
 */
export function frondCount(foliageM2: number, lengthM: number): number {
  const one = 0.55 * lengthM * lengthM;
  return Math.max(1, Math.min(4000, Math.round(foliageM2 / Math.max(1e-9, one))));
}

/** Where frond `k` of a row points: azimuth round the stem, rise above horizontal and sag to its tip. */
export interface FrondPose {
  azimuth: number;
  elevation: number;
  sag: number;
}

/**
 * Pose of frond `k` of the `count` a row grew `rowAgeYears` ago. Fronds spiral round the stem by the
 * golden angle; each year's are unfolded through that year, the newest highest, and every frond sinks
 * as it ages (Tomlinson 1990), so a palm crown has rising young fronds over drooping old ones.
 * @internal
 */
export function frondPose(segment: number, k: number, count: number, rowAgeYears: number, out: FrondPose): FrondPose {
  const age = rowAgeYears + (count - k - 0.5) / Math.max(1, count);
  out.azimuth = segment * 1.3 + k * GOLDEN_ANGLE;
  out.elevation = Math.max(LOWEST_RISE, NEWEST_RISE - DROOP_PER_YEAR * age);
  out.sag = BLADE_SAG;
  return out;
}

/**
 * Spine of a frond `lengthM` long in `segments` steps: (outward, up) metre pairs from its base, the
 * blade bending down along its length.
 * @internal
 */
export function frondSpine(pose: FrondPose, lengthM: number, segments: number, out: Float64Array): Float64Array {
  const step = lengthM / segments;
  let h = 0;
  let y = 0;
  out[0] = 0;
  out[1] = 0;
  for (let i = 1; i <= segments; i += 1) {
    const t = (i - 0.5) / segments;
    const angle = pose.elevation - pose.sag * t * t;
    h += plantCos(angle) * step;
    y += plantSin(angle) * step;
    out[i * 2] = h;
    out[i * 2 + 1] = y;
  }
  return out;
}
