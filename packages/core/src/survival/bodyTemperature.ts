// @skill jgengine-gameplay
import { clamp } from "../math/scalar";
import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";

export interface AmbientInput {
  baseC: number;
  daySwingC?: number;
  /** Time of day as a 0..1 fraction where 0.5 is noon. */
  dayFraction?: number;
  weatherC?: number;
  /** Height above the reference level in metres. */
  altitude?: number;
  /** °C lost per metre of altitude. Default 0.0065 (the standard lapse rate). */
  lapsePerMetre?: number;
  heatC?: number;
  wet?: boolean;
  wetC?: number;
}

/**
 * Air temperature at one spot in °C from climate, hour, weather, altitude, wetness and heat sources.
 * Pure — sample it per player per second, not per frame.
 *
 * @capability ambient-temperature air temperature from climate, time of day, weather, altitude, wetness and nearby heat
 */
export function ambientTemperature(input: AmbientInput): number {
  const swing = input.daySwingC ?? 0;
  const day = input.dayFraction ?? 0.5;
  const daily = swing * Math.cos((day - 0.5) * Math.PI * 2);
  const altitude = Math.max(0, input.altitude ?? 0) * (input.lapsePerMetre ?? 0.0065);
  const wet = input.wet === true ? (input.wetC ?? -6) : 0;
  return input.baseC + daily + (input.weatherC ?? 0) - altitude + wet + (input.heatC ?? 0);
}

export interface ComfortBands {
  comfortable: string;
  /** Steps below the cold edge, in degrees below it; crossing each step moves the body outward. */
  cold: readonly ThresholdBoundary[];
  /** Steps above the hot edge, in degrees above it. */
  hot: readonly ThresholdBoundary[];
}

/** How well a body copes: its comfortable band, the steps either side, and what each degree outside costs. */
export interface ComfortConfig {
  /** Comfortable band in °C with no insulation, e.g. `[10, 30]`. */
  comfortC: readonly [number, number];
  bands: ComfortBands;
  /** Extra drain multiplier per °C outside the band (0.05 = +5% per degree). */
  drainPerDegree: number;
  coldDrains: string;
  heatDrains: string;
  damageAfterC: number;
  /** Health per second per °C past `damageAfterC`. */
  damagePerDegree: number;
  fortitudeC: number;
}

export interface Insulation {
  cold?: number;
  heat?: number;
  fortitude?: number;
}

export interface BodyComfort {
  band: string;
  ambientC: number;
  /** Degrees below the cold edge of the widened band (0 when not cold). */
  coldBy: number;
  /** Degrees above the hot edge (0 when not hot). */
  heatBy: number;
  drain: Record<string, number>;
  /** Health lost per second from exposure. */
  damagePerSecond: number;
}

/** @capability body-temperature hypothermia and hyperthermia from ambient temperature, insulation and fortitude, as vital drain and exposure damage */
export function bodyComfort(ambientC: number, config: ComfortConfig, insulation: Insulation = {}): BodyComfort {
  const widen = (insulation.fortitude ?? 0) * config.fortitudeC;
  const low = config.comfortC[0] - (insulation.cold ?? 0) - widen;
  const high = config.comfortC[1] + (insulation.heat ?? 0) + widen;
  const coldBy = Math.max(0, low - ambientC);
  const heatBy = Math.max(0, ambientC - high);
  const drain: Record<string, number> = {};
  if (coldBy > 0) drain[config.coldDrains] = 1 + coldBy * config.drainPerDegree;
  if (heatBy > 0) drain[config.heatDrains] = 1 + heatBy * config.drainPerDegree;
  const past = Math.max(coldBy, heatBy) - config.damageAfterC;
  const damagePerSecond = past > 0 ? past * config.damagePerDegree : 0;
  const band =
    tierAt(config.bands.cold, coldBy, { inclusive: false })?.id ??
    tierAt(config.bands.hot, heatBy, { inclusive: false })?.id ??
    config.bands.comfortable;
  return { band, ambientC, coldBy, heatBy, drain, damagePerSecond: clamp(damagePerSecond, 0, Number.MAX_VALUE) };
}
