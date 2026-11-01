// @skill jgengine-world

/** Sea-level standard air, SI units. */
export const SEA_LEVEL_AIR: Readonly<AirSample> = { density: 1.225, pressure: 101325, temperature: 288.15, speedOfSound: 340.294 };

/**
 * The standard atmosphere effect: air density, pressure and the speed of sound fall with altitude as the U.S. Standard
 * Atmosphere 1976 gives them, so wings, rotors and engines lose their grip on the air as the aircraft climbs.
 */
export interface AircraftAtmosphere {
  /**
   * Multiplier on the effect: `0` off (sea-level air everywhere, the simple model), `1` the standard atmosphere
   * (default), past `1` the air thins faster with height (each ratio to sea level is raised to the strength); sane over `0..4`.
   */
  strength?: number;
  /** Height of the world's `y = 0` above mean sea level, m (default `0`). */
  elevation?: number;
  /** Sea-level temperature offset from standard, K (default `0`); hot days thin the air. */
  temperatureOffset?: number;
}

/** Air state at one altitude. */
export interface AirSample {
  density: number;
  pressure: number;
  temperature: number;
  speedOfSound: number;
}

const GRAVITY = 9.80665;
const AIR_GAS_CONSTANT = 8314.32 / 28.9644;
const EARTH_RADIUS = 6356766;
const LAYER_BASE = [0, 11000, 20000, 32000, 47000, 51000, 71000] as const;
const LAYER_GRADIENT = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002] as const;
const LAYER_TEMPERATURE: number[] = [];
const LAYER_PRESSURE: number[] = [];

function layerPressure(base: number, gradient: number, temperature: number, pressure: number, geopotential: number): number {
  const dh = geopotential - base;
  if (gradient === 0) return pressure * Math.exp((-GRAVITY * dh) / (AIR_GAS_CONSTANT * temperature));
  return pressure * (temperature / (temperature + gradient * dh)) ** (GRAVITY / (AIR_GAS_CONSTANT * gradient));
}

{
  let temperature = SEA_LEVEL_AIR.temperature;
  let pressure = SEA_LEVEL_AIR.pressure;
  for (let i = 0; i < LAYER_BASE.length; i += 1) {
    const base = LAYER_BASE[i] ?? 0;
    const gradient = LAYER_GRADIENT[i] ?? 0;
    LAYER_TEMPERATURE.push(temperature);
    LAYER_PRESSURE.push(pressure);
    const top = LAYER_BASE[i + 1] ?? base;
    pressure = layerPressure(base, gradient, temperature, pressure, top);
    temperature += gradient * (top - base);
  }
}

/**
 * The U.S. Standard Atmosphere 1976 (NOAA-S/T 76-1562) at a geometric altitude above mean sea level, m, from −5 km to
 * 86 km: geopotential layers with their temperature gradients and hydrostatic pressure. `temperatureOffset`, K, shifts
 * the whole temperature profile (a hot or cold day) at the standard pressures.
 * @capability aircraft-atmosphere standard atmosphere density, pressure, temperature and speed of sound by altitude
 */
export function standardAir(altitude: number, temperatureOffset = 0, out: AirSample = { density: 0, pressure: 0, temperature: 0, speedOfSound: 0 }): AirSample {
  const h = (EARTH_RADIUS * altitude) / (EARTH_RADIUS + altitude);
  let index = 0;
  for (let i = 1; i < LAYER_BASE.length; i += 1) if (h >= (LAYER_BASE[i] ?? 0)) index = i;
  const base = LAYER_BASE[index] ?? 0;
  const gradient = LAYER_GRADIENT[index] ?? 0;
  const baseTemperature = LAYER_TEMPERATURE[index] ?? SEA_LEVEL_AIR.temperature;
  const pressure = layerPressure(base, gradient, baseTemperature, LAYER_PRESSURE[index] ?? SEA_LEVEL_AIR.pressure, h);
  const temperature = Math.max(100, baseTemperature + gradient * (h - base) + temperatureOffset);
  out.pressure = pressure;
  out.temperature = temperature;
  out.density = pressure / (AIR_GAS_CONSTANT * temperature);
  out.speedOfSound = Math.sqrt(1.4 * AIR_GAS_CONSTANT * temperature);
  return out;
}

/**
 * The air an aircraft at world height `y` flies in under an {@link AircraftAtmosphere} effect at its strength: each of
 * density, pressure and speed of sound is its sea-level value times its standard-atmosphere ratio raised to the
 * strength, so `0` is sea-level air and `1` the standard atmosphere.
 * @capability aircraft-atmosphere the air at an aircraft's height under the atmosphere effect's strength
 */
export function atmosphereAt(effect: AircraftAtmosphere, strength: number, y: number, out: AirSample): AirSample {
  standardAir(y + (effect.elevation ?? 0), effect.temperatureOffset ?? 0, out);
  const s = Math.max(0, strength);
  out.density = SEA_LEVEL_AIR.density * (out.density / SEA_LEVEL_AIR.density) ** s;
  out.pressure = SEA_LEVEL_AIR.pressure * (out.pressure / SEA_LEVEL_AIR.pressure) ** s;
  out.speedOfSound = SEA_LEVEL_AIR.speedOfSound * (out.speedOfSound / SEA_LEVEL_AIR.speedOfSound) ** s;
  out.temperature = SEA_LEVEL_AIR.temperature * (out.temperature / SEA_LEVEL_AIR.temperature) ** s;
  return out;
}
