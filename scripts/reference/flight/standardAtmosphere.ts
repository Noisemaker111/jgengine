// @skill jgengine-world

/** Air state at one altitude, SI units. */
export interface AtmosphereSample {
  /** Kinetic temperature, K. */
  temperature: number;
  /** Static pressure, Pa. */
  pressure: number;
  /** Density, kg/m³. */
  density: number;
  /** Speed of sound, m/s. */
  speedOfSound: number;
  /** Dynamic viscosity, Pa·s. */
  viscosity: number;
}

/** An air model: geometric altitude above mean sea level, m, to the air state there. */
export type AtmosphereModel = (altitude: number) => AtmosphereSample;

/** Effective Earth radius the 1976 standard uses for geopotential altitude and gravity, m. */
export const STANDARD_EARTH_RADIUS = 6356766;
/** Standard sea-level gravity, m/s². */
export const STANDARD_GRAVITY = 9.80665;
/** Sea-level standard pressure, Pa. */
export const SEA_LEVEL_PRESSURE = 101325;
/** Sea-level standard density, kg/m³. */
export const SEA_LEVEL_DENSITY = 1.225;
/** Sea-level standard speed of sound, m/s. */
export const SEA_LEVEL_SPEED_OF_SOUND = 340.294;

const GAS_CONSTANT = 8314.32;
const MOLAR_MASS = 28.9644;
const AIR_GAS_CONSTANT = GAS_CONSTANT / MOLAR_MASS;
const GAMMA = 1.4;
const SUTHERLAND_BETA = 1.458e-6;
const SUTHERLAND_S = 110.4;

/** Geopotential layer bases, m', and molecular-scale temperature gradients, K/m' (USSA 1976 Table 4). */
const LAYER_BASE = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852] as const;
const LAYER_GRADIENT = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002] as const;

/** Molecular weight ratio M/M0 between 80 and 86 km geometric, every 0.5 km (USSA 1976 Table 8). */
const MOLECULAR_RATIO = [1, 0.999996, 0.999989, 0.999971, 0.999941, 0.999909, 0.99987, 0.999829, 0.999786, 0.999741, 0.999694, 0.999641, 0.999579] as const;

interface Layer {
  base: number;
  gradient: number;
  temperature: number;
  pressure: number;
}

const LAYERS: readonly Layer[] = buildLayers();

function buildLayers(): Layer[] {
  const layers: Layer[] = [];
  let temperature = 288.15;
  let pressure = SEA_LEVEL_PRESSURE;
  for (let i = 0; i < LAYER_GRADIENT.length; i += 1) {
    const base = LAYER_BASE[i] ?? 0;
    const gradient = LAYER_GRADIENT[i] ?? 0;
    layers.push({ base, gradient, temperature, pressure });
    const top = LAYER_BASE[i + 1] ?? base;
    const next = layerPressure({ base, gradient, temperature, pressure }, top);
    temperature += gradient * (top - base);
    pressure = next;
  }
  return layers;
}

function layerPressure(layer: Layer, geopotential: number): number {
  const dh = geopotential - layer.base;
  if (layer.gradient === 0) return layer.pressure * Math.exp((-STANDARD_GRAVITY * dh) / (AIR_GAS_CONSTANT * layer.temperature));
  const temperature = layer.temperature + layer.gradient * dh;
  return layer.pressure * (layer.temperature / temperature) ** (STANDARD_GRAVITY / (AIR_GAS_CONSTANT * layer.gradient));
}

function molecularRatio(altitude: number): number {
  if (altitude <= 80000) return 1;
  const position = Math.min(MOLECULAR_RATIO.length - 1, (altitude - 80000) / 500);
  const index = Math.min(MOLECULAR_RATIO.length - 2, Math.floor(position));
  const lower = MOLECULAR_RATIO[index] ?? 1;
  const upper = MOLECULAR_RATIO[index + 1] ?? lower;
  return lower + (upper - lower) * (position - index);
}

/**
 * Geopotential altitude, m', of a geometric altitude, m.
 * @capability standard-atmosphere geopotential altitude from geometric altitude
 */
export function geopotentialAltitude(altitude: number): number {
  return (STANDARD_EARTH_RADIUS * altitude) / (STANDARD_EARTH_RADIUS + altitude);
}

/**
 * Gravity at a geometric altitude, m/s², by the inverse-square law the 1976 standard uses.
 * @capability standard-atmosphere gravity at altitude
 */
export function standardGravity(altitude: number): number {
  const ratio = STANDARD_EARTH_RADIUS / (STANDARD_EARTH_RADIUS + altitude);
  return STANDARD_GRAVITY * ratio * ratio;
}

/**
 * The U.S. Standard Atmosphere 1976 (NOAA/NASA/USAF, NOAA-S/T 76-1562) from −5 km to 86 km geometric altitude: the
 * seven geopotential layers with their molecular-scale temperature gradients, hydrostatic pressure, the molecular
 * weight change between 80 and 86 km, the speed of sound and Sutherland's viscosity. Above 86 km it continues the
 * 86 km layer isothermally, which the standard does not define.
 * @capability standard-atmosphere U.S. Standard Atmosphere 1976 temperature, pressure, density, speed of sound and viscosity by altitude
 */
export function standardAtmosphere(altitude: number): AtmosphereSample {
  const h = geopotentialAltitude(altitude);
  let layer = LAYERS[0];
  for (const candidate of LAYERS) if (h >= candidate.base) layer = candidate;
  if (layer === undefined) throw new Error("standardAtmosphere: no layers");
  const molecularTemperature = layer.temperature + layer.gradient * (h - layer.base);
  const pressure = layerPressure(layer, h);
  const temperature = molecularTemperature * molecularRatio(altitude);
  const density = pressure / (AIR_GAS_CONSTANT * molecularTemperature);
  return {
    temperature,
    pressure,
    density,
    speedOfSound: Math.sqrt(GAMMA * AIR_GAS_CONSTANT * molecularTemperature),
    viscosity: (SUTHERLAND_BETA * temperature ** 1.5) / (temperature + SUTHERLAND_S),
  };
}

/**
 * Calibrated airspeed, m/s, for a true airspeed in an air state: the subsonic isentropic pitot relation referred to
 * sea-level standard conditions, which is what an airspeed indicator without position error reads.
 * @capability standard-atmosphere calibrated airspeed from true airspeed
 */
export function calibratedAirspeed(trueAirspeed: number, air: AtmosphereSample): number {
  const mach = trueAirspeed / air.speedOfSound;
  const impact = air.pressure * ((1 + 0.2 * mach * mach) ** 3.5 - 1);
  return SEA_LEVEL_SPEED_OF_SOUND * Math.sqrt(5 * ((impact / SEA_LEVEL_PRESSURE + 1) ** (2 / 7) - 1));
}
