import type { WorldBounds } from "./features";
import {
  fractalNoise,
  withNormal,
  type FractalNoiseConfig,
  type TerrainField,
} from "./terrain";

export type BiomeEffectKind = "slowness" | "blindness" | "poison" | "regen" | "haste";

export interface BiomeEffect {
  kind: BiomeEffectKind;
  strength: number;
}

export interface BiomeSpawn {
  entity: string;
  weight: number;
  night?: boolean;
}

export interface BiomeStructure {
  id: string;
  rarity: number;
}

export interface BiomeClimate {
  temperature: number;
  humidity: number;
  continentalness: number;
}

export interface BiomeDef {
  id: string;
  displayName: string;
  climate: BiomeClimate;
  baseHeight: number;
  amplitude: number;
  frequency: number;
  octaves?: number;
  ridged?: boolean;
  surface: string;
  surfaceSteep?: string;
  water?: string;
  fog?: string;
  spawns?: readonly BiomeSpawn[];
  structures?: readonly BiomeStructure[];
  effects?: readonly BiomeEffect[];
  materials?: readonly string[];
}

export type Rgb = readonly [number, number, number];

export interface BiomeSample {
  biome: BiomeDef;
  weight: number;
  climate: BiomeClimate;
  surface: Rgb;
  steep: Rgb;
  water: Rgb | null;
  fog: Rgb | null;
  effects: readonly BiomeEffect[];
}

export interface BiomeField extends TerrainField {
  sampleBiome(x: number, z: number): BiomeSample;
  readonly catalog: readonly BiomeDef[];
  readonly seaLevel: number;
}

