/**
 * What USDA PLANTS says a shrub, palm, fern or herb grows into, for species no forest inventory
 * measures: imported by `bun run jgengine plants import` and checked by the species library test.
 * Heights are open-grown on a good site, as PLANTS characteristics describe them.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export interface HabitReference {
  speciesId: string;
  usda: string;
  /** PLANTS "Height at 20 Years, Maximum", metres. */
  heightAt20M: number;
  /** PLANTS "Height, Mature", metres. */
  matureHeightM: number;
  /** PLANTS growth form: a multi-stemmed shrub keeps several live stems. */
  multiStem: boolean;
  /** PLANTS growth rate class. */
  growthRate: "Slow" | "Moderate" | "Rapid";
}

/**
 * Ages a habit species is grown to and checked at.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const HABIT_CHECK_AGES = [5, 10, 20, 40] as const;

/**
 * Most stems a multi-stemmed shrub should keep alive at 20 years, and fewest.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const SHRUB_STEMS = { min: 3, max: 30 } as const;

/**
 * Live basal stems of a grown structure: the order-0 segments rising straight from the collar.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function basalStemCount(segments: { parent: Int32Array; order: Uint8Array; region: Uint8Array }, deadwoodRegion: number): number {
  let stems = 0;
  for (let i = 0; i < segments.parent.length; i += 1) {
    if (segments.parent[i] === 0 && segments.order[i] === 0 && segments.region[i] !== deadwoodRegion) stems += 1;
  }
  return stems;
}
