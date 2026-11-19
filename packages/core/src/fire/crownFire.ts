// @skill jgengine-world
import { ANDERSON_FUEL_MODELS, KJ_KG_PER_BTU_LB, M_PER_FT, type FuelMoisture } from "./fuelModels";
import { KW_M_PER_BTU_FT_S, MPS_PER_MPH, surfaceFuelbed, surfaceSpread, type SurfaceFuelbed } from "./surfaceFire";

export interface CanopyFuel {
  baseHeightM: number;
  heightM: number;
  /** Canopy bulk density, kg/m³. */
  bulkDensity: number;
  foliarMoisture: number;
}

/** Low heat of combustion of crown foliage, kJ/kg (8000 Btu/lb, as BehavePlus). */
export const CANOPY_HEAT_KJ_KG = 8000 * KJ_KG_PER_BTU_LB;
const CROWN_WIND_FACTOR = 0.4;
const FM10 = ANDERSON_FUEL_MODELS["FM10"];

/** @capability fire-crown-initiation Van Wagner 1977 surface intensity needed to torch a canopy */
export function crownInitiationIntensity(canopy: CanopyFuel): number {
  const fmc = Math.max(30, canopy.foliarMoisture * 100);
  const cbh = Math.max(0.1, canopy.baseHeightM);
  return Math.pow(0.01 * cbh * (460 + 25.9 * fmc), 1.5);
}

/**
 * Van Wagner 1977 critical spread rate for an active crown fire, m/s: a crown fire sustains itself
 * once it moves 3 kg/m²/min of canopy fuel, R = 3 / CBD (m/min).
 *
 * @capability fire-active-crown-threshold Van Wagner 1977 spread rate a crown fire needs to stay active
 */
export function activeCrownCriticalRate(canopy: CanopyFuel): number {
  return canopy.bulkDensity > 1e-7 ? 3 / canopy.bulkDensity / 60 : Number.POSITIVE_INFINITY;
}

/**
 * Canopy fuel load available to a crown fire, kg/m².
 *
 * @capability fire-canopy-load canopy fuel load from bulk density and crown depth
 */
export function canopyFuelLoad(canopy: CanopyFuel): number {
  return canopy.bulkDensity * Math.max(0, canopy.heightM - canopy.baseHeightM);
}

/**
 * Rothermel 1991 active crown fire spread rate, m/s: 3.34 times the surface rate of fuel model 10 at
 * the same dead and live moisture, with midflame wind 0.4 × the 20-ft wind, on level ground.
 *
 * @capability fire-crown-spread Rothermel 1991 crown fire spread rate from 20-ft wind and fuel moisture
 */
export function rothermelCrownRate(moisture: FuelMoisture, twentyFootWind: number, fm10Bed?: SurfaceFuelbed): number {
  if (FM10 === undefined) throw new Error("fuel model 10 is missing");
  const bed = fm10Bed ?? surfaceFuelbed(FM10, moisture);
  return 3.34 * surfaceSpread(bed, { midflameWind: CROWN_WIND_FACTOR * twentyFootWind, windAngle: 0, slope: 0 }).headRate;
}

/**
 * Rothermel 1991 crown fire length-to-breadth ratio, 1 + 0.125 × the 20-ft wind in mph.
 *
 * @capability fire-crown-shape Rothermel 1991 crown fire ellipse shape from the 20-ft wind
 */
export function crownLengthToBreadth(twentyFootWind: number): number {
  return twentyFootWind > 1e-9 ? 1 + 0.125 * (twentyFootWind / MPS_PER_MPH) : 1;
}

/** @capability fire-crown-flame-length Thomas 1963 crown fire flame length from intensity */
export function crownFlameLength(firelineIntensityKWm: number): number {
  const i = firelineIntensityKWm / KW_M_PER_BTU_FT_S;
  return i > 0 ? 0.2 * Math.pow(i, 2 / 3) * M_PER_FT : 0;
}

/**
 * Crown fire type in Rothermel's 1991 sense (as BehavePlus): `surface` when the surface fire neither
 * torches nor could sustain a crown fire, `torching` (passive) when it lights crowns it cannot carry,
 * `crowning` (active) when it lights them and the crown rate passes Van Wagner's threshold, and
 * `conditional` when an active crown fire could run but this surface fire cannot start one.
 */
export type CrownFireType = "surface" | "torching" | "crowning" | "conditional";

export interface CrownFire {
  type: CrownFireType;
  transitionRatio: number;
  activeRatio: number;
  /** Rothermel 1991 crown spread rate, m/s. */
  crownRate: number;
  crownHeatPerUnitArea: number;
  crownIntensity: number;
  crownFlameLength: number;
  lengthToBreadth: number;
}

/** @capability fire-crown-fire classify a surface fire as surface, torching, crowning or conditional crown fire and give the crown rate and intensity */
export function assessCrownFire(input: {
  canopy: CanopyFuel;
  moisture: FuelMoisture;
  twentyFootWind: number;
  surfaceIntensity: number;
  surfaceHeatPerUnitArea: number;
  fm10Bed?: SurfaceFuelbed;
}): CrownFire {
  const { canopy } = input;
  const initiation = crownInitiationIntensity(canopy);
  const transitionRatio = initiation > 1e-7 ? input.surfaceIntensity / initiation : 0;
  const crownRate = rothermelCrownRate(input.moisture, input.twentyFootWind, input.fm10Bed);
  const critical = activeCrownCriticalRate(canopy);
  const activeRatio = Number.isFinite(critical) && critical > 0 ? crownRate / critical : 0;
  const crownHeatPerUnitArea = input.surfaceHeatPerUnitArea + canopyFuelLoad(canopy) * CANOPY_HEAT_KJ_KG;
  const crownIntensity = crownRate * crownHeatPerUnitArea;
  let type: CrownFireType;
  if (transitionRatio < 1) type = activeRatio < 1 ? "surface" : "conditional";
  else type = activeRatio < 1 ? "torching" : "crowning";
  return {
    type,
    transitionRatio,
    activeRatio,
    crownRate,
    crownHeatPerUnitArea,
    crownIntensity,
    crownFlameLength: crownFlameLength(crownIntensity),
    lengthToBreadth: crownLengthToBreadth(input.twentyFootWind),
  };
}
