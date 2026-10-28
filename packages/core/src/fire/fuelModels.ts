// @skill jgengine-world

/** Fuel loads of one surface fuel model by size class, kg/m². */
export interface FuelLoads {
  /** Dead fuel under 0.64 cm across. */
  oneHour: number;
  /** Dead fuel 0.64–2.5 cm across. */
  tenHour: number;
  /** Dead fuel 2.5–7.6 cm across. */
  hundredHour: number;
  /** Live grasses and forbs. */
  liveHerb: number;
  /** Live shrub foliage and fine twigs. */
  liveWoody: number;
}

/**
 * A surface fuel bed in the form Rothermel's model reads: loads, particle sizes, depth, heat content
 * and the dead moisture of extinction. Metric units; the standard models below are converted from
 * their published English values.
 */
export interface FuelModel {
  /** Published code, `GR2`, `TL3`, `FM4`. */
  code: string;
  /** Published number (Scott & Burgan 101–204, Anderson 1–13, non-burnable 91–99). */
  number: number;
  name: string;
  /** Dynamic models move live herb load to dead as it cures (Scott & Burgan 2005). */
  dynamic: boolean;
  /** Fuel bed depth, m. */
  depthM: number;
  /** Dead fuel moisture of extinction, fraction of dry mass. */
  deadExtinctionMoisture: number;
  /** Low heat content of dead fuel, kJ/kg. */
  deadHeatKJPerKg: number;
  /** Low heat content of live fuel, kJ/kg. */
  liveHeatKJPerKg: number;
  load: FuelLoads;
  /** Surface-area-to-volume ratio of 1-h dead fuel, 1/m. */
  oneHourSavr: number;
  /** Surface-area-to-volume ratio of live herbs (and cured herbs), 1/m. */
  liveHerbSavr: number;
  /** Surface-area-to-volume ratio of live woody fuel, 1/m. */
  liveWoodySavr: number;
}

/** Metres per foot. */
export const M_PER_FT = 0.3048;
/** kg/m² per ton/acre (short tons). */
export const KG_M2_PER_TON_ACRE = 907.18474 / 4046.8564224;
/** kg/m² per lb/ft². */
export const KG_M2_PER_LB_FT2 = 0.45359237 / (0.3048 * 0.3048);
/** kJ/kg per Btu/lb. */
export const KJ_KG_PER_BTU_LB = 2.326;

interface PublishedFuelModel {
  number: number;
  code: string;
  name: string;
  dynamic: boolean;
  /** ft */
  depth: number;
  /** percent */
  mx: number;
  /** Btu/lb */
  heat: number;
  /** tons/acre (lb/ft² for Anderson): 1-h, 10-h, 100-h, live herb, live woody */
  loads: readonly [number, number, number, number, number];
  /** 1/ft: 1-h, live herb, live woody */
  savr: readonly [number, number, number];
}

function fromPublished(p: PublishedFuelModel, loadUnit: number): FuelModel {
  const [oneHour, tenHour, hundredHour, liveHerb, liveWoody] = p.loads;
  const [oneHourSavr, liveHerbSavr, liveWoodySavr] = p.savr;
  return {
    code: p.code,
    number: p.number,
    name: p.name,
    dynamic: p.dynamic,
    depthM: p.depth * M_PER_FT,
    deadExtinctionMoisture: p.mx / 100,
    deadHeatKJPerKg: p.heat * KJ_KG_PER_BTU_LB,
    liveHeatKJPerKg: p.heat * KJ_KG_PER_BTU_LB,
    load: {
      oneHour: oneHour * loadUnit,
      tenHour: tenHour * loadUnit,
      hundredHour: hundredHour * loadUnit,
      liveHerb: liveHerb * loadUnit,
      liveWoody: liveWoody * loadUnit,
    },
    oneHourSavr: oneHourSavr / M_PER_FT,
    liveHerbSavr: liveHerbSavr / M_PER_FT,
    liveWoodySavr: liveWoodySavr / M_PER_FT,
  };
}

const D = true;
const S = false;

