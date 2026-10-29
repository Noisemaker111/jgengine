// home-ok: ground-cover records are plant species grown by plants/groundCover; grass/ only draws them
import type { PLANT_SOURCES } from "../species/speciesSources";

/**
 * A grass, herb or moss as data for the tiller field: how fast its shoots make leaves and daughters,
 * how tall its leaves and flowering stems grow, what makes it flower, and how it spreads. A tiller is a
 * grass tiller, a herb's rosette or a moss shoot. A new ground-cover plant is one record.
 */
export interface GroundCoverSpecies {
  id: string;
  /** Bumped whenever a value changes. */
  version: number;
  names: { scientific: string; common: Readonly<Record<string, string>> };
  /**
   * `graminoid`: a grass tiller ends in its flower head, so setting seed or losing the head kills it.
   * `forb`: a herb's rosette outlives its flowering stems. `moss`: a mat that fills the ground the
   * sward leaves bare and grows on the light that passes its leaves, whatever the soil compaction.
   */
  habit: "graminoid" | "forb" | "moss";
  /** Thermal time between two leaves of a tiller, °C·d above `baseTemperatureC`. */
  phyllochronCd: number;
  baseTemperatureC: number;
  /** Leaves alive on a tiller at once; the oldest dies as a new one appears. */
  liveLeaves: number;
  /** Height of the leaf canopy left uncut, metres. */
  maxLeafLengthM: number;
  leafWidthM: number;
  /** Daughter tillers per tiller per new leaf in full light and an open sward (site filling). */
  siteFilling: number;
  /** K in the self-thinning line: most tillers per m² = K × leaf length^(−2/3). */
  densityConstant: number;
  /** Weeks under 5 °C a tiller needs before it can flower; 0 needs none. */
  vernalizationWeeks: number;
  /** Day length a vernalized tiller needs to start a flowering stem, hours. */
  criticalDaylengthH: number;
  /** Share of tillers that flower in a season left uncut. */
  reproductiveShare: number;
  /** Height of a flowering stem with its head, metres. */
  culmHeightM: number;
  /** Share of a cell's tillers that root into each neighbouring cell per new leaf, by rhizomes or stolons. */
  rhizomeRate: number;
  /** New tillers per flowering tiller that root in the cell and each neighbour when its seed (or spores) ripen. */
  seedEstablishment: number;
  /** 0..1: the share of open-sky light below which tillers start to die back (for a moss, the light under the sward). */
  shadeTolerance: number;
  colors: { leaf: string; tip: string; flower: string; straw: string };
  /** Where each value comes from, as ids into `PLANT_SOURCES`. */
  sources: readonly (keyof typeof PLANT_SOURCES)[];
}

const GRASS_SOURCES = ["usda-plant-guides", "davies-1988", "lemaire-2000", "neuteboom-1989", "matthew-1995", "evers-2007", "heide-1994", "oborny-2000", "may-2009"] as const;

