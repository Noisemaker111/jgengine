import { habitHeightAt20M, habitHeightCeilingM, type HabitReference } from "../../packages/core/src/plants/species/habitReference";
import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";
import { readRaw, type RawSource } from "./rawSources";
import type { FitParameter } from "./speciesFit";
import { FIT_PARAMETERS } from "./speciesFit";
import type { TrialScore } from "./speciesScore";
import { ALTERNATE, bark, broadleaf, SHADE_TOLERANCE, spring, type SpeciesTraits } from "./speciesTraits";

/** Palms and tree ferns grow one unbranched stem (Corner's model, Hallé, Oldeman & Tomlinson 1978). */
const CORNER = { model: "corner", phyllotaxis: "spiral", divergence: 137.5 } as const;

/** Frond or fan leaves, one per metamer; evergreen when they outlive a year. */
function frond(kind: "frond" | "fan", sizeCm: number, aspect: number, lobes: number, lobeDepth: number, petioleFraction: number, lifespanYears: number, summer: string, autumn = summer, sla = 8): SpeciesTraits["leaf"] {
  return {
    shape: { kind, lobes, lobeDepth, aspect, petioleFraction },
    sizeCm,
    sla,
    lifespanYears,
    leavesPerNode: 1,
    color: { spring: summer, summer, autumn, autumnShade: autumn },
  };
}

/** Phenology of an evergreen: leaves all year, a spring flush on the usual forcing. */
const EVERGREEN: SpeciesTraits["phenology"] = { forcingBaseC: 5, forcingSum: 150, chillingDays: 0, senescencePhotoperiodH: 0 };
import type { Trial } from "./speciesTrial";

/**
 * A shrub, palm, fern or herb: no forest inventory measures it, so its traits come from USDA PLANTS
 * and NRCS plant guides and its growth is fitted to PLANTS heights rather than FIA site trees.
 */
export interface HabitTraits extends Pick<SpeciesTraits, "id" | "exportName" | "scientific" | "common" | "usda" | "prior" | "architecture" | "lateralBudsPerNode" | "shade" | "tolerance" | "modulusGPa" | "leaf" | "bark" | "reproduction" | "phenology"> {
  habit: "shrub" | "palm" | "fern";
  /** Stems a seedling sets at its collar. */
  basalStems: number;
  /** Years a palm or fern frond stays on the shoot that grew it (growth.spurYears). */
  frondYears?: number;
  /** Crown width over height the fit holds the plant to; unchecked when absent. */
  widthToHeight?: readonly [number, number];
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
  leaf: broadleaf("ovate", 6, 0.45, 0, 0, 1, ["#b8352a", "#c8602e"], 18),
  bark: bark("smooth", 60, 0.1, "#7a6658"),
  reproduction: { firstFlowerYears: 3, flowerColor: "#f4f1e4", fruitColor: "#3b4f8f", seedMassMg: 0.4 },
  phenology: spring(220),
  widthToHeight: [0.7, 1.5],
  source: "usda-plant-guides",
};

/**
 * Coconut palm (NRCS and Hawaii plant guides: a single grey stem to 25 m, a crown of 25 to 35 pinnate
 * fronds 4 to 6 m long with 200 or more leaflets, about one new frond a month).
 */
const COCOS_NUCIFERA: HabitTraits = {
  id: "cocos-nucifera",
  exportName: "COCOS_NUCIFERA",
  scientific: "Cocos nucifera L.",
  common: { en: "coconut palm", fr: "cocotier" },
  usda: "CONU",
  habit: "palm",
  prior: "pinus-strobus",
  architecture: CORNER,
  lateralBudsPerNode: 0,
  basalStems: 1,
  frondYears: 2,
  shade: "very intolerant",
  tolerance: { drought: 0.5, frost: 0.05, waterlogging: 0.4 },
  limits: { maxAgeYears: 90, maxHeightM: 30, maxDbhCm: 45, maxCrownRadiusM: 6 },
  densityKgM3: 500,
  modulusGPa: 11,
  leaf: frond("frond", 500, 0.32, 100, 0.55, 0.22, 2.5, "#4d7a2a"),
  bark: bark("smooth", 999, 0.05, "#8a7d6b"),
  reproduction: { firstFlowerYears: 6, flowerColor: "#e8d98a", fruitColor: "#6b8a2e", seedMassMg: 400000 },
  phenology: EVERGREEN,
  source: "usda-plant-guides",
};