/** Scott & Burgan 2005, RMRS-GTR-153, table 7: loads in tons/acre, SAV in 1/ft, depth in ft. */
const SCOTT_BURGAN: readonly PublishedFuelModel[] = [
  { number: 101, code: "GR1", name: "Short, sparse dry climate grass", dynamic: D, depth: 0.4, mx: 15, heat: 8000, loads: [0.1, 0, 0, 0.3, 0], savr: [2200, 2000, 1500] },
  { number: 102, code: "GR2", name: "Low load, dry climate grass", dynamic: D, depth: 1.0, mx: 15, heat: 8000, loads: [0.1, 0, 0, 1.0, 0], savr: [2000, 1800, 1500] },
  { number: 103, code: "GR3", name: "Low load, very coarse, humid climate grass", dynamic: D, depth: 2.0, mx: 30, heat: 8000, loads: [0.1, 0.4, 0, 1.5, 0], savr: [1500, 1300, 1500] },
  { number: 104, code: "GR4", name: "Moderate load, dry climate grass", dynamic: D, depth: 2.0, mx: 15, heat: 8000, loads: [0.25, 0, 0, 1.9, 0], savr: [2000, 1800, 1500] },
  { number: 105, code: "GR5", name: "Low load, humid climate grass", dynamic: D, depth: 1.5, mx: 40, heat: 8000, loads: [0.4, 0, 0, 2.5, 0], savr: [1800, 1600, 1500] },
  { number: 106, code: "GR6", name: "Moderate load, humid climate grass", dynamic: D, depth: 1.5, mx: 40, heat: 9000, loads: [0.1, 0, 0, 3.4, 0], savr: [2200, 2000, 1500] },
  { number: 107, code: "GR7", name: "High load, dry climate grass", dynamic: D, depth: 3.0, mx: 15, heat: 8000, loads: [1.0, 0, 0, 5.4, 0], savr: [2000, 1800, 1500] },
  { number: 108, code: "GR8", name: "High load, very coarse, humid climate grass", dynamic: D, depth: 4.0, mx: 30, heat: 8000, loads: [0.5, 1.0, 0, 7.3, 0], savr: [1500, 1300, 1500] },
  { number: 109, code: "GR9", name: "Very high load, humid climate grass", dynamic: D, depth: 5.0, mx: 40, heat: 8000, loads: [1.0, 1.0, 0, 9.0, 0], savr: [1800, 1600, 1500] },
  { number: 121, code: "GS1", name: "Low load, dry climate grass-shrub", dynamic: D, depth: 0.9, mx: 15, heat: 8000, loads: [0.2, 0, 0, 0.5, 0.65], savr: [2000, 1800, 1800] },
  { number: 122, code: "GS2", name: "Moderate load, dry climate grass-shrub", dynamic: D, depth: 1.5, mx: 15, heat: 8000, loads: [0.5, 0.5, 0, 0.6, 1.0], savr: [2000, 1800, 1800] },
  { number: 123, code: "GS3", name: "Moderate load, humid climate grass-shrub", dynamic: D, depth: 1.8, mx: 40, heat: 8000, loads: [0.3, 0.25, 0, 1.45, 1.25], savr: [1800, 1600, 1600] },
  { number: 124, code: "GS4", name: "High load, humid climate grass-shrub", dynamic: D, depth: 2.1, mx: 40, heat: 8000, loads: [1.9, 0.3, 0.1, 3.4, 7.1], savr: [1800, 1600, 1600] },
  { number: 141, code: "SH1", name: "Low load, dry climate shrub", dynamic: D, depth: 1.0, mx: 15, heat: 8000, loads: [0.25, 0.25, 0, 0.15, 1.3], savr: [2000, 1800, 1600] },
  { number: 142, code: "SH2", name: "Moderate load, dry climate shrub", dynamic: S, depth: 1.0, mx: 15, heat: 8000, loads: [1.35, 2.4, 0.75, 0, 3.85], savr: [2000, 1800, 1600] },
  { number: 143, code: "SH3", name: "Moderate load, humid climate shrub", dynamic: S, depth: 2.4, mx: 40, heat: 8000, loads: [0.45, 3.0, 0, 0, 6.2], savr: [1600, 1800, 1400] },
  { number: 144, code: "SH4", name: "Low load, humid climate timber-shrub", dynamic: S, depth: 3.0, mx: 30, heat: 8000, loads: [0.85, 1.15, 0.2, 0, 2.55], savr: [2000, 1800, 1600] },
  { number: 145, code: "SH5", name: "High load, dry climate shrub", dynamic: S, depth: 6.0, mx: 15, heat: 8000, loads: [3.6, 2.1, 0, 0, 2.9], savr: [750, 1800, 1600] },
  { number: 146, code: "SH6", name: "Low load, humid climate shrub", dynamic: S, depth: 2.0, mx: 30, heat: 8000, loads: [2.9, 1.45, 0, 0, 1.4], savr: [750, 1800, 1600] },
  { number: 147, code: "SH7", name: "Very high load, dry climate shrub", dynamic: S, depth: 6.0, mx: 15, heat: 8000, loads: [3.5, 5.3, 2.2, 0, 3.4], savr: [750, 1800, 1600] },
  { number: 148, code: "SH8", name: "High load, humid climate shrub", dynamic: S, depth: 3.0, mx: 40, heat: 8000, loads: [2.05, 3.4, 0.85, 0, 4.35], savr: [750, 1800, 1600] },
  { number: 149, code: "SH9", name: "Very high load, humid climate shrub", dynamic: D, depth: 4.4, mx: 40, heat: 8000, loads: [4.5, 2.45, 0, 1.55, 7.0], savr: [750, 1800, 1500] },
  { number: 161, code: "TU1", name: "Low load, dry climate timber-grass-shrub", dynamic: D, depth: 0.6, mx: 20, heat: 8000, loads: [0.2, 0.9, 1.5, 0.2, 0.9], savr: [2000, 1800, 1600] },
  { number: 162, code: "TU2", name: "Moderate load, humid climate timber-shrub", dynamic: S, depth: 1.0, mx: 30, heat: 8000, loads: [0.95, 1.8, 1.25, 0, 0.2], savr: [2000, 1800, 1600] },
  { number: 163, code: "TU3", name: "Moderate load, humid climate timber-grass-shrub", dynamic: D, depth: 1.3, mx: 30, heat: 8000, loads: [1.1, 0.15, 0.25, 0.65, 1.1], savr: [1800, 1600, 1400] },
  { number: 164, code: "TU4", name: "Dwarf conifer with understory", dynamic: S, depth: 0.5, mx: 12, heat: 8000, loads: [4.5, 0, 0, 0, 2.0], savr: [2300, 1800, 2000] },
  { number: 165, code: "TU5", name: "Very high load, dry climate timber-shrub", dynamic: S, depth: 1.0, mx: 25, heat: 8000, loads: [4.0, 4.0, 3.0, 0, 3.0], savr: [1500, 1800, 750] },
  { number: 181, code: "TL1", name: "Low load compact conifer litter", dynamic: S, depth: 0.2, mx: 30, heat: 8000, loads: [1.0, 2.2, 3.6, 0, 0], savr: [2000, 1800, 1600] },
  { number: 182, code: "TL2", name: "Low load broadleaf litter", dynamic: S, depth: 0.2, mx: 25, heat: 8000, loads: [1.4, 2.3, 2.2, 0, 0], savr: [2000, 1800, 1600] },
  { number: 183, code: "TL3", name: "Moderate load conifer litter", dynamic: S, depth: 0.3, mx: 20, heat: 8000, loads: [0.5, 2.2, 2.8, 0, 0], savr: [2000, 1800, 1600] },
  { number: 184, code: "TL4", name: "Small downed logs", dynamic: S, depth: 0.4, mx: 25, heat: 8000, loads: [0.5, 1.5, 4.2, 0, 0], savr: [2000, 1800, 1600] },
  { number: 185, code: "TL5", name: "High load conifer litter", dynamic: S, depth: 0.6, mx: 25, heat: 8000, loads: [1.15, 2.5, 4.4, 0, 0], savr: [2000, 1800, 1600] },
  { number: 186, code: "TL6", name: "Moderate load broadleaf litter", dynamic: S, depth: 0.3, mx: 25, heat: 8000, loads: [2.4, 1.2, 1.2, 0, 0], savr: [2000, 1800, 1600] },
  { number: 187, code: "TL7", name: "Large downed logs", dynamic: S, depth: 0.4, mx: 25, heat: 8000, loads: [0.3, 1.4, 8.1, 0, 0], savr: [2000, 1800, 1600] },
  { number: 188, code: "TL8", name: "Long-needle litter", dynamic: S, depth: 0.3, mx: 35, heat: 8000, loads: [5.8, 1.4, 1.1, 0, 0], savr: [1800, 1800, 1600] },
  { number: 189, code: "TL9", name: "Very high load broadleaf litter", dynamic: S, depth: 0.6, mx: 35, heat: 8000, loads: [6.65, 3.3, 4.15, 0, 0], savr: [1800, 1800, 1600] },
  { number: 201, code: "SB1", name: "Low load activity fuel", dynamic: S, depth: 1.0, mx: 25, heat: 8000, loads: [1.5, 3.0, 11.0, 0, 0], savr: [2000, 1800, 1600] },
  { number: 202, code: "SB2", name: "Moderate load activity fuel or low load blowdown", dynamic: S, depth: 1.0, mx: 25, heat: 8000, loads: [4.5, 4.25, 4.0, 0, 0], savr: [2000, 1800, 1600] },
  { number: 203, code: "SB3", name: "High load activity fuel or moderate load blowdown", dynamic: S, depth: 1.2, mx: 25, heat: 8000, loads: [5.5, 2.75, 3.0, 0, 0], savr: [2000, 1800, 1600] },
  { number: 204, code: "SB4", name: "High load blowdown", dynamic: S, depth: 2.7, mx: 25, heat: 8000, loads: [5.25, 3.5, 5.25, 0, 0], savr: [2000, 1800, 1600] },
];

