// @skill jgengine-world
/**
 * What the loose cover over bedrock is made of, per cell: river-sorted gravel, sand and silt, scree
 * from landslides, and soil weathered in place. Rivers sort what they carry by how fast each grain
 * size settles (Ferguson & Church 2004), so gravel drops first where a river leaves the mountains,
 * sand further out and silt last, on floodplains, in lakes and in the sea: downstream fining (the
 * exponential decay of Sternberg 1875). Bedrock weathers into soil at a rate that falls with the soil
 * already over it, P = P₀ e^(−h/h₀) (Heimsath, Dietrich, Nishiizumi & Finkel 1997), so where erosion
 * outpaces it the rock stands bare.
 *
 * @capability landform-materials per-cell bedrock, soil, gravel, sand, silt and scree from a landform simulation
 */
import { plantExp, plantLog } from "../../plants/growth/plantMath";

/** Classes of loose cover, in their order in {@link SedimentCover.thickness}. */
export const COVER_CLASSES = ["gravel", "sand", "silt", "scree", "soil"] as const;

/** One class of loose cover. */
export type CoverClass = (typeof COVER_CLASSES)[number];

/** River-carried grain sizes, in their order in grain arrays. */
export const GRAIN_CLASSES = ["gravel", "sand", "silt"] as const;

/** One river-carried grain size. */
export type GrainClass = (typeof GRAIN_CLASSES)[number];

/** Share of each grain size, summing to 1. */
export interface GrainMix {
  gravel: number;
  sand: number;
  silt: number;
}

/** Representative grain diameters in metres. */
export interface GrainSizes {
  gravel: number;
  sand: number;
  silt: number;
}

/** Default diameters: 20 mm gravel, 0.5 mm sand, 0.02 mm silt. */
export const DEFAULT_GRAIN_SIZES: GrainSizes = { gravel: 0.02, sand: 5e-4, silt: 2e-5 };

/** What a rock breaks into when rivers cut it, unless its layer says otherwise. */
export const DEFAULT_ROCK_YIELD: GrainMix = { gravel: 0.2, sand: 0.5, silt: 0.3 };

/** What scree breaks into when a river picks it up: angular, coarse. */
export const SCREE_YIELD: GrainMix = { gravel: 0.55, sand: 0.3, silt: 0.15 };

/** What soil is made of when a river picks it up. */
export const SOIL_YIELD: GrainMix = { gravel: 0, sand: 0.4, silt: 0.6 };

const CLASS_COUNT = COVER_CLASSES.length;
const GRAVEL = 0;
const SAND = 1;
const SILT = 2;
const SCREE = 3;
const SOIL = 4;

/**
 * Settling velocity in m/s of a natural quartz grain of diameter `diameter` metres in water
 * (Ferguson & Church 2004, with C₁ = 18 and C₂ = 1 for natural grains).
 * @capability landform-materials per-cell bedrock, soil, gravel, sand, silt and scree from a landform simulation
 */
export function settlingVelocity(diameter: number): number {
  const submerged = 1.65;
  const gravity = 9.81;
  const viscosity = 1e-6;
  const weight = submerged * gravity * diameter * diameter;
  return weight / (18 * viscosity + Math.sqrt(0.75 * submerged * gravity * diameter * diameter * diameter));
}

/**
 * Soil thickness after weathering for `dt` years from `depth`, solving dh/dt = P₀ e^(−h/h₀) exactly:
 * h' = h₀ ln(e^(h/h₀) + P₀ dt / h₀).
 * @capability landform-materials per-cell bedrock, soil, gravel, sand, silt and scree from a landform simulation
 */
export function weatheredDepth(depth: number, production: number, depthScale: number, dt: number): number {
  if (production <= 0 || dt <= 0) return depth;
  return depthScale * plantLog(plantExp(depth / depthScale) + (production * dt) / depthScale);
}

/** Per-cell thickness of each cover class. @internal */
export interface SedimentCover {
  /** `cells × 5` thicknesses in metres, cell-major, in {@link COVER_CLASSES} order. */
  readonly thickness: Float64Array;
  /** Remove `loss` metres from cell `i` in proportion to what is there, adding what it carried, as grains, to `grains[i*3..]`. Returns the thickness removed. */
  remove(i: number, loss: number, grains?: Float64Array): number;
  /** Lay `amount` metres of one class on cell `i`. */
  add(i: number, cls: number, amount: number): void;
  /** Total cover thickness on cell `i`. */
  total(i: number): number;
}

/** Cover storage for `cells` cells. @internal */
export function createSedimentCover(cells: number): SedimentCover {
  const thickness = new Float64Array(cells * CLASS_COUNT);
  const total = (i: number): number => {
    let sum = 0;
    for (let c = 0; c < CLASS_COUNT; c += 1) sum += thickness[i * CLASS_COUNT + c] ?? 0;
    return sum;
  };
  return {
    thickness,
    total,
    add(i, cls, amount) {
      if (amount > 0) thickness[i * CLASS_COUNT + cls] = (thickness[i * CLASS_COUNT + cls] ?? 0) + amount;
    },
    remove(i, loss, grains) {
      const have = total(i);
      if (have <= 0 || loss <= 0) return 0;
      const taken = loss < have ? loss : have;
      const keep = 1 - taken / have;
      for (let c = 0; c < CLASS_COUNT; c += 1) {
        const at = i * CLASS_COUNT + c;
        const before = thickness[at] ?? 0;
        const after = taken === have ? 0 : before * keep;
        thickness[at] = after;
        if (grains === undefined) continue;
        const gone = before - after;
        if (c === GRAVEL) grains[i * 3] = (grains[i * 3] ?? 0) + gone;
        else if (c === SAND) grains[i * 3 + 1] = (grains[i * 3 + 1] ?? 0) + gone;
        else if (c === SILT) grains[i * 3 + 2] = (grains[i * 3 + 2] ?? 0) + gone;
        else {
          const mix = c === SCREE ? SCREE_YIELD : SOIL_YIELD;
          grains[i * 3] = (grains[i * 3] ?? 0) + gone * mix.gravel;
          grains[i * 3 + 1] = (grains[i * 3 + 1] ?? 0) + gone * mix.sand;
          grains[i * 3 + 2] = (grains[i * 3 + 2] ?? 0) + gone * mix.silt;
        }
      }
      return taken;
    },
  };
}

/** Cover class indices. @internal */
export const COVER = { gravel: GRAVEL, sand: SAND, silt: SILT, scree: SCREE, soil: SOIL } as const;
