// @skill jgengine-gameplay
import { clamp } from "../math/scalar";

/** What sets the air temperature at a spot: its climate plus the hour, the weather, the height and nearby heat. */
export interface AmbientInput {
  /** The climate's daily mean in °C (a beach 25, a redwood 15, a snow peak -10). */
  baseC: number;
  /** Half the day-to-night range in °C; noon sits at `baseC + swing`, midnight at `baseC - swing`. */
  daySwingC?: number;
  /** Time of day as a 0..1 fraction where 0.5 is noon. */
  dayFraction?: number;
  /** Weather offset in °C (rain -4, a blizzard -15, a heat wave +8). */
  weatherC?: number;
  /** Height above the reference level in metres. */
  altitude?: number;
  /** °C lost per metre of altitude. Default 0.0065 (the standard lapse rate). */
  lapsePerMetre?: number;
  /** Heat from nearby sources in °C (a campfire, a torch). */
  heatC?: number;
  /** Soaked (swimming, rain without shelter): applies `wetC`. */
  wet?: boolean;
  /** Offset while wet. Default -6. */
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

/** How well a body copes: its comfortable band, what its gear and stats add, and what each degree outside costs. */
export interface ComfortConfig {
  /** Comfortable band in °C with no insulation, e.g. `[10, 30]`. */
  comfortC: readonly [number, number];
  /** Extra drain multiplier per °C outside the band (0.05 = +5% per degree). Default 0.05. */
  drainPerDegree?: number;
  /** Which vital each side burns faster: cold eats food, heat drinks water. */
  coldDrains?: string;
  heatDrains?: string;
  /** °C outside the band where the body starts taking damage. Default 15. */
  damageAfterC?: number;
  /** Health per second per °C past `damageAfterC`. Default 0.1. */
  damagePerDegree?: number;
  /** °C each fortitude point widens both sides of the band. Default 0.2. */
  fortitudeC?: number;
}

/** A body's insulation from worn gear and stats. */
export interface Insulation {
  /** °C the cold side of the band drops by (fur, hide). */
  cold?: number;
  /** °C the hot side rises by (cloth, ghillie). */
  heat?: number;
  /** Fortitude points; each widens both sides by `fortitudeC`. */
  fortitude?: number;
}

/** Comfort band a body is in. */
export type ComfortBand = "freezing" | "cold" | "comfortable" | "hot" | "scorching";

/** What the temperature does to a body right now. */
export interface BodyComfort {
  band: ComfortBand;
  ambientC: number;
  /** Degrees below the cold edge of the widened band (0 when not cold). */
  coldBy: number;
  /** Degrees above the hot edge (0 when not hot). */
  heatBy: number;
  /** Drain multipliers per vital id, ready for `Vitals.tick({ drain })`. */
  drain: Record<string, number>;
  /** Health lost per second from exposure. */
  damagePerSecond: number;
}

/**
 * Turn an ambient temperature into its cost for one body: a comfortable band widened by insulation
 * and fortitude, drain multipliers on the vitals each side burns, and exposure damage past a margin.
 *
 * @capability body-temperature hypothermia and hyperthermia from ambient temperature, insulation and fortitude, as vital drain and exposure damage
 */
export function bodyComfort(ambientC: number, config: ComfortConfig, insulation: Insulation = {}): BodyComfort {
  const widen = (insulation.fortitude ?? 0) * (config.fortitudeC ?? 0.2);
  const low = config.comfortC[0] - (insulation.cold ?? 0) - widen;
  const high = config.comfortC[1] + (insulation.heat ?? 0) + widen;
  const coldBy = Math.max(0, low - ambientC);
  const heatBy = Math.max(0, ambientC - high);
  const perDegree = config.drainPerDegree ?? 0.05;
  const margin = config.damageAfterC ?? 15;
  const drain: Record<string, number> = {};
  if (coldBy > 0) drain[config.coldDrains ?? "food"] = 1 + coldBy * perDegree;
  if (heatBy > 0) drain[config.heatDrains ?? "water"] = 1 + heatBy * perDegree;
  const past = Math.max(coldBy, heatBy) - margin;
  const damagePerSecond = past > 0 ? past * (config.damagePerDegree ?? 0.1) : 0;
  const band: ComfortBand =
    coldBy > margin ? "freezing" : coldBy > 0 ? "cold" : heatBy > margin ? "scorching" : heatBy > 0 ? "hot" : "comfortable";
  return { band, ambientC, coldBy, heatBy, drain, damagePerSecond: clamp(damagePerSecond, 0, Number.MAX_VALUE) };
}