/** Anderson 1982, GTR-INT-122, as tabulated by Albini 1976 and BehavePlus: loads in lb/ft². */
const ANDERSON: readonly PublishedFuelModel[] = [
  { number: 1, code: "FM1", name: "Short grass", dynamic: S, depth: 1.0, mx: 12, heat: 8000, loads: [0.034, 0, 0, 0, 0], savr: [3500, 1500, 1500] },
  { number: 2, code: "FM2", name: "Timber grass and understory", dynamic: S, depth: 1.0, mx: 15, heat: 8000, loads: [0.092, 0.046, 0.023, 0.023, 0], savr: [3000, 1500, 1500] },
  { number: 3, code: "FM3", name: "Tall grass", dynamic: S, depth: 2.5, mx: 25, heat: 8000, loads: [0.138, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
  { number: 4, code: "FM4", name: "Chaparral", dynamic: S, depth: 6.0, mx: 20, heat: 8000, loads: [0.23, 0.184, 0.092, 0, 0.23], savr: [2000, 1500, 1500] },
  { number: 5, code: "FM5", name: "Brush", dynamic: S, depth: 2.0, mx: 20, heat: 8000, loads: [0.046, 0.023, 0, 0, 0.092], savr: [2000, 1500, 1500] },
  { number: 6, code: "FM6", name: "Dormant brush, hardwood slash", dynamic: S, depth: 2.5, mx: 25, heat: 8000, loads: [0.069, 0.115, 0.092, 0, 0], savr: [1750, 1500, 1500] },
  { number: 7, code: "FM7", name: "Southern rough", dynamic: S, depth: 2.5, mx: 40, heat: 8000, loads: [0.052, 0.086, 0.069, 0, 0.017], savr: [1750, 1500, 1500] },
  { number: 8, code: "FM8", name: "Short needle litter", dynamic: S, depth: 0.2, mx: 30, heat: 8000, loads: [0.069, 0.046, 0.115, 0, 0], savr: [2000, 1500, 1500] },
  { number: 9, code: "FM9", name: "Long needle or hardwood litter", dynamic: S, depth: 0.2, mx: 25, heat: 8000, loads: [0.134, 0.019, 0.007, 0, 0], savr: [2500, 1500, 1500] },
  { number: 10, code: "FM10", name: "Timber litter and understory", dynamic: S, depth: 1.0, mx: 25, heat: 8000, loads: [0.138, 0.092, 0.23, 0, 0.092], savr: [2000, 1500, 1500] },
  { number: 11, code: "FM11", name: "Light logging slash", dynamic: S, depth: 1.0, mx: 15, heat: 8000, loads: [0.069, 0.207, 0.253, 0, 0], savr: [1500, 1500, 1500] },
  { number: 12, code: "FM12", name: "Medium logging slash", dynamic: S, depth: 2.3, mx: 20, heat: 8000, loads: [0.184, 0.644, 0.759, 0, 0], savr: [1500, 1500, 1500] },
  { number: 13, code: "FM13", name: "Heavy logging slash", dynamic: S, depth: 3.0, mx: 25, heat: 8000, loads: [0.322, 1.058, 1.288, 0, 0], savr: [1500, 1500, 1500] },
];

/** Non-burnable land cover codes (Scott & Burgan 2005, table 6). */
const NON_BURNABLE: readonly PublishedFuelModel[] = [
  { number: 91, code: "NB1", name: "Urban or developed", dynamic: S, depth: 1, mx: 10, heat: 8000, loads: [0, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
  { number: 92, code: "NB2", name: "Snow or ice", dynamic: S, depth: 1, mx: 10, heat: 8000, loads: [0, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
  { number: 93, code: "NB3", name: "Agricultural", dynamic: S, depth: 1, mx: 10, heat: 8000, loads: [0, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
  { number: 98, code: "NB8", name: "Open water", dynamic: S, depth: 1, mx: 10, heat: 8000, loads: [0, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
  { number: 99, code: "NB9", name: "Bare ground", dynamic: S, depth: 1, mx: 10, heat: 8000, loads: [0, 0, 0, 0, 0], savr: [1500, 1500, 1500] },
];

/**
 * The 40 standard fire behavior fuel models of Scott & Burgan 2005 (grass GR, grass-shrub GS, shrub SH,
 * timber-understory TU, timber litter TL, slash-blowdown SB), keyed by code.
 *
 * @capability fire-fuel-models the 40 Scott & Burgan 2005 surface fuel models, the 13 Anderson 1982 models and the non-burnable codes, in metric units
 */
export const SCOTT_BURGAN_FUEL_MODELS: Readonly<Record<string, FuelModel>> = Object.fromEntries(SCOTT_BURGAN.map((p) => [p.code, fromPublished(p, KG_M2_PER_TON_ACRE)]));

/** The original 13 fuel models (Anderson 1982; Albini 1976), keyed by code `FM1`..`FM13`. */
export const ANDERSON_FUEL_MODELS: Readonly<Record<string, FuelModel>> = Object.fromEntries(ANDERSON.map((p) => [p.code, fromPublished(p, KG_M2_PER_LB_FT2)]));

/** Non-burnable cover (urban, snow, agriculture, water, bare ground), keyed by code `NB1`..`NB9`. */
export const NON_BURNABLE_FUEL_MODELS: Readonly<Record<string, FuelModel>> = Object.fromEntries(NON_BURNABLE.map((p) => [p.code, fromPublished(p, KG_M2_PER_TON_ACRE)]));

/**
 * Every standard fuel model by code.
 *
 * @capability fire-fuel-model-lookup look up any standard surface fuel model by its published code
 */
export function standardFuelModel(code: string): FuelModel | undefined {
  return SCOTT_BURGAN_FUEL_MODELS[code] ?? ANDERSON_FUEL_MODELS[code] ?? NON_BURNABLE_FUEL_MODELS[code];
}

/**
 * Total fuel load of a model, kg/m².
 *
 * @capability fire-fuel-load total surface fuel load of a fuel model
 */
export function totalFuelLoad(fuel: FuelModel): number {
  const l = fuel.load;
  return l.oneHour + l.tenHour + l.hundredHour + l.liveHerb + l.liveWoody;
}

/** Fuel moisture by size class, as a fraction of dry mass (0.06 = 6 %). */
export interface FuelMoisture {
  oneHour: number;
  tenHour: number;
  hundredHour: number;
  liveHerb: number;
  liveWoody: number;
}

/**
 * Scott & Burgan 2005 fuel moisture scenarios: dead D1 (very low) to D4 (high) and live L1 (fully
 * cured herbs) to L4 (fully green), keyed `D1L1`..`D4L4`.
 */
export const MOISTURE_SCENARIOS: Readonly<Record<string, FuelMoisture>> = (() => {
  const dead = [
    [0.03, 0.04, 0.05],
    [0.06, 0.07, 0.08],
    [0.09, 0.1, 0.11],
    [0.12, 0.13, 0.14],
  ] as const;
  const live = [
    [0.3, 0.6],
    [0.6, 0.9],
    [0.9, 1.2],
    [1.2, 1.5],
  ] as const;
  const out: Record<string, FuelMoisture> = {};
  dead.forEach(([oneHour, tenHour, hundredHour], d) => {
    live.forEach(([liveHerb, liveWoody], l) => {
      out[`D${d + 1}L${l + 1}`] = { oneHour, tenHour, hundredHour, liveHerb, liveWoody };
    });
  });
  return out;
})();
