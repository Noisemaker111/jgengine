import type { HabitReference } from "../../packages/core/src/plants/species/habitReference";
import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { readRaw, type RawSource } from "./rawSources";
import type { FitParameter } from "./speciesFit";
import { FIT_PARAMETERS } from "./speciesFit";
import type { TrialScore } from "./speciesScore";
import { ALTERNATE, bark, broadleaf, SHADE_TOLERANCE, spring, type SpeciesTraits } from "./speciesTraits";
import type { Trial } from "./speciesTrial";

/**
 * A shrub, palm, fern or herb: no forest inventory measures it, so its traits come from USDA PLANTS
 * and NRCS plant guides and its growth is fitted to PLANTS heights rather than FIA site trees.
 */
export interface HabitTraits extends Pick<SpeciesTraits, "id" | "exportName" | "scientific" | "common" | "usda" | "prior" | "architecture" | "lateralBudsPerNode" | "shade" | "tolerance" | "modulusGPa" | "leaf" | "bark" | "reproduction" | "phenology"> {
  habit: "shrub";
  /** Stems a seedling sets at its collar. */
  basalStems: number;
  limits: { maxAgeYears: number; maxHeightM: number; maxDbhCm: number; maxCrownRadiusM: number };
  /** Basic wood density, dry kg per green m³. */
  densityKgM3: number;
  /** Where the hand-entered traits come from, as ids into `PLANT_SOURCES`. */
  source: "usda-plant-guides";
}

/**
 * Highbush blueberry (NRCS plant guide: a multi-stemmed deciduous shrub of wet woods and bogs, 2–4 m
 * tall, white bell flowers in spring, blue berries in summer, red autumn leaves).
 */
const VACCINIUM_CORYMBOSUM: HabitTraits = {
  id: "vaccinium-corymbosum",
  exportName: "VACCINIUM_CORYMBOSUM",
  scientific: "Vaccinium corymbosum L.",
  common: { en: "highbush blueberry", fr: "bleuet en corymbe" },
  usda: "VACO",
  habit: "shrub",
  prior: "prunus-serotina",
  architecture: ALTERNATE,
  lateralBudsPerNode: 1,
  basalStems: 6,
  shade: "intolerant",
  tolerance: { drought: 0.3, frost: 0.85, waterlogging: 0.7 },
  limits: { maxAgeYears: 60, maxHeightM: 4.5, maxDbhCm: 6, maxCrownRadiusM: 2 },
  densityKgM3: 600,
  modulusGPa: 9,
  leaf: broadleaf("ovate", 6, 0.45, 0, 0, 1, "#b8352a", 18),
  bark: bark("smooth", 60, 0.1, "#7a6658"),
  reproduction: { firstFlowerYears: 3, flowerColor: "#f4f1e4", fruitColor: "#3b4f8f", seedMassMg: 0.4 },
  phenology: spring(220),
  source: "usda-plant-guides",
};

/** Every non-tree species the importer knows. */
export const HABIT_TRAITS: readonly HabitTraits[] = [VACCINIUM_CORYMBOSUM];

/** Growth and carbon a habit fit searches: the tree parameters plus how long a stem lives. */
export const HABIT_FIT_PARAMETERS: readonly FitParameter[] = [...FIT_PARAMETERS, { path: "growth.stemLifespanYears", lo: 4, hi: 30 }];

const PLANTS_API = "https://plantsservices.sc.egov.usda.gov/api/";
const FOOT_M = 0.3048;
const PLANTS_LICENCE = "US public domain (USDA NRCS PLANTS)";

function plantsProfile(usda: string): RawSource {
  return { file: `plants/${usda}.json`, url: `${PLANTS_API}PlantProfile?symbol=${usda}`, licence: PLANTS_LICENCE };
}

