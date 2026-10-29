/**
 * What USDA PLANTS says a shrub, palm, fern or herb grows into, for species no forest inventory
 * measures: imported by `bun run jgengine plants import` and checked by the species library test.
 * Heights are open-grown on a good site, as PLANTS characteristics describe them.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export interface HabitReference {
  speciesId: string;
  usda: string;
  /** PLANTS "Height at 20 Years, Maximum", metres; null for a fern or herb PLANTS gives none for. */
  heightAt20M: number | null;
  /** PLANTS "Height, Mature", metres. */
  matureHeightM: number;
  /** PLANTS growth form: a multi-stemmed shrub keeps several live stems. */
  multiStem: boolean;
  /** PLANTS growth rate class. */
  growthRate: "Slow" | "Moderate" | "Rapid";
}

/**
 * Height a habit species should reach by 20 years: PLANTS' 20-year height, or its mature height for a
 * fern or herb that is full grown within a few years.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function habitHeightAt20M(reference: HabitReference): number {
  return reference.heightAt20M ?? reference.matureHeightM;
}

/**
 * Most a habit species should stand at 40 years before the 15% allowance: its mature height, or its
 * 20-year height where PLANTS lists that as the taller of the two.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export function habitHeightCeilingM(reference: HabitReference): number {
  return Math.max(reference.matureHeightM, reference.heightAt20M ?? 0);
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
