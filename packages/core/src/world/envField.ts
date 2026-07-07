import { SECONDS_PER_GAME_DAY } from "../time/gameClock";
import type { TerrainField } from "./terrain";

/** A sky-occluding footprint — a roof, dense canopy, a cave mouth. `shade` 0..1 = fraction of sky blocked. */
export interface OccluderRect {
  x: number;
  z: number;
  w: number;
  d: number;
  shade?: number;
}

/** A localized warmth source — campfire, forge, geothermal vent. */
export interface HeatSource {
  x: number;
  z: number;
  radius: number;
  /** Degrees added at the center, falling to 0 at `radius`. */
  strength: number;
}

export type ShadeProvider = readonly OccluderRect[] | ((x: number, z: number) => number);
export type ScalarField = number | ((x: number, z: number, time: number) => number);

export interface EnvironmentFieldConfig {
  /** Game-seconds per day; drives the sun-elevation cycle. Default matches the sim clock day. */
  dayLength?: number;
  /** Temperature at sea level under a noon sun with no weather. Default 20. */
  baseTemperature?: number;
  /** Degrees colder at deep night vs noon. Default 12. */
  nightDrop?: number;
  /** Degrees lost per world-height unit above `seaLevel` (altitude lapse). Default 0. */
  altitudeLapse?: number;
  seaLevel?: number;
  /** Terrain field used to look up ground altitude when a caller omits `y`. */
  terrain?: TerrainField;
  /** Rain/precipitation intensity 0..1 at a position — from a weather state. Default 0. */
  rain?: ScalarField;
  /** Sky occluders (structures, canopy) that block sun and shelter from rain. */
  occluders?: ShadeProvider;
  /** Campfires and other warmth emitters. */
  heatSources?: readonly HeatSource[];
  /** Minimum ambient light at night (moonlight floor), 0..1. Default 0.05. */
  ambientFloor?: number;
  /** Per-position base-temperature offset (biome map). Added to `baseTemperature`. */
  temperatureAt?: (x: number, z: number) => number;
}

export interface EnvironmentSample {
  /** Degrees (game units). */
  temperature: number;
  /** 0..1 surface wetness. */
  wetness: number;
  /** 0..1 direct sun/sky exposure — full sun open sky = 1, deep shade/night = 0. */
  lightExposure: number;
  /** 0..1 overall light level for spawn gating — includes ambient/moonlight. */
  ambientLight: number;
  /** Under an occluder (roof/canopy) enough to shelter from rain. */
  sheltered: boolean;
}

export interface EnvironmentField {
  sample(x: number, z: number, time: number, y?: number): EnvironmentSample;
  temperature(x: number, z: number, time: number, y?: number): number;
  wetness(x: number, z: number, time: number): number;
  lightExposure(x: number, z: number, time: number): number;
  ambientLight(x: number, z: number, time: number): number;
  /** Sun elevation -1..1 (1 = noon overhead, 0 = horizon, negative = night). */
  sunElevation(time: number): number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function resolveScalar(field: ScalarField, x: number, z: number, time: number): number {
  return typeof field === "function" ? field(x, z, time) : field;
}

function pointInRect(rect: OccluderRect, x: number, z: number): boolean {
  return (
    x >= rect.x - rect.w / 2 &&
    x <= rect.x + rect.w / 2 &&
    z >= rect.z - rect.d / 2 &&
    z <= rect.z + rect.d / 2
  );
}

function resolveShade(provider: ShadeProvider | undefined, x: number, z: number): number {
  if (provider === undefined) return 0;
  if (typeof provider === "function") return clamp01(provider(x, z));
  let shade = 0;
  for (const rect of provider) {
    if (pointInRect(rect, x, z)) shade = Math.max(shade, rect.shade ?? 1);
  }
  return shade;
}

/**
 * A sampleable environment field: read temperature, wetness, sun/sky exposure, and
 * ambient light at any world position and time. Built on the same renderer-free footing
 * as terrain/wind/water so meters, spawn gating, and damage-in-sunlight read the world
 * the shell renders — no three.js. Instantaneous and pure (no accumulation); stateful
 * build-up belongs to a decay meter reading this field.
 */
export function createEnvironmentField(config: EnvironmentFieldConfig = {}): EnvironmentField {
  const dayLength = config.dayLength !== undefined && config.dayLength > 0 ? config.dayLength : SECONDS_PER_GAME_DAY;
  const baseTemperature = config.baseTemperature ?? 20;
  const nightDrop = config.nightDrop ?? 12;
  const altitudeLapse = config.altitudeLapse ?? 0;
  const seaLevel = config.seaLevel ?? 0;
  const ambientFloor = clamp01(config.ambientFloor ?? 0.05);
  const heatSources = config.heatSources ?? [];

  const sunElevation = (time: number): number => {
    const dayFraction = ((time % dayLength) + dayLength) % dayLength / dayLength;
    return Math.sin((dayFraction - 0.25) * 2 * Math.PI);
  };

  const heatAt = (x: number, z: number): number => {
    let heat = 0;
    for (const source of heatSources) {
      const distance = Math.hypot(x - source.x, z - source.z);
      if (distance >= source.radius) continue;
      heat += source.strength * (1 - distance / source.radius);
    }
    return heat;
  };

  const rainAt = (x: number, z: number, time: number): number =>
    config.rain === undefined ? 0 : clamp01(resolveScalar(config.rain, x, z, time));

  const wetness = (x: number, z: number, time: number): number => {
    const shade = resolveShade(config.occluders, x, z);
    return clamp01(rainAt(x, z, time) * (1 - shade));
  };

  const lightExposure = (x: number, z: number, time: number): number => {
    const shade = resolveShade(config.occluders, x, z);
    const daylight = Math.max(0, sunElevation(time));
    const cloud = 1 - rainAt(x, z, time) * 0.6;
    return clamp01(daylight * cloud * (1 - shade));
  };

  const ambientLight = (x: number, z: number, time: number): number => {
    const shade = resolveShade(config.occluders, x, z);
    const daylight = clamp01(sunElevation(time) * 0.5 + 0.5);
    const sky = ambientFloor + (1 - ambientFloor) * daylight;
    return clamp01(sky * (1 - shade * 0.75));
  };

  const temperature = (x: number, z: number, time: number, y?: number): number => {
    const altitude = y ?? config.terrain?.sampleHeight(x, z) ?? seaLevel;
    const daylight = clamp01(sunElevation(time) * 0.5 + 0.5);
    const base = baseTemperature + (config.temperatureAt?.(x, z) ?? 0);
    const lapse = altitudeLapse * Math.max(0, altitude - seaLevel);
    const wetChill = wetness(x, z, time) * 4;
    return base - nightDrop * (1 - daylight) - lapse - wetChill + heatAt(x, z);
  };

  return {
    sample(x, z, time, y) {
      return {
        temperature: temperature(x, z, time, y),
        wetness: wetness(x, z, time),
        lightExposure: lightExposure(x, z, time),
        ambientLight: ambientLight(x, z, time),
        sheltered: resolveShade(config.occluders, x, z) >= 0.5,
      };
    },
    temperature,
    wetness,
    lightExposure,
    ambientLight,
    sunElevation,
  };
}
