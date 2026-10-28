import type { PlantSpecies } from "../../packages/core/src/plants/species/plantSpecies";

/** Silvics of North America shade tolerance classes (Burns & Honkala 1990). */
export type ShadeClass = "very tolerant" | "tolerant" | "intermediate" | "intolerant" | "very intolerant";

/**
 * Crown form the fit holds a species to: where along the stem it carries its spread. Columnar is a
 * narrow crown of near-even width; weeping is excurrent with shoots hanging below the horizontal.
 */
export type CrownForm = "decurrent" | "excurrent" | "columnar" | "weeping";

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
  /** Stems a seedling sets at its base (Silvics: sprouts into clumps); 1 when absent. */
  basalStems?: number;
  /** Largest shoot set point, degrees from vertical; above 90 for hanging shoots, 90 when absent. */
  setpointMax?: number;
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

type Leaf = SpeciesTraits["leaf"];
type Bark = SpeciesTraits["bark"];

export function broadleaf(kind: "lobed" | "ovate" | "lanceolate", sizeCm: number, aspect: number, lobes: number, lobeDepth: number, leavesPerNode: number, autumn: string, sla = 20): Leaf {
  return {
    shape: { kind, lobes, lobeDepth, aspect, petioleFraction: kind === "lobed" ? 0.2 : 0.15 },
    sizeCm,
    sla,
    lifespanYears: 0.5,
    leavesPerNode,
    color: { spring: "#a6c463", summer: "#3f6f30", autumn },
  };
}

/** Needle or scale foliage; scale leaves are sized by their spray segment, as the model grows them. */
function needles(sizeCm: number, lifespanYears: number, leavesPerNode: number, summer: string, sla = 10, kind: "needle" | "scale" = "needle"): Leaf {
  return {
    shape: { kind, lobes: 0, lobeDepth: 0, aspect: kind === "scale" ? 0.3 : 0.03, petioleFraction: 0.05 },
    sizeCm,
    sla,
    lifespanYears,
    leavesPerNode,
    color: { spring: "#88b070", summer, autumn: summer },
  };
}

export const bark = (kind: Bark["kind"], smoothUntilYears: number, furrowDepth: number, color: string): Bark => ({ kind, smoothUntilYears, furrowDepth, color });
export const spring = (forcingSum: number, senescencePhotoperiodH = 11): SpeciesTraits["phenology"] => ({ forcingBaseC: 5, forcingSum, chillingDays: 60, senescencePhotoperiodH });

