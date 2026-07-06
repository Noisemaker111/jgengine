import type {
  ArenaWorldConfig,
  HeightfieldWorldConfig,
  RollingWorldConfig,
  WorldBounds,
  WorldFeature,
} from "./features";

export type TerrainNormal = readonly [number, number, number];

export interface TerrainField {
  sampleHeight(x: number, z: number): number;
  sampleNormal(x: number, z: number): TerrainNormal;
  readonly bounds?: WorldBounds;
  readonly waterLevel?: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash2(ix: number, iz: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (ix | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (iz | 0), 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const top = lerp(v00, v10, sx);
  const bottom = lerp(v01, v11, sx);
  return lerp(top, bottom, sz) * 2 - 1;
}

export interface FractalNoiseConfig {
  seed: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  ridged: boolean;
}

function fractalNoise(x: number, z: number, config: FractalNoiseConfig): number {
  let amplitude = 1;
  let frequency = config.frequency;
  let sum = 0;
  let norm = 0;
  for (let octave = 0; octave < config.octaves; octave += 1) {
    let sample = valueNoise(x * frequency, z * frequency, config.seed + octave * 1013);
    if (config.ridged) sample = 1 - 2 * Math.abs(sample);
    sum += sample * amplitude;
    norm += amplitude;
    amplitude *= config.persistence;
    frequency *= config.lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

function withNormal(sampleHeight: (x: number, z: number) => number): TerrainField["sampleNormal"] {
  const epsilon = 0.75;
  return (x, z) => {
    const hx = sampleHeight(x + epsilon, z) - sampleHeight(x - epsilon, z);
    const hz = sampleHeight(x, z + epsilon) - sampleHeight(x, z - epsilon);
    const nx = -hx;
    const nz = -hz;
    const ny = 2 * epsilon;
    const length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length] as const;
  };
}

function fieldFromHeight(
  sampleHeight: (x: number, z: number) => number,
  extra?: { bounds?: WorldBounds; waterLevel?: number },
): TerrainField {
  return {
    sampleHeight,
    sampleNormal: withNormal(sampleHeight),
    bounds: extra?.bounds,
    waterLevel: extra?.waterLevel,
  };
}

function seedFrom(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") return value | 0;
  if (typeof value === "string") {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash | 0;
  }
  return fallback;
}

export const FLAT_FIELD: TerrainField = {
  sampleHeight: () => 0,
  sampleNormal: () => [0, 1, 0] as const,
};

export function flatField(): TerrainField {
  return FLAT_FIELD;
}

export interface NoiseFieldConfig {
  seed?: string | number;
  amplitude?: number;
  frequency?: number;
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
  baseHeight?: number;
  ridged?: boolean;
  bounds?: WorldBounds;
  waterLevel?: number;
}

export function noiseField(config: NoiseFieldConfig = {}): TerrainField {
  const fractal: FractalNoiseConfig = {
    seed: seedFrom(config.seed, 1337),
    frequency: config.frequency ?? 0.03,
    octaves: config.octaves ?? 4,
    lacunarity: config.lacunarity ?? 2,
    persistence: config.persistence ?? 0.5,
    ridged: config.ridged ?? false,
  };
  const amplitude = config.amplitude ?? 1;
  const baseHeight = config.baseHeight ?? 0;
  return fieldFromHeight((x, z) => baseHeight + amplitude * fractalNoise(x, z, fractal), {
    bounds: config.bounds,
    waterLevel: config.waterLevel,
  });
}

export function rollingField(config: RollingWorldConfig = {}): TerrainField {
  return noiseField({
    seed: config.seed ?? "rolling",
    amplitude: config.amplitude ?? 0.55,
    frequency: config.frequency ?? 0.03,
    octaves: 3,
    persistence: 0.55,
    bounds: config.bounds,
  });
}

const ARENA_PLATEAU_HEIGHT = 6;
const ARENA_HILL_HEIGHT = 4.2;
const ARENA_BASIN_DEPTH = 2.6;
export const ARENA_WATER_LEVEL = -0.9;

export function arenaField(config: ArenaWorldConfig = {}): TerrainField {
  const seed = seedFrom(config.seed ?? "arena", 7);
  const rolling: FractalNoiseConfig = {
    seed,
    frequency: 0.03,
    octaves: 3,
    lacunarity: 2,
    persistence: 0.5,
    ridged: false,
  };
  const sampleHeight = (x: number, z: number): number => {
    const distToSpawn = Math.hypot(x, z);
    const spawn = 1 - smoothstep(14, 24, distToSpawn);
    const undulation = 0.55 * fractalNoise(x, z, rolling);

    const cliff = smoothstep(20, 27, z);
    const ramp = smoothstep(16, 46, z);
    const inRamp = 1 - clamp01(Math.abs(x) / 6);
    const plateauExtent = 1 - smoothstep(30, 42, Math.abs(x));
    const mesa = ARENA_PLATEAU_HEIGHT * plateauExtent * lerp(cliff, ramp, inRamp);

    const hillDist = Math.hypot(x - 34, z + 8) / 18;
    const hillFalloff = smoothstep(0, 1, 1 - hillDist);
    const hill = ARENA_HILL_HEIGHT * hillFalloff;

    const basinDist = Math.hypot(x + 40, z + 20) / 20;
    const basin = -ARENA_BASIN_DEPTH * smoothstep(0, 1, 1 - basinDist);

    return (undulation + mesa + hill + basin) * (1 - spawn);
  };
  return fieldFromHeight(sampleHeight, { bounds: config.bounds, waterLevel: ARENA_WATER_LEVEL });
}

export function heightfieldField(config: HeightfieldWorldConfig): TerrainField {
  return noiseField(config);
}

export function terrainFieldFor(world?: WorldFeature): TerrainField {
  switch (world?.kind) {
    case "flat":
      return flatField();
    case "rolling":
      return rollingField(world);
    case "arena":
      return arenaField(world);
    case "heightfield":
      return heightfieldField(world);
    case undefined:
      return rollingField();
    default:
      return rollingField();
  }
}