/**
 * Cabbage palm (NRCS plant guide: a single stem to 27 m that stays a stemless rosette for its first
 * decade or more, and a round crown of costapalmate fan leaves on petioles as long as the blade).
 */
const SABAL_PALMETTO: HabitTraits = {
  id: "sabal-palmetto",
  exportName: "SABAL_PALMETTO",
  scientific: "Sabal palmetto (Walter) Lodd. ex Schult. & Schult. f.",
  common: { en: "cabbage palm", fr: "palmier chou" },
  usda: "SAPA",
  habit: "palm",
  prior: "pinus-strobus",
  architecture: CORNER,
  lateralBudsPerNode: 0,
  basalStems: 1,
  frondYears: 3,
  shade: "intermediate",
  tolerance: { drought: 0.6, frost: 0.35, waterlogging: 0.7 },
  limits: { maxAgeYears: 150, maxHeightM: 28, maxDbhCm: 45, maxCrownRadiusM: 4 },
  densityKgM3: 400,
  modulusGPa: 8,
  leaf: frond("fan", 300, 1, 40, 0.6, 0.5, 3, "#4f6f35"),
  bark: bark("fibrous", 999, 0.1, "#7d7466"),
  reproduction: { firstFlowerYears: 15, flowerColor: "#efe8c8", fruitColor: "#1f1b17", seedMassMg: 120 },
  phenology: EVERGREEN,
  source: "usda-plant-guides",
};

/**
 * Hawaiian tree fern, hapu'u (PLANTS: a single fibrous trunk a few metres tall under a crown of
 * bipinnate fronds 2 to 4 m long, in wet forest understory).
 */
const CIBOTIUM_GLAUCUM: HabitTraits = {
  id: "cibotium-glaucum",
  exportName: "CIBOTIUM_GLAUCUM",
  scientific: "Cibotium glaucum (Sm.) Hook. & Arn.",
  common: { en: "Hawaiian tree fern", fr: "fougère arborescente d'Hawaï" },
  usda: "CIGL",
  habit: "fern",
  prior: "pinus-strobus",
  architecture: CORNER,
  lateralBudsPerNode: 0,
  basalStems: 1,
  frondYears: 2,
  shade: "tolerant",
  tolerance: { drought: 0.2, frost: 0.05, waterlogging: 0.5 },
  limits: { maxAgeYears: 200, maxHeightM: 5, maxDbhCm: 40, maxCrownRadiusM: 3.5 },
  densityKgM3: 300,
  modulusGPa: 4,
  leaf: frond("frond", 280, 0.45, 22, 0.35, 0.3, 2, "#5f8f3a"),
  bark: bark("fibrous", 999, 0.2, "#5b4636"),
  reproduction: { firstFlowerYears: 999, seedMassMg: 0.0001 },
  phenology: EVERGREEN,
  widthToHeight: [0.8, 2.5],
  source: "usda-plant-guides",
};

/**
 * Bracken (PLANTS: a rhizomatous fern to 2 m; broad triangular fronds on stiff upright stipes, dying
 * back each autumn to brown).
 */
