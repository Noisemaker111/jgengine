import type { WorldBounds } from "./features";
import {
  fractalNoise,
  withNormal,
  type FractalNoiseConfig,
  type TerrainField,
} from "./terrain";

export type Rgb = readonly [number, number, number];
export type ColorInput = string | Rgb;

export interface RegionHeight {
  baseHeight: number;
  amplitude: number;
  frequency: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  ridged?: boolean;
}

/**
 * A content-agnostic region. The engine blends `height` and the visual/physical
 * knobs (`tint`, `water`, `fog`, `speedMultiplier`, …) across region borders and
 * selects the dominant region by nearest center in `selector` space. `data` is an
 * opaque payload the engine never inspects — games hang their own content off it
 * (spawn tables, prop palettes, structure ids, names, …).
 */
export interface RegionDef<T = unknown> {
  id: string;
  selector: readonly number[];
  height: RegionHeight;
  tint?: ColorInput;
  steepTint?: ColorInput;
  water?: ColorInput;
  fog?: ColorInput;
  fogDensity?: number;
  speedMultiplier?: number;
  data?: T;
}

export interface RegionSample<T = unknown> {
  region: RegionDef<T>;
  weight: number;
  selector: readonly number[];
  tint: Rgb;
  steepTint: Rgb;
  water: Rgb | null;
  fog: Rgb | null;
  fogDensity: number;
  speedMultiplier: number;
  data: T | undefined;
}

export interface RegionField<T = unknown> extends TerrainField {
  sampleRegion(x: number, z: number): RegionSample<T>;
  readonly regions: readonly RegionDef<T>[];
  readonly seaLevel: number;
  readonly seed: number;
}

export interface RegionFieldConfig<T = unknown> {
  regions: readonly RegionDef<T>[];
  seed?: number;
  bounds?: WorldBounds;
  seaLevel?: number;
  /** Noise frequency per selector axis (defaults to 0.004 for every axis). */
  selectorFrequencies?: readonly number[];
  /** Per-axis distance weight when picking the nearest region (defaults to 1). */
  axisWeights?: readonly number[];
  /** Border sharpness; higher = tighter blends. */
  sharpness?: number;
  /** Domain-warp distance applied to selector sampling (0 disables). */
  warp?: number;
}