const OAK_ARCH = { model: "rauh", phyllotaxis: "spiral", divergence: 144 } as const;
export const OPPOSITE = { model: "rauh", phyllotaxis: "opposite", divergence: 90 } as const;
export const ALTERNATE = { model: "rauh", phyllotaxis: "spiral", divergence: 144 } as const;
const DISTICHOUS = { model: "troll", phyllotaxis: "alternate", divergence: 180 } as const;
const WHORLED = { model: "rauh", phyllotaxis: "whorled", divergence: 137.5 } as const;
const MASSART = { model: "massart", phyllotaxis: "whorled", divergence: 137.5 } as const;

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
  // Oaks
  { id: "quercus-alba", exportName: "QUERCUS_ALBA", scientific: "Quercus alba L.", common: { en: "white oak", fr: "chêne blanc" }, usda: "QUAL", fiaCode: 802, carmeanCurve: 41, states: ["MO", "VA", "TN", "KY", "AR"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intermediate", tolerance: { drought: 0.6, frost: 0.85, waterlogging: 0.2 }, limits: { maxAgeYears: 600, maxHeightM: 30, maxDbhCm: 150 }, modulusGPa: 8.6, leaf: broadleaf("lobed", 15, 0.55, 7, 0.6, 1, "#8c3a24"), bark: bark("scaly", 20, 0.4, "#a39d93"), reproduction: { firstFlowerYears: 20, seedMassMg: 3500 }, phenology: spring(220) },
  { id: "quercus-velutina", exportName: "QUERCUS_VELUTINA", scientific: "Quercus velutina Lam.", common: { en: "black oak", fr: "chêne noir" }, usda: "QUVE", fiaCode: 837, carmeanCurve: 49, states: ["MO", "MI", "WI", "KY", "IL"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.7, frost: 0.85, waterlogging: 0.1 }, limits: { maxAgeYears: 200, maxHeightM: 25, maxDbhCm: 120 }, modulusGPa: 8.1, leaf: broadleaf("lobed", 15, 0.7, 7, 0.5, 1, "#8b2f1c"), bark: bark("furrowed", 15, 0.6, "#2f2b28"), reproduction: { firstFlowerYears: 20, seedMassMg: 2100 }, phenology: spring(220) },
  { id: "quercus-montana", exportName: "QUERCUS_MONTANA", scientific: "Quercus montana Willd.", common: { en: "chestnut oak", fr: "chêne châtaignier" }, usda: "QUMO4", fiaCode: 832, carmeanCurve: 46, states: ["VA", "TN", "PA", "KY", "WV"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intermediate", tolerance: { drought: 0.8, frost: 0.8, waterlogging: 0.1 }, limits: { maxAgeYears: 400, maxHeightM: 27, maxDbhCm: 120 }, modulusGPa: 9.4, leaf: broadleaf("ovate", 16, 0.45, 0, 0, 1, "#a8652a"), bark: bark("furrowed", 20, 0.9, "#4b443e"), reproduction: { firstFlowerYears: 20, seedMassMg: 6000 }, phenology: spring(220) },
  { id: "quercus-macrocarpa", exportName: "QUERCUS_MACROCARPA", scientific: "Quercus macrocarpa Michx.", common: { en: "bur oak", fr: "chêne à gros fruits" }, usda: "QUMA2", fiaCode: 823, carmeanCurve: 36, states: ["MN", "WI", "IA", "MI", "MO"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.9, frost: 0.9, waterlogging: 0.4 }, limits: { maxAgeYears: 400, maxHeightM: 30, maxDbhCm: 150 }, modulusGPa: 6.1, leaf: broadleaf("lobed", 20, 0.5, 7, 0.65, 1, "#9a6a2a"), bark: bark("furrowed", 10, 0.8, "#4d4741"), reproduction: { firstFlowerYears: 35, seedMassMg: 6000 }, phenology: spring(240) },
  { id: "quercus-coccinea", exportName: "QUERCUS_COCCINEA", scientific: "Quercus coccinea Münchh.", common: { en: "scarlet oak", fr: "chêne écarlate" }, usda: "QUCO2", fiaCode: 806, carmeanCurve: 42, states: ["MO", "WV", "KY", "TN", "VA"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "very intolerant", tolerance: { drought: 0.7, frost: 0.8, waterlogging: 0.1 }, limits: { maxAgeYears: 150, maxHeightM: 30, maxDbhCm: 100 }, modulusGPa: 10.2, leaf: broadleaf("lobed", 13, 0.75, 7, 0.75, 1, "#c0261c"), bark: bark("furrowed", 20, 0.4, "#45403b"), reproduction: { firstFlowerYears: 20, seedMassMg: 1800 }, phenology: spring(220) },
  // Maples, beech, ashes, birch
  { id: "acer-saccharinum", exportName: "ACER_SACCHARINUM", scientific: "Acer saccharinum L.", common: { en: "silver maple", fr: "érable argenté" }, usda: "ACSA2", fiaCode: 317, carmeanCurve: 4, states: ["WI", "IL", "MN", "MI", "IA"], form: "decurrent", basalStems: 3, prior: "acer-saccharum", architecture: OPPOSITE, lateralBudsPerNode: 2, shade: "intermediate", tolerance: { drought: 0.4, frost: 0.85, waterlogging: 0.9 }, limits: { maxAgeYears: 130, maxHeightM: 35, maxDbhCm: 150 }, modulusGPa: 6.5, leaf: broadleaf("lobed", 13, 1, 5, 0.7, 2, "#d8b23a", 25), bark: bark("peeling", 20, 0.3, "#8a847c"), reproduction: { firstFlowerYears: 11, flowerColor: "#a4442c", seedMassMg: 260 }, phenology: spring(100) },
  { id: "fagus-grandifolia", exportName: "FAGUS_GRANDIFOLIA", scientific: "Fagus grandifolia Ehrh.", common: { en: "American beech", fr: "hêtre à grandes feuilles" }, usda: "FAGR", fiaCode: 531, carmeanCurve: 11, states: ["MI", "NY", "PA", "ME", "WV"], form: "decurrent", prior: "acer-saccharum", architecture: DISTICHOUS, lateralBudsPerNode: 1, shade: "very tolerant", tolerance: { drought: 0.3, frost: 0.85, waterlogging: 0.2 }, limits: { maxAgeYears: 400, maxHeightM: 30, maxDbhCm: 120 }, modulusGPa: 9.5, leaf: broadleaf("ovate", 10, 0.5, 0, 0, 1, "#c9952f"), bark: bark("smooth", 400, 0.05, "#9a9a95"), reproduction: { firstFlowerYears: 40, seedMassMg: 280 }, phenology: spring(250) },
  { id: "fraxinus-pennsylvanica", exportName: "FRAXINUS_PENNSYLVANICA", scientific: "Fraxinus pennsylvanica Marshall", common: { en: "green ash", fr: "frêne rouge" }, usda: "FRPE", fiaCode: 544, carmeanCurve: 15, states: ["MI", "WI", "MN", "IL", "IN"], form: "decurrent", prior: "acer-saccharum", architecture: OPPOSITE, lateralBudsPerNode: 2, shade: "intermediate", tolerance: { drought: 0.6, frost: 0.9, waterlogging: 0.8 }, limits: { maxAgeYears: 120, maxHeightM: 25, maxDbhCm: 90 }, modulusGPa: 9.7, leaf: broadleaf("lanceolate", 25, 0.5, 0, 0, 2, "#d6c14a"), bark: bark("furrowed", 15, 0.5, "#6c665e"), reproduction: { firstFlowerYears: 10, seedMassMg: 30 }, phenology: spring(260) },
  { id: "betula-alleghaniensis", exportName: "BETULA_ALLEGHANIENSIS", scientific: "Betula alleghaniensis Britton", common: { en: "yellow birch", fr: "bouleau jaune" }, usda: "BEAL2", fiaCode: 371, carmeanCurve: 6, states: ["ME", "MI", "VT", "NY", "NH"], form: "decurrent", prior: "betula-papyrifera", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intermediate", tolerance: { drought: 0.3, frost: 0.95, waterlogging: 0.3 }, limits: { maxAgeYears: 300, maxHeightM: 30, maxDbhCm: 100 }, modulusGPa: 10.3, leaf: broadleaf("ovate", 10, 0.55, 0, 0, 2, "#e0bd2e"), bark: bark("peeling", 60, 0.2, "#c9b28a"), reproduction: { firstFlowerYears: 40, seedMassMg: 1 }, phenology: spring(150, 12) },
  { id: "fraxinus-americana", exportName: "FRAXINUS_AMERICANA", scientific: "Fraxinus americana L.", common: { en: "white ash", fr: "frêne blanc" }, usda: "FRAM2", fiaCode: 541, carmeanCurve: 13, states: ["WI", "NY", "MI", "PA", "IN"], form: "decurrent", prior: "acer-saccharum", architecture: OPPOSITE, lateralBudsPerNode: 2, shade: "intermediate", tolerance: { drought: 0.5, frost: 0.85, waterlogging: 0.2 }, limits: { maxAgeYears: 260, maxHeightM: 30, maxDbhCm: 120 }, modulusGPa: 9.9, leaf: broadleaf("lanceolate", 25, 0.5, 0, 0, 2, "#7a3f63"), bark: bark("furrowed", 15, 0.6, "#6e675f"), reproduction: { firstFlowerYears: 20, seedMassMg: 45 }, phenology: spring(270) },
  { id: "fraxinus-nigra", exportName: "FRAXINUS_NIGRA", scientific: "Fraxinus nigra Marshall", common: { en: "black ash", fr: "frêne noir" }, usda: "FRNI", fiaCode: 543, carmeanCurve: 14, states: ["MN", "WI", "MI"], form: "decurrent", prior: "acer-saccharum", architecture: OPPOSITE, lateralBudsPerNode: 2, shade: "intolerant", tolerance: { drought: 0.2, frost: 0.95, waterlogging: 0.9 }, limits: { maxAgeYears: 250, maxHeightM: 22, maxDbhCm: 60 }, modulusGPa: 7.2, leaf: broadleaf("lanceolate", 30, 0.45, 0, 0, 2, "#c7a83b"), bark: bark("scaly", 15, 0.3, "#8d877e"), reproduction: { firstFlowerYears: 30, seedMassMg: 60 }, phenology: spring(280) },
  // Other broadleaves
  { id: "liriodendron-tulipifera", exportName: "LIRIODENDRON_TULIPIFERA", scientific: "Liriodendron tulipifera L.", common: { en: "yellow-poplar", fr: "tulipier de Virginie" }, usda: "LITU", fiaCode: 621, carmeanCurve: 24, states: ["KY", "TN", "VA", "NC", "WV"], form: "excurrent", prior: "acer-saccharum", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.3, frost: 0.7, waterlogging: 0.2 }, limits: { maxAgeYears: 300, maxHeightM: 45, maxDbhCm: 180 }, modulusGPa: 8.4, leaf: broadleaf("lobed", 13, 1, 4, 0.25, 1, "#e5c537"), bark: bark("furrowed", 15, 0.5, "#7c766c"), reproduction: { firstFlowerYears: 15, flowerColor: "#e2b54a", seedMassMg: 30 }, phenology: spring(220) },
  { id: "prunus-serotina", exportName: "PRUNUS_SEROTINA", scientific: "Prunus serotina Ehrh.", common: { en: "black cherry", fr: "cerisier tardif" }, usda: "PRSE2", fiaCode: 762, carmeanCurve: 34, states: ["MI", "WI", "IN", "IL", "PA"], form: "decurrent", prior: "acer-saccharum", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.5, frost: 0.85, waterlogging: 0.2 }, limits: { maxAgeYears: 250, maxHeightM: 30, maxDbhCm: 100 }, modulusGPa: 9, leaf: broadleaf("lanceolate", 10, 0.35, 0, 0, 1, "#d4762c"), bark: bark("scaly", 20, 0.3, "#3d2f2a"), reproduction: { firstFlowerYears: 10, flowerColor: "#f3f1e6", seedMassMg: 90 }, phenology: spring(180) },
  { id: "populus-grandidentata", exportName: "POPULUS_GRANDIDENTATA", scientific: "Populus grandidentata Michx.", common: { en: "bigtooth aspen", fr: "peuplier à grandes dents" }, usda: "POGR4", fiaCode: 743, carmeanCurve: 32, states: ["WI", "MI", "MN"], form: "decurrent", prior: "populus-tremuloides", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "very intolerant", tolerance: { drought: 0.5, frost: 0.9, waterlogging: 0.2 }, limits: { maxAgeYears: 100, maxHeightM: 25, maxDbhCm: 75 }, modulusGPa: 7.7, leaf: broadleaf("ovate", 8, 0.8, 0, 0, 2, "#e4c03a", 18), bark: bark("smooth", 40, 0.3, "#b8b9a3"), reproduction: { firstFlowerYears: 15, seedMassMg: 0.1 }, phenology: spring(110, 12) },
  { id: "juglans-nigra", exportName: "JUGLANS_NIGRA", scientific: "Juglans nigra L.", common: { en: "black walnut", fr: "noyer noir" }, usda: "JUNI", fiaCode: 602, carmeanCurve: 16, states: ["MO", "WI", "IA", "IL", "IN"], form: "decurrent", prior: "quercus-rubra", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.4, frost: 0.8, waterlogging: 0.2 }, limits: { maxAgeYears: 250, maxHeightM: 30, maxDbhCm: 150 }, modulusGPa: 9.8, leaf: broadleaf("lanceolate", 45, 0.4, 0, 0, 1, "#d8c046"), bark: bark("furrowed", 15, 0.8, "#2f2a26"), reproduction: { firstFlowerYears: 20, seedMassMg: 11000 }, phenology: spring(320) },
  { id: "carya-ovata", exportName: "CARYA_OVATA", scientific: "Carya ovata (Mill.) K. Koch", common: { en: "shagbark hickory", fr: "caryer ovale" }, usda: "CAOV2", fiaCode: 407, carmeanCurve: 10, states: ["WI", "MO", "IA", "IN", "IL"], form: "decurrent", prior: "quercus-rubra", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intermediate", tolerance: { drought: 0.6, frost: 0.85, waterlogging: 0.2 }, limits: { maxAgeYears: 300, maxHeightM: 30, maxDbhCm: 90 }, modulusGPa: 10.8, leaf: broadleaf("lanceolate", 30, 0.45, 0, 0, 1, "#d9b22e"), bark: bark("peeling", 30, 0.6, "#6c655c"), reproduction: { firstFlowerYears: 40, seedMassMg: 5000 }, phenology: spring(300) },
  { id: "ulmus-americana", exportName: "ULMUS_AMERICANA", scientific: "Ulmus americana L.", common: { en: "American elm", fr: "orme d'Amérique" }, usda: "ULAM", fiaCode: 972, carmeanCurve: 53, states: ["WI", "MN", "IA", "MI", "MO"], form: "decurrent", prior: "acer-saccharum", architecture: DISTICHOUS, lateralBudsPerNode: 1, shade: "intermediate", tolerance: { drought: 0.6, frost: 0.9, waterlogging: 0.7 }, limits: { maxAgeYears: 300, maxHeightM: 35, maxDbhCm: 150 }, modulusGPa: 7.7, leaf: broadleaf("ovate", 12, 0.5, 0, 0, 1, "#d9bd3c"), bark: bark("furrowed", 15, 0.6, "#5e574f"), reproduction: { firstFlowerYears: 15, seedMassMg: 6 }, phenology: spring(150) },
  { id: "liquidambar-styraciflua", exportName: "LIQUIDAMBAR_STYRACIFLUA", scientific: "Liquidambar styraciflua L.", common: { en: "sweetgum", fr: "copalme d'Amérique" }, usda: "LIST2", fiaCode: 611, carmeanCurve: 19, states: ["MS", "AL", "SC", "NC", "AR"], form: "excurrent", prior: "acer-saccharum", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.5, frost: 0.6, waterlogging: 0.6 }, limits: { maxAgeYears: 200, maxHeightM: 37, maxDbhCm: 120 }, modulusGPa: 8.3, leaf: broadleaf("lobed", 13, 1, 5, 0.55, 1, "#a32a3a"), bark: bark("furrowed", 15, 0.5, "#57514a"), reproduction: { firstFlowerYears: 20, seedMassMg: 6 }, phenology: spring(220) },
  // Columnar and scale-leaved
  // Southern red oak stands in for eastern redcedar, whose narrow column the fit could not hold inside Tallo's crown widths.
  { id: "quercus-falcata", exportName: "QUERCUS_FALCATA", scientific: "Quercus falcata Michx.", common: { en: "southern red oak", fr: "chêne falqué" }, usda: "QUFA", fiaCode: 812, carmeanCurve: 36, states: ["AL", "TN", "GA", "AR"], form: "decurrent", prior: "quercus-rubra", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.7, frost: 0.6, waterlogging: 0.2 }, limits: { maxAgeYears: 200, maxHeightM: 30, maxDbhCm: 120 }, modulusGPa: 7.9, leaf: broadleaf("lobed", 18, 0.6, 5, 0.6, 1, "#9a4a24"), bark: bark("furrowed", 15, 0.6, "#3f3a34"), reproduction: { firstFlowerYears: 25, seedMassMg: 1100 }, phenology: spring(220) },
  { id: "thuja-occidentalis", exportName: "THUJA_OCCIDENTALIS", scientific: "Thuja occidentalis L.", common: { en: "northern white-cedar", fr: "thuya occidental" }, usda: "THOC2", fiaCode: 241, carmeanCurve: 126, states: ["MI", "MN", "WI", "ME"], form: "columnar", prior: "abies-balsamea", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very tolerant", tolerance: { drought: 0.4, frost: 1, waterlogging: 0.8 }, limits: { maxAgeYears: 400, maxHeightM: 18, maxDbhCm: 90 }, modulusGPa: 4.4, leaf: needles(2.5, 3, 12, "#4d6b3e", 7, "scale"), bark: bark("fibrous", 5, 0.4, "#8a6f5c"), reproduction: { firstFlowerYears: 20, seedMassMg: 1.3 }, phenology: spring(220) },
  // Pines
  { id: "pinus-taeda", exportName: "PINUS_TAEDA", scientific: "Pinus taeda L.", common: { en: "loblolly pine", fr: "pin à encens" }, usda: "PITA", fiaCode: 131, carmeanCurve: 109, states: ["GA", "AL", "SC", "MS", "NC"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 4, shade: "intolerant", tolerance: { drought: 0.5, frost: 0.5, waterlogging: 0.4 }, limits: { maxAgeYears: 300, maxHeightM: 40, maxDbhCm: 130 }, modulusGPa: 9.7, leaf: needles(18, 2, 6, "#3e6a3e", 9), bark: bark("plated", 10, 0.6, "#5c4537"), reproduction: { firstFlowerYears: 10, seedMassMg: 25 }, phenology: spring(180, 10.5) },
  // Two needles per node: a 35 cm needle carries a node as much foliage as loblolly's six 18 cm ones.
  { id: "pinus-palustris", exportName: "PINUS_PALUSTRIS", scientific: "Pinus palustris Mill.", common: { en: "longleaf pine", fr: "pin des marais" }, usda: "PIPA2", fiaCode: 121, carmeanCurve: 92, states: ["AL", "FL", "GA", "SC", "MS"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very intolerant", tolerance: { drought: 0.8, frost: 0.4, waterlogging: 0.3 }, limits: { maxAgeYears: 450, maxHeightM: 35, maxDbhCm: 100 }, modulusGPa: 11, leaf: needles(35, 2, 2, "#3f6b3a", 7), bark: bark("plated", 10, 0.5, "#6b4a35"), reproduction: { firstFlowerYears: 20, seedMassMg: 95 }, phenology: spring(180, 10.5) },
  { id: "pinus-echinata", exportName: "PINUS_ECHINATA", scientific: "Pinus echinata Mill.", common: { en: "shortleaf pine", fr: "pin jaune" }, usda: "PIEC2", fiaCode: 110, carmeanCurve: 78, states: ["AR", "MO", "AL", "GA", "MS"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 4, shade: "intolerant", tolerance: { drought: 0.7, frost: 0.6, waterlogging: 0.2 }, limits: { maxAgeYears: 300, maxHeightM: 33, maxDbhCm: 100 }, modulusGPa: 9.6, leaf: needles(10, 3, 6, "#3f6840", 9), bark: bark("plated", 10, 0.5, "#6e4c38"), reproduction: { firstFlowerYears: 20, seedMassMg: 10 }, phenology: spring(180, 10.5) },
  { id: "pinus-elliottii", exportName: "PINUS_ELLIOTTII", scientific: "Pinus elliottii Engelm.", common: { en: "slash pine", fr: "pin d'Elliott" }, usda: "PIEL", fiaCode: 111, carmeanCurve: 84, states: ["GA", "FL", "AL", "MS", "LA"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 4, shade: "intolerant", tolerance: { drought: 0.5, frost: 0.4, waterlogging: 0.6 }, limits: { maxAgeYears: 200, maxHeightM: 35, maxDbhCm: 90 }, modulusGPa: 10.5, leaf: needles(23, 2, 6, "#3e6c3c", 8), bark: bark("plated", 10, 0.5, "#6a4935"), reproduction: { firstFlowerYears: 10, seedMassMg: 33 }, phenology: spring(170, 10.5) },
  { id: "pinus-banksiana", exportName: "PINUS_BANKSIANA", scientific: "Pinus banksiana Lamb.", common: { en: "jack pine", fr: "pin gris" }, usda: "PIBA2", fiaCode: 105, carmeanCurve: 74, states: ["MI", "WI", "MN"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very intolerant", tolerance: { drought: 0.9, frost: 1, waterlogging: 0.1 }, limits: { maxAgeYears: 200, maxHeightM: 25, maxDbhCm: 60 }, modulusGPa: 7.4, leaf: needles(3, 3, 6, "#4d6e3e", 8), bark: bark("scaly", 10, 0.3, "#6b5546"), reproduction: { firstFlowerYears: 5, seedMassMg: 3.5 }, phenology: spring(180, 11) },
  // Virginia pine stands in for Scots pine, whose Vermont plantation curve the model could not follow past 74 years of site trees.
  { id: "pinus-virginiana", exportName: "PINUS_VIRGINIANA", scientific: "Pinus virginiana Mill.", common: { en: "Virginia pine", fr: "pin de Virginie" }, usda: "PIVI2", fiaCode: 132, carmeanCurve: 124, states: ["VA", "TN", "NC", "KY"], form: "excurrent", prior: "pinus-echinata", architecture: WHORLED, lateralBudsPerNode: 3, shade: "intolerant", tolerance: { drought: 0.8, frost: 0.7, waterlogging: 0.2 }, limits: { maxAgeYears: 150, maxHeightM: 25, maxDbhCm: 60 }, modulusGPa: 8.4, leaf: needles(5, 3, 6, "#4f6e3f", 8), bark: bark("scaly", 10, 0.3, "#6b5241"), reproduction: { firstFlowerYears: 5, seedMassMg: 8 }, phenology: spring(180, 10.5) },
  // Sand pine stands in for ponderosa pine: no fit held ponderosa's height and crown in range at 20, 50 and 100 years together.
  { id: "pinus-clausa", exportName: "PINUS_CLAUSA", scientific: "Pinus clausa (Chapm. ex Engelm.) Vasey ex Sarg.", common: { en: "sand pine", fr: "pin des sables" }, usda: "PICL", fiaCode: 107, carmeanCurve: 77, states: ["FL", "GA", "AL"], form: "excurrent", prior: "pinus-virginiana", architecture: WHORLED, lateralBudsPerNode: 3, shade: "intolerant", tolerance: { drought: 0.9, frost: 0.4, waterlogging: 0.1 }, limits: { maxAgeYears: 100, maxHeightM: 30, maxDbhCm: 60 }, modulusGPa: 9.6, leaf: needles(7, 3, 6, "#4a6a3c", 8), bark: bark("scaly", 10, 0.3, "#6e5a4c"), reproduction: { firstFlowerYears: 5, seedMassMg: 9 }, phenology: spring(180, 11) },
  { id: "pinus-contorta", exportName: "PINUS_CONTORTA", scientific: "Pinus contorta Douglas ex Loudon", common: { en: "lodgepole pine", fr: "pin tordu" }, usda: "PICO", fiaCode: 108, yearsToBreastHeight: 8, states: ["OR", "MT", "ID", "CO", "CA"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 4, shade: "very intolerant", tolerance: { drought: 0.7, frost: 1, waterlogging: 0.4 }, limits: { maxAgeYears: 400, maxHeightM: 35, maxDbhCm: 75 }, modulusGPa: 7.4, leaf: needles(5, 5, 6, "#3f6339", 6), bark: bark("scaly", 15, 0.2, "#6d5848"), reproduction: { firstFlowerYears: 6, seedMassMg: 4 }, phenology: spring(200, 11) },
  // Spruces, firs, hemlocks
  { id: "picea-mariana", exportName: "PICEA_MARIANA", scientific: "Picea mariana (Mill.) Britton, Sterns & Poggenb.", common: { en: "black spruce", fr: "épinette noire" }, usda: "PIMA", fiaCode: 95, carmeanCurve: 70, states: ["MN", "MI", "WI", "ME"], form: "columnar", prior: "picea-glauca", architecture: WHORLED, lateralBudsPerNode: 4, shade: "tolerant", tolerance: { drought: 0.4, frost: 1, waterlogging: 0.9 }, limits: { maxAgeYears: 250, maxHeightM: 20, maxDbhCm: 40 }, modulusGPa: 9.1, leaf: needles(1.2, 8, 10, "#34503f", 7), bark: bark("scaly", 20, 0.2, "#5e5149"), reproduction: { firstFlowerYears: 10, seedMassMg: 1.1 }, phenology: spring(200) },
  // Eastern cottonwood stands in for red spruce, whose suppressed start and fast middle years the model could not follow.
  { id: "populus-deltoides", exportName: "POPULUS_DELTOIDES", scientific: "Populus deltoides W. Bartram ex Marshall", common: { en: "eastern cottonwood", fr: "peuplier deltoïde" }, usda: "PODE3", fiaCode: 742, carmeanCurve: 30, states: ["IA", "MN", "IL", "IN", "MO"], form: "decurrent", prior: "populus-tremuloides", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "very intolerant", tolerance: { drought: 0.3, frost: 0.85, waterlogging: 0.8 }, limits: { maxAgeYears: 200, maxHeightM: 45, maxDbhCm: 180 }, modulusGPa: 7, leaf: broadleaf("ovate", 10, 0.9, 0, 0, 1, "#e0c43c", 18), bark: bark("furrowed", 15, 0.7, "#6f6a62"), reproduction: { firstFlowerYears: 10, seedMassMg: 1 }, phenology: spring(160, 12) },
  { id: "picea-sitchensis", exportName: "PICEA_SITCHENSIS", scientific: "Picea sitchensis (Bong.) Carrière", common: { en: "Sitka spruce", fr: "épinette de Sitka" }, usda: "PISI", fiaCode: 98, yearsToBreastHeight: 6, states: ["OR", "WA", "CA"], form: "excurrent", prior: "picea-glauca", architecture: WHORLED, lateralBudsPerNode: 4, shade: "tolerant", tolerance: { drought: 0.2, frost: 0.7, waterlogging: 0.5 }, limits: { maxAgeYears: 700, maxHeightM: 70, maxDbhCm: 300 }, modulusGPa: 8.5, leaf: needles(2.2, 7, 10, "#3f6a62", 6), bark: bark("scaly", 25, 0.2, "#7b6a5d"), reproduction: { firstFlowerYears: 25, seedMassMg: 2.2 }, phenology: spring(190) },
  { id: "picea-engelmannii", exportName: "PICEA_ENGELMANNII", scientific: "Picea engelmannii Parry ex Engelm.", common: { en: "Engelmann spruce", fr: "épinette d'Engelmann" }, usda: "PIEN", fiaCode: 93, yearsToBreastHeight: 15, states: ["CO", "MT", "ID", "WA", "OR"], form: "excurrent", prior: "abies-lasiocarpa", architecture: WHORLED, lateralBudsPerNode: 4, shade: "tolerant", tolerance: { drought: 0.4, frost: 1, waterlogging: 0.3 }, limits: { maxAgeYears: 500, maxHeightM: 40, maxDbhCm: 100 }, modulusGPa: 7.1, leaf: needles(2.2, 8, 10, "#4a6a6a", 6), bark: bark("scaly", 25, 0.2, "#7a6458"), reproduction: { firstFlowerYears: 20, seedMassMg: 3.3 }, phenology: spring(200) },
  { id: "abies-grandis", exportName: "ABIES_GRANDIS", scientific: "Abies grandis (Douglas ex D. Don) Lindl.", common: { en: "grand fir", fr: "sapin grandissime" }, usda: "ABGR", fiaCode: 17, yearsToBreastHeight: 10, states: ["OR", "ID", "WA"], form: "excurrent", prior: "tsuga-heterophylla", architecture: WHORLED, lateralBudsPerNode: 4, shade: "tolerant", tolerance: { drought: 0.5, frost: 0.8, waterlogging: 0.3 }, limits: { maxAgeYears: 300, maxHeightM: 60, maxDbhCm: 150 }, modulusGPa: 8.6, leaf: needles(4, 7, 10, "#2f5a3a", 9), bark: bark("smooth", 40, 0.3, "#6e6a64"), reproduction: { firstFlowerYears: 20, seedMassMg: 20 }, phenology: spring(220) },
  { id: "abies-lasiocarpa", exportName: "ABIES_LASIOCARPA", scientific: "Abies lasiocarpa (Hook.) Nutt.", common: { en: "subalpine fir", fr: "sapin subalpin" }, usda: "ABLA", fiaCode: 19, yearsToBreastHeight: 15, states: ["ID", "MT", "CO", "WA"], form: "columnar", prior: "abies-balsamea", architecture: WHORLED, lateralBudsPerNode: 4, shade: "very tolerant", tolerance: { drought: 0.4, frost: 1, waterlogging: 0.3 }, limits: { maxAgeYears: 250, maxHeightM: 30, maxDbhCm: 60 }, modulusGPa: 7.2, leaf: needles(2.5, 10, 10, "#3f5e58", 8), bark: bark("smooth", 60, 0.2, "#8a8780"), reproduction: { firstFlowerYears: 20, seedMassMg: 8 }, phenology: spring(220) },
  // Water oak stands in for white fir: no fit matched white fir's 20-year diameter (36% over).
  { id: "quercus-nigra", exportName: "QUERCUS_NIGRA", scientific: "Quercus nigra L.", common: { en: "water oak", fr: "chêne aquatique" }, usda: "QUNI", fiaCode: 827, carmeanCurve: 44, states: ["AL", "MS", "GA", "LA"], form: "decurrent", prior: "quercus-falcata", architecture: OAK_ARCH, lateralBudsPerNode: 1, shade: "intolerant", tolerance: { drought: 0.5, frost: 0.4, waterlogging: 0.6 }, limits: { maxAgeYears: 150, maxHeightM: 33, maxDbhCm: 120 }, modulusGPa: 10.7, leaf: broadleaf("ovate", 8, 0.4, 0, 0, 1, "#8a6a2a"), bark: bark("furrowed", 10, 0.4, "#4a4540"), reproduction: { firstFlowerYears: 20, seedMassMg: 900 }, phenology: spring(240) },
  { id: "pseudotsuga-menziesii", exportName: "PSEUDOTSUGA_MENZIESII", scientific: "Pseudotsuga menziesii (Mirb.) Franco", common: { en: "Douglas-fir", fr: "douglas de Menzies" }, usda: "PSME", fiaCode: 202, yearsToBreastHeight: 7, states: ["OR", "WA"], form: "excurrent", prior: "picea-sitchensis", architecture: WHORLED, lateralBudsPerNode: 4, shade: "intermediate", tolerance: { drought: 0.6, frost: 0.8, waterlogging: 0.2 }, limits: { maxAgeYears: 1000, maxHeightM: 75, maxDbhCm: 300 }, modulusGPa: 10.8, leaf: needles(2.5, 7, 10, "#3d6440", 9), bark: bark("furrowed", 30, 0.9, "#5b4436"), reproduction: { firstFlowerYears: 15, seedMassMg: 11 }, phenology: spring(220) },
  { id: "tsuga-canadensis", exportName: "TSUGA_CANADENSIS", scientific: "Tsuga canadensis (L.) Carrière", common: { en: "eastern hemlock", fr: "pruche du Canada" }, usda: "TSCA", fiaCode: 261, carmeanCurve: 127, states: ["ME", "NY", "PA", "MI", "NH"], form: "excurrent", prior: "abies-balsamea", architecture: MASSART, lateralBudsPerNode: 2, shade: "very tolerant", tolerance: { drought: 0.3, frost: 0.9, waterlogging: 0.4 }, limits: { maxAgeYears: 800, maxHeightM: 35, maxDbhCm: 150 }, modulusGPa: 7.4, leaf: needles(1.5, 4, 10, "#2e5238", 11), bark: bark("furrowed", 20, 0.6, "#5e4a3f"), reproduction: { firstFlowerYears: 20, seedMassMg: 2.4 }, phenology: spring(200) },
  { id: "tsuga-heterophylla", exportName: "TSUGA_HETEROPHYLLA", scientific: "Tsuga heterophylla (Raf.) Sarg.", common: { en: "western hemlock", fr: "pruche de l'Ouest" }, usda: "TSHE", fiaCode: 263, yearsToBreastHeight: 8, states: ["WA", "OR", "ID"], form: "weeping", setpointMax: 140, prior: "abies-balsamea", architecture: MASSART, lateralBudsPerNode: 2, shade: "very tolerant", tolerance: { drought: 0.2, frost: 0.7, waterlogging: 0.4 }, limits: { maxAgeYears: 500, maxHeightM: 60, maxDbhCm: 200 }, modulusGPa: 9, leaf: needles(1.5, 5, 10, "#2f553c", 11), bark: bark("furrowed", 25, 0.5, "#5a4a40"), reproduction: { firstFlowerYears: 25, seedMassMg: 1.7 }, phenology: spring(200) },
  { id: "thuja-plicata", exportName: "THUJA_PLICATA", scientific: "Thuja plicata Donn ex D. Don", common: { en: "western redcedar", fr: "thuya géant" }, usda: "THPL", fiaCode: 242, yearsToBreastHeight: 10, states: ["ID", "WA", "MT", "OR"], form: "excurrent", prior: "abies-balsamea", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very tolerant", tolerance: { drought: 0.3, frost: 0.8, waterlogging: 0.6 }, limits: { maxAgeYears: 1000, maxHeightM: 60, maxDbhCm: 300 }, modulusGPa: 6.5, leaf: needles(2.5, 4, 12, "#3a6236", 7, "scale"), bark: bark("fibrous", 5, 0.5, "#7a4e38"), reproduction: { firstFlowerYears: 20, seedMassMg: 1.1 }, phenology: spring(220) },
  // Larches and locust
  { id: "larix-laricina", exportName: "LARIX_LARICINA", scientific: "Larix laricina (Du Roi) K. Koch", common: { en: "tamarack", fr: "mélèze laricin" }, usda: "LALA", fiaCode: 71, carmeanCurve: 60, states: ["MN", "WI", "MI"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very intolerant", tolerance: { drought: 0.3, frost: 1, waterlogging: 0.9 }, limits: { maxAgeYears: 200, maxHeightM: 25, maxDbhCm: 60 }, modulusGPa: 8.5, leaf: { ...needles(2.5, 0.5, 15, "#6e9a52", 14), color: { spring: "#a6c873", summer: "#6e9a52", autumn: "#d9a83a" } }, bark: bark("scaly", 15, 0.3, "#7b5a48"), reproduction: { firstFlowerYears: 15, seedMassMg: 1.7 }, phenology: spring(150) },
  { id: "larix-occidentalis", exportName: "LARIX_OCCIDENTALIS", scientific: "Larix occidentalis Nutt.", common: { en: "western larch", fr: "mélèze de l'Ouest" }, usda: "LAOC", fiaCode: 73, yearsToBreastHeight: 6, states: ["WA", "MT", "OR", "ID"], form: "excurrent", prior: "pinus-resinosa", architecture: WHORLED, lateralBudsPerNode: 3, shade: "very intolerant", tolerance: { drought: 0.5, frost: 1, waterlogging: 0.3 }, limits: { maxAgeYears: 900, maxHeightM: 55, maxDbhCm: 200 }, modulusGPa: 10.1, leaf: { ...needles(3.5, 0.5, 15, "#6a9450", 14), color: { spring: "#a3c472", summer: "#6a9450", autumn: "#dba938" } }, bark: bark("plated", 20, 0.7, "#8a5a3e"), reproduction: { firstFlowerYears: 25, seedMassMg: 3.3 }, phenology: spring(170) },
  // Black locust stands in for coast redwood: Tallo holds 3 redwood crowns, too few to check a crown against.
  { id: "robinia-pseudoacacia", exportName: "ROBINIA_PSEUDOACACIA", scientific: "Robinia pseudoacacia L.", common: { en: "black locust", fr: "robinier faux-acacia" }, usda: "ROPS", fiaCode: 901, carmeanCurve: 50, states: ["WV", "PA", "WI", "IL", "MI", "OH"], form: "decurrent", prior: "quercus-rubra", architecture: ALTERNATE, lateralBudsPerNode: 1, shade: "very intolerant", tolerance: { drought: 0.8, frost: 0.8, waterlogging: 0.1 }, limits: { maxAgeYears: 100, maxHeightM: 30, maxDbhCm: 90 }, modulusGPa: 12.8, leaf: broadleaf("lanceolate", 25, 0.35, 0, 0, 1, "#c9b84a"), bark: bark("furrowed", 10, 0.9, "#4a3f36"), reproduction: { firstFlowerYears: 6, flowerColor: "#f4f1e4", seedMassMg: 18 }, phenology: spring(300) },
];
