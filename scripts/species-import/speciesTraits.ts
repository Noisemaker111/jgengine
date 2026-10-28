import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";

/** Silvics of North America shade tolerance classes (Burns & Honkala 1990). */
export type ShadeClass = "very tolerant" | "tolerant" | "intermediate" | "intolerant" | "very intolerant";

/** Crown form the fit holds a species to: where along the stem it carries its spread. */
export type CrownForm = "decurrent" | "excurrent";

/**
 * What the importer needs to know about one species beyond the downloaded tables: its ids in each
 * source and the traits read from Silvics of North America, the Wood Handbook and USDA PLANTS. Growth
 * and carbon parameters are not here; the fit finds them.
 */
export interface SpeciesTraits {
  id: string;
  exportName: string;
  scientific: string;
  common: { en: string; fr: string };
  usda: string;
  /** FIA species code: site trees, wood specific gravity and the FVS crown-width equations. */
  fiaCode: number;
  /** Carmean 1989 (NC-128) curve number on total age, from FVS Lake States `htcalc.f`; absent for western species. */
  carmeanCurve?: number;
  /** Years to breast height (Silvics) for a species without a Carmean curve. */
  yearsToBreastHeight?: number;
  /** Site index (feet at 50 years) the site trees are centred on; their median when absent. */
  siteIndexFt?: number;
  /** FIA state abbreviations whose site trees describe the species' range. */
  states: readonly string[];
  form: CrownForm;
  /** Fitted species the fit starts from. */
  prior: string;
  architecture: PlantSpecies["architecture"];
  lateralBudsPerNode: number;
  shade: ShadeClass;
  tolerance: { drought: number; frost: number; waterlogging: number };
  limits: { maxAgeYears: number; maxHeightM: number; maxDbhCm: number };
  /** Green modulus of elasticity, GPa (Wood Handbook table 5-3a). */
  modulusGPa: number;
  leaf: PlantSpecies["leaf"];
  bark: PlantSpecies["bark"];
  reproduction: PlantSpecies["reproduction"];
  phenology: PlantSpecies["phenology"];
}

const LAKE_STATES = ["WI", "MI", "MN"] as const;

/** Silvics shade class as the record's 0..1 tolerance. */
export const SHADE_TOLERANCE: Readonly<Record<ShadeClass, number>> = {
  "very tolerant": 0.9,
  tolerant: 0.7,
  intermediate: 0.5,
  intolerant: 0.3,
  "very intolerant": 0.1,
};