function plantsCharacteristics(usda: string, profileId: number): RawSource {
  return { file: `plants/${usda}.char.json`, url: `${PLANTS_API}PlantCharacteristics/${profileId}`, licence: PLANTS_LICENCE };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Read a habit species' PLANTS profile and characteristics (cached in the asset store) into its reference. */
export function importHabitReference(root: string, traits: HabitTraits): HabitReference {
  const profile: unknown = JSON.parse(readRaw(root, plantsProfile(traits.usda)));
  const profileId = isRecord(profile) && typeof profile["Id"] === "number" ? profile["Id"] : undefined;
  if (profileId === undefined) throw new Error(`PLANTS has no profile for ${traits.usda}`);
  const rows: unknown = JSON.parse(readRaw(root, plantsCharacteristics(traits.usda, profileId)));
  const value = (name: string): string | undefined => {
    if (!Array.isArray(rows)) return undefined;
    const row: unknown = rows.find((r: unknown) => isRecord(r) && r["PlantCharacteristicName"] === name);
    return isRecord(row) && typeof row["PlantCharacteristicValue"] === "string" ? row["PlantCharacteristicValue"] : undefined;
  };
  const feet = (name: string): number => {
    const read = Number(value(name));
    if (!Number.isFinite(read) || read <= 0) throw new Error(`PLANTS ${traits.usda} has no "${name}"`);
    return Math.round(read * FOOT_M * 100) / 100;
  };
  const rate = value("Growth Rate");
  return {
    speciesId: traits.id,
    usda: traits.usda,
    heightAt20M: feet("Height at 20 Years, Maximum (feet)"),
    matureHeightM: feet("Height, Mature (feet)"),
    multiStem: value("Growth Form") === "Multiple Stem",
    growthRate: rate === "Slow" || rate === "Rapid" ? rate : "Moderate",
  };
}

/** TypeScript source of the habit reference table. */
export function habitReferenceTableSource(references: readonly HabitReference[]): string {
  return `import type { HabitReference } from "./habitReference";

/**
 * USDA PLANTS heights and growth form of every shrub, palm, fern and herb in the library. Written by
 * \`bun run jgengine plants import\`; do not edit by hand.
 * @capability plant-validation published crown allometry and crown-shape measures to check a growth model against
 */
export const HABIT_REFERENCE: Readonly<Record<string, HabitReference>> = ${JSON.stringify(Object.fromEntries(references.map((r) => [r.speciesId, r])), null, 2)};
`;
}

const sq = (x: number): number => x * x;
const hinge = (x: number, lo: number, hi: number, scale: number): number => (x < lo ? sq((lo - x) / scale) : x > hi ? sq((x - hi) / scale) : 0);
const logRatio = (a: number, b: number): number => Math.log(Math.max(1e-6, a) / Math.max(1e-6, b));

/**
 * Misfit of a habit trial against PLANTS: height at 20 years, mature height held at 40, a rounded
 * clump about as wide as it is tall, inside the crown limit, and (for a multi-stemmed shrub) a clump
 * of live stems.
 */
export function scoreHabitTrial(reference: HabitReference, maxCrownRadiusM: number, trial: Trial): TrialScore {
  const parts: Record<string, number> = {};
  const add = (key: string, value: number): void => {
    parts[key] = (parts[key] ?? 0) + value;
  };
  const seeds = Math.max(1, trial.open.length);
  for (const readings of trial.open) {
    const at = (age: number) => readings.find((r) => r.age === age);
    const r10 = at(10);
    const r20 = at(20);
    const r40 = at(40);
    if (r10 === undefined || r20 === undefined || r40 === undefined || !r40.alive) {
      add("dead", 2000);
      continue;
    }
    add("height20", sq(logRatio(r20.heightM, reference.heightAt20M) / 0.08) + hinge(Math.abs(logRatio(r20.heightM, reference.heightAt20M)), 0, 0.11, 0.01));
    add("height40", hinge(r40.heightM / reference.matureHeightM, 0.85, 1.1, 0.05));
    add("height10", hinge(r10.heightM / r20.heightM, 0.3, 0.95, 0.05));
    for (const r of [r10, r20, r40]) {
      add("width", hinge(r.crownWidthM / Math.max(0.1, r.heightM), 0.7, 1.5, 0.1));
      add("maxCrown", hinge(r.crownWidthM / 2, 0, maxCrownRadiusM, 0.2));
      if (reference.multiStem) add("stems", hinge(r.stems, 3, 30, 1));
    }
  }
  let total = 0;
  for (const key of Object.keys(parts)) {
    const value = (parts[key] ?? 0) / seeds;
    parts[key] = value;
    total += value;
  }
  total += hinge(trial.ms / seeds, 0, 4000, 1500);
  return { total: Number.isFinite(total) ? total : 1e6, parts };
}

/** A full record for a habit species from its traits and fitted growth and carbon, starting from `base`. */
export function buildHabitRecord(traits: HabitTraits, growth: PlantSpecies["growth"], carbon: PlantSpecies["carbon"], fit: { score: number; against: string }, base: PlantSpecies, version: number): PlantSpecies {
  const fitted = { source: "habit-fit" as const, fitted: fit };
  return {
    ...base,
    id: traits.id,
    version,
    names: { scientific: traits.scientific, common: { en: traits.common.en, fr: traits.common.fr } },
    ids: { usda: traits.usda },
    habit: traits.habit,
    architecture: { ...traits.architecture },
    growth: { ...growth, basalStems: traits.basalStems, lateralBudsPerNode: traits.lateralBudsPerNode, tropism: { ...growth.tropism } },
    carbon: { ...carbon },
    wood: { ...base.wood, densityKgM3: traits.densityKgM3, modulusGPa: traits.modulusGPa },
    limits: { ...traits.limits },
    tolerance: { shade: SHADE_TOLERANCE[traits.shade], ...traits.tolerance },
    leaf: { ...traits.leaf, shape: { ...traits.leaf.shape }, color: { ...traits.leaf.color } },
    bark: { ...traits.bark },
    reproduction: { ...traits.reproduction },
    phenology: { ...traits.phenology },
    provenance: {
      names: { source: "usda-plants" },
      architecture: { source: traits.source },
      limits: { source: traits.source },
      tolerance: { source: "usda-plants" },
      leaf: { source: traits.source },
      wood: { source: "prior" },
      bark: { source: traits.source },
      reproduction: { source: traits.source },
      phenology: { source: "prior" },
      growth: fitted,
      carbon: fitted,
    },
  };
}
