// home-ok: grass records are plant species grown by plants/groundCover; grass/ only draws them
import type { PLANT_SOURCES } from "../species/speciesSources";

/**
 * A grass as data for the tiller field: how fast its tillers make leaves and daughters, how tall its
 * leaves and flowering stems grow, what makes it flower, and how it spreads. A new grass is one record.
 */
export interface GrassSpecies {
  id: string;
  /** Bumped whenever a value changes. */
  version: number;
  names: { scientific: string; common: Readonly<Record<string, string>> };
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
  /** 0..1: the share of open-sky light below which tillers start to die back. */
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
export const LOLIUM_PERENNE: GrassSpecies = {
  id: "lolium-perenne",
  version: 1,
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
  shadeTolerance: 0.35,
  colors: { leaf: "#3f7a2c", tip: "#6fa83f", flower: "#b5b07a", straw: "#c9b27a" },
  sources: GRASS_SOURCES,
};

/**
 * Timothy: a tall hay-meadow bunch grass that flowers in long days with no winter cold needed (Heide 1994).
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const PHLEUM_PRATENSE: GrassSpecies = {
  id: "phleum-pratense",
  version: 1,
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
  shadeTolerance: 0.3,
  colors: { leaf: "#4a7d34", tip: "#7cab4a", flower: "#9c9a6a", straw: "#c8b07a" },
  sources: GRASS_SOURCES,
};

/**
 * Kentucky bluegrass: a rhizomatous lawn and pasture grass that knits trampled ground back together.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const POA_PRATENSIS: GrassSpecies = {
  id: "poa-pratensis",
  version: 1,
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
  shadeTolerance: 0.5,
  colors: { leaf: "#355f2e", tip: "#5f8f45", flower: "#9b8f78", straw: "#c2ad7f" },
  sources: GRASS_SOURCES,
};

/**
 * Every grass record shipped with the engine.
 * @capability plant-ground-cover grow lawns, meadows and paths as tiller fields that mowing, trampling, grazing and shade shape
 */
export const GRASS_LIBRARY: readonly GrassSpecies[] = [LOLIUM_PERENNE, PHLEUM_PRATENSE, POA_PRATENSIS];