export const SPECIES_TRAITS: readonly SpeciesTraits[] = [
  {
    id: "acer-saccharum",
    exportName: "ACER_SACCHARUM",
    scientific: "Acer saccharum Marshall",
    common: { en: "sugar maple", fr: "érable à sucre" },
    usda: "ACSA3",
    fiaCode: 318,
    carmeanCurve: 3,
    siteIndexFt: 65,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "acer-saccharum",
    architecture: { model: "rauh", phyllotaxis: "opposite", divergence: 90 },
    lateralBudsPerNode: 2,
    shade: "very tolerant",
    tolerance: { drought: 0.4, frost: 0.9, waterlogging: 0.2 },
    limits: { maxAgeYears: 400, maxHeightM: 33, maxDbhCm: 120 },
    modulusGPa: 10.7,
    leaf: {
      shape: { kind: "lobed", lobes: 5, lobeDepth: 0.45, aspect: 1, petioleFraction: 0.35 },
      sizeCm: 12,
      sla: 22,
      lifespanYears: 0.5,
      leavesPerNode: 2,
      color: { spring: "#9cc25a", summer: "#3f7a2c", autumn: "#d9541e" },
    },
    bark: { kind: "furrowed", smoothUntilYears: 25, furrowDepth: 0.6, color: "#6d6359" },
    reproduction: { firstFlowerYears: 22, flowerColor: "#c9c96a", seedMassMg: 65 },
    phenology: { forcingBaseC: 5, forcingSum: 150, chillingDays: 60, senescencePhotoperiodH: 11.5 },
  },
  {
    id: "pinus-strobus",
    exportName: "PINUS_STROBUS",
    scientific: "Pinus strobus L.",
    common: { en: "eastern white pine", fr: "pin blanc" },
    usda: "PIST",
    fiaCode: 129,
    carmeanCurve: 103,
    siteIndexFt: 65,
    states: LAKE_STATES,
    form: "excurrent",
    prior: "pinus-strobus",
    architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
    lateralBudsPerNode: 5,
    shade: "intermediate",
    tolerance: { drought: 0.6, frost: 0.9, waterlogging: 0.3 },
    limits: { maxAgeYears: 450, maxHeightM: 50, maxDbhCm: 150 },
    modulusGPa: 6.8,
    leaf: {
      shape: { kind: "needle", lobes: 0, lobeDepth: 0, aspect: 0.02, petioleFraction: 0.1 },
      sizeCm: 10,
      sla: 12,
      lifespanYears: 2.5,
      leavesPerNode: 6,
      color: { spring: "#7fa86a", summer: "#3d6b4a", autumn: "#4a6b45" },
    },
    bark: { kind: "furrowed", smoothUntilYears: 20, furrowDepth: 0.7, color: "#5a4f47" },
    reproduction: { firstFlowerYears: 10, seedMassMg: 17 },
    phenology: { forcingBaseC: 5, forcingSum: 200, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
  {
    id: "acer-rubrum",
    exportName: "ACER_RUBRUM",
    scientific: "Acer rubrum L.",
    common: { en: "red maple", fr: "érable rouge" },
    usda: "ACRU",
    fiaCode: 316,
    carmeanCurve: 1,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "acer-saccharum",
    architecture: { model: "rauh", phyllotaxis: "opposite", divergence: 90 },
    lateralBudsPerNode: 2,
    shade: "tolerant",
    tolerance: { drought: 0.6, frost: 0.85, waterlogging: 0.8 },
    limits: { maxAgeYears: 150, maxHeightM: 30, maxDbhCm: 120 },
    modulusGPa: 9.6,
    leaf: {
      shape: { kind: "lobed", lobes: 3, lobeDepth: 0.3, aspect: 0.95, petioleFraction: 0.35 },
      sizeCm: 9,
      sla: 22,
      lifespanYears: 0.5,
      leavesPerNode: 2,
      color: { spring: "#a9c46c", summer: "#4b7b34", autumn: "#c4271d" },
    },
    bark: { kind: "plated", smoothUntilYears: 30, furrowDepth: 0.35, color: "#7d7a74" },
    reproduction: { firstFlowerYears: 4, flowerColor: "#b02a2a", seedMassMg: 20 },
    phenology: { forcingBaseC: 5, forcingSum: 120, chillingDays: 60, senescencePhotoperiodH: 11.5 },
  },
  {
    id: "quercus-rubra",
    exportName: "QUERCUS_RUBRA",
    scientific: "Quercus rubra L.",
    common: { en: "northern red oak", fr: "chêne rouge" },
    usda: "QURU",
    fiaCode: 833,
    carmeanCurve: 48,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "acer-saccharum",
    architecture: { model: "rauh", phyllotaxis: "spiral", divergence: 144 },
    lateralBudsPerNode: 1,
    shade: "intermediate",
    tolerance: { drought: 0.6, frost: 0.85, waterlogging: 0.2 },
    limits: { maxAgeYears: 400, maxHeightM: 30, maxDbhCm: 150 },
    modulusGPa: 9.3,
    leaf: {
      shape: { kind: "lobed", lobes: 9, lobeDepth: 0.5, aspect: 0.7, petioleFraction: 0.15 },
      sizeCm: 15,
      sla: 18,
      lifespanYears: 0.5,
      leavesPerNode: 1,
      color: { spring: "#a3b85c", summer: "#3e6b2e", autumn: "#9e2b1d" },
    },
    bark: { kind: "furrowed", smoothUntilYears: 20, furrowDepth: 0.5, color: "#4f4a45" },
    reproduction: { firstFlowerYears: 25, seedMassMg: 3500 },
    phenology: { forcingBaseC: 5, forcingSum: 220, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
  {
    id: "betula-papyrifera",
    exportName: "BETULA_PAPYRIFERA",
    scientific: "Betula papyrifera Marshall",
    common: { en: "paper birch", fr: "bouleau à papier" },
    usda: "BEPA",
    fiaCode: 375,
    carmeanCurve: 9,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "acer-saccharum",
    architecture: { model: "rauh", phyllotaxis: "spiral", divergence: 120 },
    lateralBudsPerNode: 1,
    shade: "intolerant",
    tolerance: { drought: 0.4, frost: 0.95, waterlogging: 0.3 },
    limits: { maxAgeYears: 140, maxHeightM: 24, maxDbhCm: 75 },
    modulusGPa: 8.1,
    leaf: {
      shape: { kind: "ovate", lobes: 0, lobeDepth: 0, aspect: 0.65, petioleFraction: 0.25 },
      sizeCm: 7,
      sla: 25,
      lifespanYears: 0.5,
      leavesPerNode: 2,
      color: { spring: "#b5cf6a", summer: "#4f7d34", autumn: "#e3b62b" },
    },
    bark: { kind: "peeling", smoothUntilYears: 200, furrowDepth: 0.1, color: "#e8e4dc" },
    reproduction: { firstFlowerYears: 15, seedMassMg: 0.3 },
    phenology: { forcingBaseC: 5, forcingSum: 120, chillingDays: 70, senescencePhotoperiodH: 12 },
  },
  {
    id: "populus-tremuloides",
    exportName: "POPULUS_TREMULOIDES",
    scientific: "Populus tremuloides Michx.",
    common: { en: "quaking aspen", fr: "peuplier faux-tremble" },
    usda: "POTR5",
    fiaCode: 746,
    carmeanCurve: 32,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "betula-papyrifera",
    architecture: { model: "rauh", phyllotaxis: "spiral", divergence: 144 },
    lateralBudsPerNode: 1,
    shade: "very intolerant",
    tolerance: { drought: 0.5, frost: 0.95, waterlogging: 0.3 },
    limits: { maxAgeYears: 150, maxHeightM: 27, maxDbhCm: 75 },
    modulusGPa: 5.9,
    leaf: {
      shape: { kind: "ovate", lobes: 0, lobeDepth: 0, aspect: 0.95, petioleFraction: 0.5 },
      sizeCm: 5,
      sla: 18,
      lifespanYears: 0.5,
      leavesPerNode: 2,
      color: { spring: "#b9d27a", summer: "#4c7a3d", autumn: "#e8c330" },
    },
    bark: { kind: "smooth", smoothUntilYears: 60, furrowDepth: 0.2, color: "#c9cdb7" },
    reproduction: { firstFlowerYears: 15, seedMassMg: 0.12 },
    phenology: { forcingBaseC: 5, forcingSum: 110, chillingDays: 60, senescencePhotoperiodH: 12 },
  },
  {
    id: "pinus-resinosa",
    exportName: "PINUS_RESINOSA",
    scientific: "Pinus resinosa Aiton",
    common: { en: "red pine", fr: "pin rouge" },
    usda: "PIRE",
    fiaCode: 125,
    carmeanCurve: 95,
    states: LAKE_STATES,
    form: "excurrent",
    prior: "pinus-strobus",
    architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
    lateralBudsPerNode: 5,
    shade: "intolerant",
    tolerance: { drought: 0.7, frost: 0.95, waterlogging: 0.1 },
    limits: { maxAgeYears: 350, maxHeightM: 37, maxDbhCm: 120 },
    modulusGPa: 8.8,
    leaf: {
      shape: { kind: "needle", lobes: 0, lobeDepth: 0, aspect: 0.02, petioleFraction: 0.1 },
      sizeCm: 13,
      sla: 9,
      lifespanYears: 4.5,
      leavesPerNode: 6,
      color: { spring: "#86a96d", summer: "#38633f", autumn: "#3f6a44" },
    },
    bark: { kind: "plated", smoothUntilYears: 15, furrowDepth: 0.4, color: "#8b5a3c" },
    reproduction: { firstFlowerYears: 15, seedMassMg: 8.7 },
    phenology: { forcingBaseC: 5, forcingSum: 200, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
  {
    id: "abies-balsamea",
    exportName: "ABIES_BALSAMEA",
    scientific: "Abies balsamea (L.) Mill.",
    common: { en: "balsam fir", fr: "sapin baumier" },
    usda: "ABBA",
    fiaCode: 12,
    carmeanCurve: 55,
    states: LAKE_STATES,
    form: "excurrent",
    prior: "picea-glauca",
    architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
    lateralBudsPerNode: 4,
    shade: "very tolerant",
    tolerance: { drought: 0.3, frost: 0.95, waterlogging: 0.4 },
    limits: { maxAgeYears: 200, maxHeightM: 23, maxDbhCm: 60 },
    modulusGPa: 8.6,
    leaf: {
      shape: { kind: "needle", lobes: 0, lobeDepth: 0, aspect: 0.08, petioleFraction: 0.05 },
      sizeCm: 2,
      sla: 11.5,
      lifespanYears: 8,
      leavesPerNode: 10,
      color: { spring: "#7fb07a", summer: "#2f5a3a", autumn: "#2f5a3a" },
    },
    bark: { kind: "smooth", smoothUntilYears: 40, furrowDepth: 0.2, color: "#7a7570" },
    reproduction: { firstFlowerYears: 20, seedMassMg: 7.5 },
    phenology: { forcingBaseC: 5, forcingSum: 230, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
  {
    id: "tilia-americana",
    exportName: "TILIA_AMERICANA",
    scientific: "Tilia americana L.",
    common: { en: "American basswood", fr: "tilleul d'Amérique" },
    usda: "TIAM",
    fiaCode: 951,
    carmeanCurve: 51,
    states: LAKE_STATES,
    form: "decurrent",
    prior: "acer-saccharum",
    architecture: { model: "troll", phyllotaxis: "alternate", divergence: 180 },
    lateralBudsPerNode: 1,
    shade: "tolerant",
    tolerance: { drought: 0.4, frost: 0.9, waterlogging: 0.3 },
    limits: { maxAgeYears: 200, maxHeightM: 30, maxDbhCm: 120 },
    modulusGPa: 7.2,
    leaf: {
      shape: { kind: "ovate", lobes: 0, lobeDepth: 0, aspect: 0.85, petioleFraction: 0.3 },
      sizeCm: 14,
      sla: 25,
      lifespanYears: 0.5,
      leavesPerNode: 1,
      color: { spring: "#a8c86a", summer: "#3f7334", autumn: "#c9b23b" },
    },
    bark: { kind: "furrowed", smoothUntilYears: 20, furrowDepth: 0.5, color: "#5c564f" },
    reproduction: { firstFlowerYears: 15, flowerColor: "#e6dc8c", seedMassMg: 90 },
    phenology: { forcingBaseC: 5, forcingSum: 230, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
  {
    id: "picea-glauca",
    exportName: "PICEA_GLAUCA",
    scientific: "Picea glauca (Moench) Voss",
    common: { en: "white spruce", fr: "épinette blanche" },
    usda: "PIGL",
    fiaCode: 94,
    carmeanCurve: 67,
    states: LAKE_STATES,
    form: "excurrent",
    prior: "pinus-resinosa",
    architecture: { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 },
    lateralBudsPerNode: 4,
    shade: "tolerant",
    tolerance: { drought: 0.5, frost: 1, waterlogging: 0.3 },
    limits: { maxAgeYears: 250, maxHeightM: 30, maxDbhCm: 75 },
    modulusGPa: 7.9,
    leaf: {
      shape: { kind: "needle", lobes: 0, lobeDepth: 0, aspect: 0.1, petioleFraction: 0.05 },
      sizeCm: 2,
      sla: 8.1,
      lifespanYears: 7,
      leavesPerNode: 10,
      color: { spring: "#8cb28a", summer: "#3b5e4f", autumn: "#3b5e4f" },
    },
    bark: { kind: "scaly", smoothUntilYears: 25, furrowDepth: 0.3, color: "#7a6f66" },
    reproduction: { firstFlowerYears: 30, seedMassMg: 2 },
    phenology: { forcingBaseC: 5, forcingSum: 200, chillingDays: 60, senescencePhotoperiodH: 11 },
  },
];
