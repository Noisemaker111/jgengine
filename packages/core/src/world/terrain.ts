import type {
  TerrainColors,
  TerrainEnvironmentConfig,
  TerrainEnvironmentDescriptor,
  TerrainFlattenMask,
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

export function valueNoise(x: number, z: number, seed: number): number {
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

export function fractalNoise(x: number, z: number, config: FractalNoiseConfig): number {
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

export function seedFrom(value: string | number | undefined, fallback: number): number {
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

export function withNormal(sampleHeight: (x: number, z: number) => number): TerrainField["sampleNormal"] {
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
    ...(extra?.bounds === undefined ? {} : { bounds: extra.bounds }),
    ...(extra?.waterLevel === undefined ? {} : { waterLevel: extra.waterLevel }),
  };
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

export interface RollingFieldConfig {
  seed?: string | number;
  amplitude?: number;
  frequency?: number;
  bounds?: WorldBounds;
}

export function rollingField(config: RollingFieldConfig = {}): TerrainField {
  return noiseField({
    seed: config.seed ?? "rolling",
    amplitude: config.amplitude ?? 0.55,
    frequency: config.frequency ?? 0.03,
    octaves: 3,
    persistence: 0.55,
    bounds: config.bounds,
  });
}

export interface ArenaFieldConfig {
  seed?: string | number;
  bounds?: WorldBounds;
}

const ARENA_PLATEAU_HEIGHT = 6;
const ARENA_HILL_HEIGHT = 4.2;
const ARENA_BASIN_DEPTH = 2.6;
export const ARENA_WATER_LEVEL = -0.9;

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function arenaField(config: ArenaFieldConfig = {}): TerrainField {
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

export function groundFieldFor(world?: WorldFeature): TerrainField {
  if (world !== undefined && world.kind === "environment") return resolveTerrainField(world.terrain);
  return flatField();
}

export interface TerrainPalette {
  low: string;
  high: string;
  waterline: string;
}

export const DEFAULT_TERRAIN_MATERIAL = "grass";

export const TERRAIN_MATERIAL_PALETTES: Record<string, TerrainPalette> = {
  grass: { low: "#30402c", high: "#7f8b50", waterline: "#1d4c6e" },
  sand: { low: "#9c8354", high: "#e0c98a", waterline: "#2f6f8f" },
  snow: { low: "#c7d3dc", high: "#ffffff", waterline: "#3a6ea5" },
  rock: { low: "#3a3a3d", high: "#8a8a8d", waterline: "#1d4c6e" },
  ash: { low: "#2b2622", high: "#5c534a", waterline: "#3a3630" },
};

export function resolveTerrainPalette(descriptor: Pick<TerrainEnvironmentConfig, "material" | "colors"> = {}): TerrainPalette {
  const preset =
    TERRAIN_MATERIAL_PALETTES[descriptor.material ?? DEFAULT_TERRAIN_MATERIAL] ?? TERRAIN_MATERIAL_PALETTES[DEFAULT_TERRAIN_MATERIAL];
  const colors: TerrainColors = descriptor.colors ?? {};
  return {
    low: colors.low ?? preset.low,
    high: colors.high ?? preset.high,
    waterline: colors.waterline ?? preset.waterline,
  };
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const value = ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
  return `#${value.toString(16).padStart(6, "0")}`;
}

function mixHex(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  return rgbToHex(lerp(fr, tr, t), lerp(fg, tg, t), lerp(fb, tb, t));
}

function mixPalette(from: TerrainPalette, to: TerrainPalette, t: number): TerrainPalette {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    low: mixHex(from.low, to.low, t),
    high: mixHex(from.high, to.high, t),
    waterline: mixHex(from.waterline, to.waterline, t),
  };
}

/**
 * Per-position palette sampler over the descriptor's base `material`/`colors` plus its
 * `materialRegions` — the multi-biome coloring seam. Regions paint fully inside `radius`
 * and blend back to the surrounding palette across `falloff`; later regions win overlaps.
 */
export function createTerrainPaletteSampler(
  descriptor: Pick<TerrainEnvironmentConfig, "material" | "colors" | "materialRegions">,
): (x: number, z: number) => TerrainPalette {
  const base = resolveTerrainPalette(descriptor);
  const regions = (descriptor.materialRegions ?? []).map((region) => ({
    center: region.center,
    radius: region.radius,
    falloff: region.falloff ?? region.radius * 0.5,
    palette: resolveTerrainPalette(region),
  }));
  if (regions.length === 0) return () => base;
  return (x, z) => {
    let palette = base;
    for (const region of regions) {
      const distance = Math.hypot(x - region.center[0], z - region.center[1]);
      if (distance <= region.radius) {
        palette = region.palette;
      } else if (distance <= region.radius + region.falloff) {
        const t = smoothstep(region.radius, region.radius + region.falloff, distance);
        palette = mixPalette(region.palette, palette, t);
      }
    }
    return palette;
  };
}

function withFlattenMasks(
  sampleHeight: (x: number, z: number) => number,
  masks: readonly TerrainFlattenMask[],
): (x: number, z: number) => number {
  const resolved = masks.map((mask) => ({
    center: mask.center,
    radius: mask.radius,
    target: mask.height ?? sampleHeight(mask.center[0], mask.center[1]),
    falloff: mask.falloff ?? mask.radius * 0.5,
  }));
  return (x, z) => {
    const base = sampleHeight(x, z);
    let height = base;
    for (const mask of resolved) {
      const distance = Math.hypot(x - mask.center[0], z - mask.center[1]);
      if (distance <= mask.radius) {
        height = mask.target;
      } else if (distance <= mask.radius + mask.falloff) {
        const t = smoothstep(mask.radius, mask.radius + mask.falloff, distance);
        height = lerp(mask.target, base, t);
      }
    }
    return height;
  };
}

export function resolveTerrainField(descriptor?: TerrainEnvironmentDescriptor): TerrainField {
  if (descriptor === undefined) return flatField();
  const base =
    descriptor.heightField !== undefined
      ? fieldFromHeight(descriptor.heightField, {
          bounds: descriptor.bounds,
          ...(descriptor.waterLevel === undefined ? {} : { waterLevel: descriptor.waterLevel }),
        })
      : noiseField({
          seed: descriptor.seed,
          amplitude: descriptor.height,
          frequency: descriptor.frequency,
          octaves: descriptor.octaves,
          ridged: descriptor.ridged,
          baseHeight: descriptor.baseHeight,
          waterLevel: descriptor.waterLevel,
          bounds: descriptor.bounds,
        });
  if (descriptor.flatten === undefined || descriptor.flatten.length === 0) return base;
  return fieldFromHeight(withFlattenMasks(base.sampleHeight, descriptor.flatten), {
    bounds: base.bounds,
    waterLevel: base.waterLevel,
  });
}

/** Returns `position` with `y` replaced by the field's ground height (plus `offset`) at its `x`/`z`. */
export function snapToGround(
  field: TerrainField,
  position: readonly [number, number, number],
  offset = 0,
): [number, number, number] {
  const [x, , z] = position;
  return [x, field.sampleHeight(x, z) + offset, z];
}

export interface GroundSnapTarget {
  position: readonly [number, number, number];
}

export interface GroundSnapEntityStore {
  get(id: string): GroundSnapTarget | null;
  setPose(id: string, pose: { position?: readonly [number, number, number] }): boolean;
}

/** Ground-snaps an already-spawned entity in place; returns false when `id` is unknown. */
export function snapEntityToGround(
  entities: GroundSnapEntityStore,
  id: string,
  field: TerrainField,
  offset = 0,
): boolean {
  const entity = entities.get(id);
  if (entity === null) return false;
  return entities.setPose(id, { position: snapToGround(field, entity.position, offset) });
}

export const DEFAULT_MAX_WALK_SLOPE = 0.6;

export function resolveGroundStep(
  field: TerrainField,
  x: number,
  z: number,
  stepX: number,
  stepZ: number,
  maxSlope = DEFAULT_MAX_WALK_SLOPE,
): { stepX: number; stepZ: number } {
  const baseHeight = field.sampleHeight(x, z);
  const tooSteep = (dx: number, dz: number): boolean => {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6) return false;
    const rise = field.sampleHeight(x + dx, z + dz) - baseHeight;
    return rise / distance > maxSlope;
  };
  if (!tooSteep(stepX, stepZ)) return { stepX, stepZ };
  return {
    stepX: tooSteep(stepX, 0) ? 0 : stepX,
    stepZ: tooSteep(0, stepZ) ? 0 : stepZ,
  };
}