export const DEFAULT_BIOMES: readonly BiomeDef[] = [
  { id: "deep_ocean", displayName: "Deep Ocean", climate: { temperature: 0.5, humidity: 0.5, continentalness: 0.04 }, baseHeight: -14, amplitude: 3, frequency: 0.01, surface: "#3a4a5a", water: "#1c3550", materials: ["water", "gravel"], spawns: [{ entity: "squid", weight: 1 }] },
  { id: "ocean", displayName: "Ocean", climate: { temperature: 0.55, humidity: 0.5, continentalness: 0.17 }, baseHeight: -6, amplitude: 2, frequency: 0.012, surface: "#4a5a68", water: "#245070", materials: ["water", "sand"], spawns: [{ entity: "cod", weight: 1 }] },
  { id: "warm_ocean", displayName: "Warm Ocean", climate: { temperature: 0.9, humidity: 0.5, continentalness: 0.17 }, baseHeight: -5, amplitude: 1.5, frequency: 0.012, surface: "#5b6b62", water: "#1f8fa8", materials: ["water", "sand"], spawns: [{ entity: "tropical_fish", weight: 1 }] },
  { id: "frozen_ocean", displayName: "Frozen Ocean", climate: { temperature: 0.05, humidity: 0.5, continentalness: 0.16 }, baseHeight: -5, amplitude: 1.5, frequency: 0.012, surface: "#7f8a95", water: "#7fa8c4", fog: "#cdd8e2", materials: ["water", "ice"], effects: [{ kind: "slowness", strength: 0.15 }] },
  { id: "beach", displayName: "Beach", climate: { temperature: 0.55, humidity: 0.3, continentalness: 0.33 }, baseHeight: 0.4, amplitude: 0.4, frequency: 0.03, surface: "#d9cf9a", water: "#2b6f90", materials: ["sand"] },
  { id: "snowy_beach", displayName: "Snowy Beach", climate: { temperature: 0.12, humidity: 0.3, continentalness: 0.33 }, baseHeight: 0.4, amplitude: 0.4, frequency: 0.03, surface: "#dfe4e6", water: "#6f9ab8", materials: ["sand", "snow"] },
  { id: "plains", displayName: "Plains", climate: { temperature: 0.55, humidity: 0.4, continentalness: 0.55 }, baseHeight: 1, amplitude: 1.3, frequency: 0.02, surface: "#5a8a3c", surfaceSteep: "#6b6f55", materials: ["grass", "dirt"], spawns: [{ entity: "cow", weight: 2 }, { entity: "zombie", weight: 1, night: true }], structures: [{ id: "village", rarity: 0.02 }] },
  { id: "meadow", displayName: "Meadow", climate: { temperature: 0.48, humidity: 0.55, continentalness: 0.6 }, baseHeight: 2, amplitude: 1.6, frequency: 0.02, surface: "#6fa64a", materials: ["grass"], effects: [{ kind: "regen", strength: 0.1 }], spawns: [{ entity: "sheep", weight: 2 }] },
  { id: "forest", displayName: "Forest", climate: { temperature: 0.5, humidity: 0.62, continentalness: 0.58 }, baseHeight: 1.5, amplitude: 1.8, frequency: 0.022, surface: "#3f6f2e", surfaceSteep: "#5c5a44", materials: ["grass", "oak_log"], spawns: [{ entity: "wolf", weight: 1 }, { entity: "zombie", weight: 1, night: true }] },
  { id: "birch_forest", displayName: "Birch Forest", climate: { temperature: 0.46, humidity: 0.56, continentalness: 0.58 }, baseHeight: 1.5, amplitude: 1.8, frequency: 0.022, surface: "#5a8a4a", materials: ["grass", "birch_log"] },
  { id: "dark_forest", displayName: "Dark Forest", climate: { temperature: 0.5, humidity: 0.72, continentalness: 0.6 }, baseHeight: 1.5, amplitude: 2, frequency: 0.022, surface: "#2c4a24", fog: "#141b14", materials: ["grass", "dark_oak_log"], effects: [{ kind: "blindness", strength: 0.5 }], spawns: [{ entity: "spider", weight: 1 }, { entity: "enderman", weight: 1, night: true }] },
  { id: "taiga", displayName: "Taiga", climate: { temperature: 0.3, humidity: 0.6, continentalness: 0.58 }, baseHeight: 1.5, amplitude: 2, frequency: 0.022, surface: "#3a5a40", materials: ["grass", "spruce_log"], spawns: [{ entity: "wolf", weight: 1 }, { entity: "fox", weight: 1 }] },
  { id: "snowy_taiga", displayName: "Snowy Taiga", climate: { temperature: 0.14, humidity: 0.52, continentalness: 0.58 }, baseHeight: 1.5, amplitude: 2, frequency: 0.022, surface: "#cdd6cf", fog: "#dfe8e4", materials: ["snow", "spruce_log"], effects: [{ kind: "slowness", strength: 0.12 }] },
  { id: "snowy_plains", displayName: "Snowy Plains", climate: { temperature: 0.08, humidity: 0.3, continentalness: 0.55 }, baseHeight: 1, amplitude: 1.2, frequency: 0.02, surface: "#e6ecee", fog: "#e6eef2", materials: ["snow"], effects: [{ kind: "slowness", strength: 0.15 }], spawns: [{ entity: "stray", weight: 1, night: true }] },
  { id: "swamp", displayName: "Swamp", climate: { temperature: 0.62, humidity: 0.85, continentalness: 0.46 }, baseHeight: -0.4, amplitude: 0.6, frequency: 0.03, surface: "#4a5a30", water: "#3f4a2a", fog: "#43502f", materials: ["grass", "mud", "water"], effects: [{ kind: "slowness", strength: 0.25 }], spawns: [{ entity: "slime", weight: 2 }, { entity: "witch", weight: 1 }], structures: [{ id: "witch_hut", rarity: 0.03 }] },
  { id: "mangrove", displayName: "Mangrove Swamp", climate: { temperature: 0.82, humidity: 0.9, continentalness: 0.46 }, baseHeight: -0.3, amplitude: 0.6, frequency: 0.03, surface: "#3f6636", water: "#4a6a4a", materials: ["mud", "mangrove_log", "water"], effects: [{ kind: "slowness", strength: 0.2 }] },
  { id: "jungle", displayName: "Jungle", climate: { temperature: 0.88, humidity: 0.9, continentalness: 0.6 }, baseHeight: 3, amplitude: 4, frequency: 0.03, surface: "#2f6b1f", surfaceSteep: "#4a5a2a", fog: "#254d1c", materials: ["grass", "jungle_log"], spawns: [{ entity: "parrot", weight: 1 }, { entity: "ocelot", weight: 1 }], structures: [{ id: "jungle_temple", rarity: 0.02 }] },
  { id: "savanna", displayName: "Savanna", climate: { temperature: 0.82, humidity: 0.25, continentalness: 0.55 }, baseHeight: 1.5, amplitude: 1.4, frequency: 0.02, surface: "#8a9a4a", materials: ["grass", "acacia_log"], spawns: [{ entity: "horse", weight: 1 }] },
  { id: "desert", displayName: "Desert", climate: { temperature: 0.96, humidity: 0.05, continentalness: 0.55 }, baseHeight: 1, amplitude: 1.4, frequency: 0.022, surface: "#e0cd82", materials: ["sand", "sandstone"], spawns: [{ entity: "husk", weight: 2, night: true }, { entity: "rabbit", weight: 1 }], structures: [{ id: "desert_pyramid", rarity: 0.02 }] },
  { id: "badlands", displayName: "Badlands", climate: { temperature: 0.92, humidity: 0.1, continentalness: 0.66 }, baseHeight: 6, amplitude: 7, frequency: 0.024, ridged: true, surface: "#b5622f", surfaceSteep: "#8a4a28", materials: ["red_sand", "terracotta"] },
  { id: "windswept_hills", displayName: "Windswept Hills", climate: { temperature: 0.4, humidity: 0.4, continentalness: 0.84 }, baseHeight: 12, amplitude: 14, frequency: 0.015, ridged: true, surface: "#5a6a4a", surfaceSteep: "#787c74", materials: ["stone", "grass"], spawns: [{ entity: "goat", weight: 1 }] },
  { id: "stony_peaks", displayName: "Stony Peaks", climate: { temperature: 0.6, humidity: 0.4, continentalness: 0.95 }, baseHeight: 20, amplitude: 18, frequency: 0.014, ridged: true, surface: "#7a7d82", surfaceSteep: "#8f9298", materials: ["stone", "gravel"] },
  { id: "snowy_peaks", displayName: "Snowy Peaks", climate: { temperature: 0.08, humidity: 0.45, continentalness: 0.95 }, baseHeight: 22, amplitude: 20, frequency: 0.014, ridged: true, surface: "#eef3f6", surfaceSteep: "#b9c4cc", fog: "#dfe8ee", materials: ["snow", "ice", "stone"], effects: [{ kind: "slowness", strength: 0.18 }] },
  { id: "jagged_peaks", displayName: "Jagged Peaks", climate: { temperature: 0.12, humidity: 0.55, continentalness: 1 }, baseHeight: 26, amplitude: 26, frequency: 0.013, ridged: true, surface: "#f2f6f8", surfaceSteep: "#9aa6ae", materials: ["snow", "stone"], effects: [{ kind: "slowness", strength: 0.2 }] },
];