const PTERIDIUM_AQUILINUM: HabitTraits = {
  id: "pteridium-aquilinum",
  exportName: "PTERIDIUM_AQUILINUM",
  scientific: "Pteridium aquilinum (L.) Kuhn",
  common: { en: "bracken", fr: "fougère-aigle" },
  usda: "PTAQ",
  habit: "fern",
  prior: "pinus-strobus",
  architecture: CORNER,
  lateralBudsPerNode: 0,
  basalStems: 1,
  frondYears: 1,
  shade: "intermediate",
  tolerance: { drought: 0.5, frost: 0.7, waterlogging: 0.2 },
  limits: { maxAgeYears: 60, maxHeightM: 2.5, maxDbhCm: 3, maxCrownRadiusM: 1.6 },
  densityKgM3: 200,
  modulusGPa: 1,
  leaf: frond("frond", 220, 0.75, 12, 0.3, 0.45, 0.5, "#5c8a2c", "#9a6a30"),
  bark: bark("smooth", 999, 0, "#6b5a3a"),
  reproduction: { firstFlowerYears: 999, seedMassMg: 0.0001 },
  phenology: spring(200, 12),
  widthToHeight: [0.8, 2.5],
  source: "usda-plant-guides",
};

/**
 * Western sword fern (PLANTS and NRCS plant guide: an evergreen clump to about 1 m of narrow, once
 * pinnate fronds that fountain out from one crown).
 */
const POLYSTICHUM_MUNITUM: HabitTraits = {
  id: "polystichum-munitum",
  exportName: "POLYSTICHUM_MUNITUM",
  scientific: "Polystichum munitum (Kaulf.) C. Presl",
  common: { en: "western sword fern", fr: "polystic à épées" },
  usda: "POMU",
  habit: "fern",
  prior: "pinus-strobus",
  architecture: CORNER,
  lateralBudsPerNode: 0,
  basalStems: 1,
  frondYears: 1,
  shade: "very tolerant",
  tolerance: { drought: 0.4, frost: 0.6, waterlogging: 0.3 },
  limits: { maxAgeYears: 100, maxHeightM: 1.8, maxDbhCm: 3, maxCrownRadiusM: 1.3 },
  densityKgM3: 200,
  modulusGPa: 1,
  leaf: frond("frond", 120, 0.2, 30, 0.2, 0.15, 2, "#2f5a26"),
  bark: bark("smooth", 999, 0, "#5a4a32"),
  reproduction: { firstFlowerYears: 999, seedMassMg: 0.0001 },
  phenology: EVERGREEN,
  widthToHeight: [0.8, 2.5],
  source: "usda-plant-guides",
};

/** Every non-tree species the importer knows. */
export const HABIT_TRAITS: readonly HabitTraits[] = [VACCINIUM_CORYMBOSUM, COCOS_NUCIFERA, SABAL_PALMETTO, CIBOTIUM_GLAUCUM, PTERIDIUM_AQUILINUM, POLYSTICHUM_MUNITUM];

/** Growth and carbon a shrub fit searches: the tree parameters plus how long a stem lives. */
export const HABIT_FIT_PARAMETERS: readonly FitParameter[] = [...FIT_PARAMETERS, { path: "growth.stemLifespanYears", lo: 4, hi: 30 }];

/**
 * Growth and carbon a palm or fern fit searches: one unbranched stem, so only how fast it lays down
 * fronds and stem and the carbon that pays for them.
 */
const SINGLE_STEM_FIT_PARAMETERS: readonly FitParameter[] = [
  { path: "growth.internodeMax", lo: 0.002, hi: 0.3, log: true },
  { path: "growth.maxMetamersPerShoot", lo: 2, hi: 40, integer: true },
  { path: "growth.establishmentYears", lo: 0, hi: 25 },
  { path: "growth.frondEstablishmentYears", lo: 1, hi: 25 },
  { path: "growth.budLightThreshold", lo: 0.02, hi: 0.2, log: true },
  { path: "carbon.lueGPerMJ", lo: 1, hi: 5, log: true },
  { path: "carbon.lightHalfSaturation", lo: 0.2, hi: 1.5, log: true },
  { path: "carbon.respiration", lo: 0.3, hi: 3, log: true },
  { path: "carbon.sapwoodPerFoliage", lo: 0.00005, hi: 0.005, log: true },
  // A palm stem never retires sapwood, so how much of it respires sets how tall the palm can feed.
  { path: "carbon.sapwoodRespiration", lo: 0.0005, hi: 0.03, log: true },
  { path: "carbon.hydraulicExponent", lo: 1, hi: 8, integer: true },
  { path: "carbon.hydraulicHeightShare", lo: 0.4, hi: 1 },
];