/**
 * Perennial ryegrass: the bunch grass of most lawns and sown pastures. Phyllochron and three live
 * leaves from Davies 1988 and Lemaire & Agnusdei 2000; vernalization and long-day flowering from Heide 1994.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const LOLIUM_PERENNE: GroundCoverSpecies = {
  id: "lolium-perenne",
  version: 1,
  habit: "graminoid",
  names: { scientific: "Lolium perenne L.", common: { en: "perennial ryegrass", fr: "ray-grass anglais" } },
  phyllochronCd: 110,
  baseTemperatureC: 3,
  liveLeaves: 3,
  maxLeafLengthM: 0.3,
  leafWidthM: 0.004,
  siteFilling: 0.6,
  densityConstant: 1650,
  vernalizationWeeks: 8,
  criticalDaylengthH: 12.5,
  reproductiveShare: 0.5,
  culmHeightM: 0.6,
  rhizomeRate: 0,
  seedEstablishment: 0.05,
  shadeTolerance: 0.35,
  colors: { leaf: "#3f7a2c", tip: "#6fa83f", flower: "#b5b07a", straw: "#c9b27a" },
  sources: GRASS_SOURCES,
};

/**
 * Timothy: a tall hay-meadow bunch grass that flowers in long days with no winter cold needed (Heide 1994).
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const PHLEUM_PRATENSE: GroundCoverSpecies = {
  id: "phleum-pratense",
  version: 1,
  habit: "graminoid",
  names: { scientific: "Phleum pratense L.", common: { en: "timothy", fr: "fléole des prés" } },
  phyllochronCd: 100,
  baseTemperatureC: 3,
  liveLeaves: 3.5,
  maxLeafLengthM: 0.35,
  leafWidthM: 0.007,
  siteFilling: 0.5,
  densityConstant: 1400,
  vernalizationWeeks: 0,
  criticalDaylengthH: 14,
  reproductiveShare: 0.6,
  culmHeightM: 0.9,
  rhizomeRate: 0,
  seedEstablishment: 0.05,
  shadeTolerance: 0.3,
  colors: { leaf: "#4a7d34", tip: "#7cab4a", flower: "#9c9a6a", straw: "#c8b07a" },
  sources: GRASS_SOURCES,
};

/**
 * Kentucky bluegrass: a rhizomatous lawn and pasture grass that knits trampled ground back together.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const POA_PRATENSIS: GroundCoverSpecies = {
  id: "poa-pratensis",
  version: 1,
  habit: "graminoid",
  names: { scientific: "Poa pratensis L.", common: { en: "Kentucky bluegrass", fr: "pâturin des prés" } },
  phyllochronCd: 120,
  baseTemperatureC: 2,
  liveLeaves: 3,
  maxLeafLengthM: 0.2,
  leafWidthM: 0.003,
  siteFilling: 0.5,
  densityConstant: 1800,
  vernalizationWeeks: 8,
  criticalDaylengthH: 13,
  reproductiveShare: 0.3,
  culmHeightM: 0.5,
  rhizomeRate: 0.05,
  seedEstablishment: 0.05,
  shadeTolerance: 0.5,
  colors: { leaf: "#355f2e", tip: "#5f8f45", flower: "#9b8f78", straw: "#c2ad7f" },
  sources: GRASS_SOURCES,
};

const HERB_SOURCES = ["usda-plant-guides", "grime-2007", "thomas-1987", "lemaire-2000", "evers-2007"] as const;
const MOSS_SOURCES = ["atherton-2010", "grime-2007", "marschall-2004"] as const;

/**
 * White clover: a lawn and pasture legume that creeps by stolons rooting at each node and flowers
 * through long summer days on stalks just above its leaves (Thomas 1987).
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const TRIFOLIUM_REPENS: GroundCoverSpecies = {
  id: "trifolium-repens",
  version: 1,
  habit: "forb",
  names: { scientific: "Trifolium repens L.", common: { en: "white clover", fr: "trèfle blanc" } },
  phyllochronCd: 100,
  baseTemperatureC: 5,
  liveLeaves: 4,
  maxLeafLengthM: 0.15,
  leafWidthM: 0.006,
  siteFilling: 0.35,
  densityConstant: 300,
  vernalizationWeeks: 0,
  criticalDaylengthH: 13.5,
  reproductiveShare: 0.3,
  culmHeightM: 0.2,
  rhizomeRate: 0.08,
  seedEstablishment: 0.02,
  shadeTolerance: 0.4,
  colors: { leaf: "#2f6b2a", tip: "#4f8c3c", flower: "#f4f1e4", straw: "#8f8257" },
  sources: HERB_SOURCES,
};

/**
 * Dandelion: a rosette herb that flowers in the lengthening days of spring on hollow stalks and
 * spreads its seed on the wind, so it finds every gap in a lawn.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const TARAXACUM_OFFICINALE: GroundCoverSpecies = {
  id: "taraxacum-officinale",
  version: 1,
  habit: "forb",
  names: { scientific: "Taraxacum officinale F.H. Wigg.", common: { en: "dandelion", fr: "pissenlit" } },
  phyllochronCd: 80,
  baseTemperatureC: 3,
  liveLeaves: 6,
  maxLeafLengthM: 0.2,
  leafWidthM: 0.03,
  siteFilling: 0.05,
  densityConstant: 50,
  vernalizationWeeks: 0,
  criticalDaylengthH: 11,
  reproductiveShare: 0.6,
  culmHeightM: 0.3,
  rhizomeRate: 0,
  seedEstablishment: 0.5,
  shadeTolerance: 0.3,
  colors: { leaf: "#3d7a2e", tip: "#5a9440", flower: "#f2c21b", straw: "#a69462" },
  sources: HERB_SOURCES,
};

/**
 * Oxeye daisy: a meadow herb whose rosettes need a winter's cold and long June days before they send
 * up knee-high stems of white flowers; mowing keeps it a flat rosette.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const LEUCANTHEMUM_VULGARE: GroundCoverSpecies = {
  id: "leucanthemum-vulgare",
  version: 1,
  habit: "forb",
  names: { scientific: "Leucanthemum vulgare Lam.", common: { en: "oxeye daisy", fr: "marguerite commune" } },
  phyllochronCd: 90,
  baseTemperatureC: 3,
  liveLeaves: 6,
  maxLeafLengthM: 0.1,
  leafWidthM: 0.015,
  siteFilling: 0.15,
  densityConstant: 45,
  vernalizationWeeks: 8,
  criticalDaylengthH: 14,
  reproductiveShare: 0.5,
  culmHeightM: 0.6,
  rhizomeRate: 0.02,
  seedEstablishment: 0.1,
  shadeTolerance: 0.4,
  colors: { leaf: "#2e6630", tip: "#4a8540", flower: "#f7f5ec", straw: "#a08f5e" },
  sources: HERB_SOURCES,
};

/**
 * Springy turf-moss: the moss of shaded, damp and compacted lawns. It grows in cool weather, creeps by
 * branching shoots and seldom fruits (Atherton et al. 2010); like most mosses it saturates at a fraction
 * of full sun (Marschall & Proctor 2004), so it takes the ground grass gives up in shade.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const RHYTIDIADELPHUS_SQUARROSUS: GroundCoverSpecies = {
  id: "rhytidiadelphus-squarrosus",
  version: 1,
  habit: "moss",
  names: { scientific: "Rhytidiadelphus squarrosus (Hedw.) Warnst.", common: { en: "springy turf-moss", fr: "hypne squarreuse" } },
  phyllochronCd: 200,
  baseTemperatureC: 0,
  liveLeaves: 1,
  maxLeafLengthM: 0.05,
  leafWidthM: 0.0003,
  siteFilling: 0.3,
  densityConstant: 5000,
  vernalizationWeeks: 0,
  criticalDaylengthH: 10,
  reproductiveShare: 0.01,
  culmHeightM: 0.04,
  rhizomeRate: 0.1,
  seedEstablishment: 0.01,
  shadeTolerance: 0.08,
  colors: { leaf: "#5c7a24", tip: "#9bb03c", flower: "#7a4a2a", straw: "#8c7a3e" },
  sources: MOSS_SOURCES,
};

/**
 * The grasses shipped with the engine.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const GRASS_LIBRARY: readonly GroundCoverSpecies[] = [LOLIUM_PERENNE, PHLEUM_PRATENSE, POA_PRATENSIS];

/**
 * Every ground-cover record shipped with the engine: grasses, herbs and mosses.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const GROUND_COVER_LIBRARY: readonly GroundCoverSpecies[] = [...GRASS_LIBRARY, TRIFOLIUM_REPENS, TARAXACUM_OFFICINALE, LEUCANTHEMUM_VULGARE, RHYTIDIADELPHUS_SQUARROSUS];