function hexToRgb(hex: string): Rgb {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function climateNoise(x: number, z: number, seed: number, frequency: number): number {
  const config: FractalNoiseConfig = { seed, frequency, octaves: 3, lacunarity: 2, persistence: 0.5, ridged: false };
  return Math.max(0, Math.min(1, 0.5 + fractalNoise(x, z, config) * 0.9));
}

const CLIMATE_SHARPNESS = 6;
const CONTINENTALNESS_WEIGHT = 1.7;

export interface BiomeFieldConfig {
  seed?: number;
  catalog?: readonly BiomeDef[];
  bounds?: WorldBounds;
  seaLevel?: number;
}

export function createBiomeField(config: BiomeFieldConfig = {}): BiomeField {
  const seed = config.seed ?? 1337;
  const catalog = config.catalog && config.catalog.length > 0 ? config.catalog : DEFAULT_BIOMES;
  const seaLevel = config.seaLevel ?? 0;

  const heightConfigs = catalog.map((biome) => ({
    seed: seed ^ hashId(biome.id),
    frequency: biome.frequency,
    octaves: biome.octaves ?? 4,
    lacunarity: 2,
    persistence: 0.5,
    ridged: biome.ridged ?? false,
  }));
  const surfaces = catalog.map((biome) => hexToRgb(biome.surface));
  const steeps = catalog.map((biome) => hexToRgb(biome.surfaceSteep ?? biome.surface));
  const waters = catalog.map((biome) => (biome.water !== undefined ? hexToRgb(biome.water) : null));
  const fogs = catalog.map((biome) => (biome.fog !== undefined ? hexToRgb(biome.fog) : null));

  const warpConfig: FractalNoiseConfig = { seed: seed ^ 0x9e3779b1, frequency: 0.006, octaves: 2, lacunarity: 2, persistence: 0.5, ridged: false };

  const sampleClimate = (x: number, z: number): BiomeClimate => {
    const wx = x + fractalNoise(x, z, warpConfig) * 40;
    const wz = z + fractalNoise(z, x, warpConfig) * 40;
    return {
      temperature: climateNoise(wx, wz, seed ^ 0x1111, 0.004),
      humidity: climateNoise(wx, wz, seed ^ 0x2222, 0.005),
      continentalness: climateNoise(wx, wz, seed ^ 0x3333, 0.0026),
    };
  };

  const weightsFor = (climate: BiomeClimate): number[] => {
    const raw: number[] = new Array(catalog.length);
    let total = 0;
    for (let index = 0; index < catalog.length; index += 1) {
      const center = catalog[index]!.climate;
      const dc = (climate.continentalness - center.continentalness) * CONTINENTALNESS_WEIGHT;
      const dt = climate.temperature - center.temperature;
      const dh = climate.humidity - center.humidity;
      const distanceSq = dc * dc + dt * dt + dh * dh;
      const weight = Math.exp(-distanceSq * CLIMATE_SHARPNESS * catalog.length);
      raw[index] = weight;
      total += weight;
    }
    if (total === 0) return raw;
    for (let index = 0; index < raw.length; index += 1) raw[index]! /= total;
    return raw;
  };

  const biomeHeight = (index: number, x: number, z: number): number =>
    catalog[index]!.baseHeight + catalog[index]!.amplitude * fractalNoise(x, z, heightConfigs[index]!);

  const sampleHeight = (x: number, z: number): number => {
    const weights = weightsFor(sampleClimate(x, z));
    let height = 0;
    for (let index = 0; index < weights.length; index += 1) {
      if (weights[index]! < 0.01) continue;
      height += weights[index]! * biomeHeight(index, x, z);
    }
    return height;
  };

  const sampleBiome = (x: number, z: number): BiomeSample => {
    const climate = sampleClimate(x, z);
    const weights = weightsFor(climate);
    let dominant = 0;
    const surface: [number, number, number] = [0, 0, 0];
    const steep: [number, number, number] = [0, 0, 0];
    const water: [number, number, number] = [0, 0, 0];
    let waterWeight = 0;
    const fog: [number, number, number] = [0, 0, 0];
    let fogWeight = 0;
    for (let index = 0; index < weights.length; index += 1) {
      const weight = weights[index]!;
      if (weight > weights[dominant]!) dominant = index;
      if (weight < 0.01) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        surface[channel] += surfaces[index]![channel]! * weight;
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
      }
    }
    const normalize = (rgb: [number, number, number], weight: number): Rgb =>
      weight > 0 ? [rgb[0] / weight, rgb[1] / weight, rgb[2] / weight] : rgb;
    return {
      biome: catalog[dominant]!,
      weight: weights[dominant]!,
      climate,
      surface,
      steep,
      water: waterWeight > 0.05 ? normalize(water, waterWeight) : null,
      fog: fogWeight > 0.05 ? normalize(fog, fogWeight) : null,
      effects: catalog[dominant]!.effects ?? [],
    };
  };

  return {
    sampleHeight,
    sampleNormal: withNormal(sampleHeight),
    sampleBiome,
    catalog,
    seaLevel,
    waterLevel: seaLevel,
    bounds: config.bounds,
  };
}

export function isBiomeField(field: TerrainField): field is BiomeField {
  return "sampleBiome" in field;
}