/** The parameters a habit species' fit searches. */
export function habitFitParameters(traits: HabitTraits): readonly FitParameter[] {
  return traits.habit === "shrub" ? HABIT_FIT_PARAMETERS : SINGLE_STEM_FIT_PARAMETERS;
}

/**
 * Carbon a habit fit starts from when the species has no record yet: a tree's, with a palm's or fern's
 * leaf upkeep lowered so a seedling carrying its first fronds lives long enough for the fit to steer it.
 */
export function startingHabitCarbon(traits: HabitTraits, prior: PlantSpecies["carbon"]): PlantSpecies["carbon"] {
  return traits.habit === "shrub" ? { ...prior } : { ...prior, respiration: 0.5 };
}

/** Growth a habit fit starts from when the species has no record yet. */
export function startingHabitGrowth(traits: HabitTraits, prior: PlantSpecies["growth"]): PlantSpecies["growth"] {
  if (traits.habit === "shrub") return { ...prior, stemLifespanYears: 10 };
  return { ...prior, internodeMax: traits.habit === "palm" ? 0.05 : 0.01, maxMetamersPerShoot: 12, establishmentYears: 0, frondEstablishmentYears: traits.habit === "palm" ? 8 : 3, tropism: { ...prior.tropism } };
}

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
  const feetOrNull = (name: string): number | null => {
    const read = Number(value(name));
    return Number.isFinite(read) && read > 0 ? Math.round(read * FOOT_M * 100) / 100 : null;
  };
  const feet = (name: string): number => {
    const read = feetOrNull(name);
    if (read === null) throw new Error(`PLANTS ${traits.usda} has no "${name}"`);
    return read;
  };
  const rate = value("Growth Rate");
  return {
    speciesId: traits.id,
    usda: traits.usda,
    heightAt20M: feetOrNull("Height at 20 Years, Maximum (feet)"),
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
 * Misfit of a habit trial against PLANTS: height at 20 years (the mature height for a fern PLANTS
 * gives no 20-year height for), held under the mature height at 40, the species' crown shape inside
 * its crown limit, and (for a multi-stemmed shrub) a clump of live stems.
 */
export function scoreHabitTrial(reference: HabitReference, traits: HabitTraits, trial: Trial): TrialScore {
  const maxCrownRadiusM = traits.limits.maxCrownRadiusM;
  const height20 = habitHeightAt20M(reference);
  const ceiling = habitHeightCeilingM(reference);
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
    add("height20", sq(logRatio(r20.heightM, height20) / 0.08) + hinge(Math.abs(logRatio(r20.heightM, height20)), 0, 0.11, 0.01));
    // A slow palm is still far from its mature height at 40 years, so it need only keep its 20-year height.
    add("height40", hinge(r40.heightM / ceiling, Math.min(0.85, height20 / ceiling), 1.1, 0.05));
    if (reference.heightAt20M !== null) add("height10", hinge(r10.heightM / r20.heightM, 0.3, 0.95, 0.05));
    for (const r of [r10, r20, r40]) {
      // A living crown at every age: a bare stem standing with no leaves is not the species.
      add("crown", hinge(r.crownWidthM / Math.max(0.1, r.heightM), 0.15, 1e6, 0.05));
      if (traits.widthToHeight !== undefined) add("width", hinge(r.crownWidthM / Math.max(0.1, r.heightM), traits.widthToHeight[0], traits.widthToHeight[1], 0.1));
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
    growth: { ...growth, basalStems: traits.basalStems, lateralBudsPerNode: traits.lateralBudsPerNode, ...(traits.frondYears === undefined ? {} : { spurYears: traits.frondYears }), tropism: { ...growth.tropism } },
    // Palms and ferns have no cambium, so their stems never thicken once built.
    carbon: traits.habit === "shrub" ? { ...carbon } : { ...carbon, sapwoodTurnover: 0 },
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