function toRgb(color: ColorInput | undefined, fallback: Rgb): Rgb {
  if (color === undefined) return fallback;
  if (typeof color !== "string") return color;
  const value = color.startsWith("#") ? color.slice(1) : color;
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function selectorNoise(x: number, z: number, seed: number, frequency: number): number {
  const config: FractalNoiseConfig = { seed, frequency, octaves: 3, lacunarity: 2, persistence: 0.5, ridged: false };
  return clamp01(0.5 + fractalNoise(x, z, config) * 0.9);
}

const DEFAULT_SELECTOR_FREQUENCY = 0.004;
const DEFAULT_SHARPNESS = 6;

export function createRegionField<T = unknown>(config: RegionFieldConfig<T>): RegionField<T> {
  if (config.regions.length === 0) throw new Error("createRegionField: regions must be non-empty");
  const seed = config.seed ?? 1337;
  const regions = config.regions;
  const seaLevel = config.seaLevel ?? 0;
  const axes = regions[0]!.selector.length;
  const sharpness = config.sharpness ?? DEFAULT_SHARPNESS;
  const warp = config.warp ?? 40;

  const heightConfigs = regions.map((region) => ({
    seed: seed ^ hashId(region.id),
    frequency: region.height.frequency,
    octaves: region.height.octaves ?? 4,
    lacunarity: region.height.lacunarity ?? 2,
    persistence: region.height.persistence ?? 0.5,
    ridged: region.height.ridged ?? false,
  }));
  const tints = regions.map((region) => toRgb(region.tint, [0.4, 0.42, 0.38]));
  const steeps = regions.map((region, index) => toRgb(region.steepTint, tints[index]!));
  const waters = regions.map((region) => (region.water !== undefined ? toRgb(region.water, [0, 0, 0]) : null));
  const fogs = regions.map((region) => (region.fog !== undefined ? toRgb(region.fog, [0, 0, 0]) : null));
  const axisSeeds = Array.from({ length: axes }, (_, axis) => seed ^ (0x1111 * (axis + 1)));
  const axisFrequencies = Array.from(
    { length: axes },
    (_, axis) => config.selectorFrequencies?.[axis] ?? DEFAULT_SELECTOR_FREQUENCY,
  );
  const axisWeights = Array.from({ length: axes }, (_, axis) => config.axisWeights?.[axis] ?? 1);
  const warpConfig: FractalNoiseConfig = { seed: seed ^ 0x9e3779b1, frequency: 0.006, octaves: 2, lacunarity: 2, persistence: 0.5, ridged: false };

  const sampleSelector = (x: number, z: number): number[] => {
    const wx = warp === 0 ? x : x + fractalNoise(x, z, warpConfig) * warp;
    const wz = warp === 0 ? z : z + fractalNoise(z, x, warpConfig) * warp;
    const values: number[] = new Array(axes);
    for (let axis = 0; axis < axes; axis += 1) {
      values[axis] = selectorNoise(wx, wz, axisSeeds[axis]!, axisFrequencies[axis]!);
    }
    return values;
  };

  const weightsFor = (selector: readonly number[]): number[] => {
    const raw: number[] = new Array(regions.length);
    let total = 0;
    for (let index = 0; index < regions.length; index += 1) {
      const center = regions[index]!.selector;
      let distanceSq = 0;
      for (let axis = 0; axis < axes; axis += 1) {
        const delta = (selector[axis]! - center[axis]!) * axisWeights[axis]!;
        distanceSq += delta * delta;
      }
      const weight = Math.exp(-distanceSq * sharpness * regions.length);
      raw[index] = weight;
      total += weight;
    }
    if (total > 0) for (let index = 0; index < raw.length; index += 1) raw[index]! /= total;
    return raw;
  };

  const regionHeight = (index: number, x: number, z: number): number =>
    regions[index]!.height.baseHeight + regions[index]!.height.amplitude * fractalNoise(x, z, heightConfigs[index]!);

  const sampleHeight = (x: number, z: number): number => {
    const weights = weightsFor(sampleSelector(x, z));
    let height = 0;
    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index]! < 0.01) continue;
      height += weights[index]! * regionHeight(index, x, z);
    }
    return height;
  };

  const sampleRegion = (x: number, z: number): RegionSample<T> => {
    const selector = sampleSelector(x, z);
    const weights = weightsFor(selector);
    let dominant = 0;
    const tint: [number, number, number] = [0, 0, 0];
    const steep: [number, number, number] = [0, 0, 0];
    const water: [number, number, number] = [0, 0, 0];
    let waterWeight = 0;
    const fog: [number, number, number] = [0, 0, 0];
    let fogWeight = 0;
    let fogDensity = 0;
    let speed = 0;
    let speedWeight = 0;
    for (let index = 0; index < weights.length; index += 1) {
      const weight = weights[index]!;
      if (weight > weights[dominant]!) dominant = index;
      if (weight < 0.01) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        tint[channel] += tints[index]![channel]! * weight;
        steep[channel] += steeps[index]![channel]! * weight;
      }
      const w = waters[index];
      if (w !== null) {
        for (let channel = 0; channel < 3; channel += 1) water[channel] += w[channel]! * weight;
        waterWeight += weight;
      }
      const f = fogs[index];
      if (f !== null) {
        for (let channel = 0; channel < 3; channel += 1) fog[channel] += f[channel]! * weight;
        fogWeight += weight;
        fogDensity += (regions[index]!.fogDensity ?? 0) * weight;
      }
      speed += (regions[index]!.speedMultiplier ?? 1) * weight;
      speedWeight += weight;
    }
    const normalize = (rgb: [number, number, number], weight: number): Rgb =>
      weight > 0 ? [rgb[0] / weight, rgb[1] / weight, rgb[2] / weight] : rgb;
    return {
      region: regions[dominant]!,
      weight: weights[dominant]!,
      selector,
      tint,
      steepTint: steep,
      water: waterWeight > 0.05 ? normalize(water, waterWeight) : null,
      fog: fogWeight > 0.05 ? normalize(fog, fogWeight) : null,
      fogDensity: fogWeight > 0.05 ? fogDensity / fogWeight : 0,
      speedMultiplier: speedWeight > 0 ? speed / speedWeight : 1,
      data: regions[dominant]!.data,
    };
  };

  return {
    sampleHeight,
    sampleNormal: withNormal(sampleHeight),
    sampleRegion,
    regions,
    seaLevel,
    seed,
    waterLevel: seaLevel,
    bounds: config.bounds,
  };
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

export function isRegionField(field: TerrainField): field is RegionField {
  return "sampleRegion" in field;
}
