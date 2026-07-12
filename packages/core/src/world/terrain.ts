import type {
  BiomeBand,
  EnvironmentWorldFeature,
  TerrainColors,
  TerrainEnvironmentConfig,
  TerrainEnvironmentDescriptor,
  TerrainFlattenMask,
  TerrainIslandDescriptor,
  TerrainMaterial,
  TerrainMaterialRegion,
  WorldBounds,
  WorldFeature,
} from "./features";
import { nearestOnPath } from "./roads";

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
  if (world !== undefined && world.kind === "environment") return resolveEnvironmentField(world);
  return flatField();
}

/** Ground height between islands when no base terrain exists — deep enough to read as a fall into the void, finite so physics stays sane. */
export const ISLAND_VOID_HEIGHT = -256;

function islandContains(descriptor: TerrainIslandDescriptor, x: number, z: number): boolean {
  return (
    Math.abs(x - descriptor.origin[0]) <= descriptor.bounds.w / 2 &&
    Math.abs(z - descriptor.origin[1]) <= descriptor.bounds.d / 2
  );
}

/**
 * Composes a base terrain and any number of bounded islands into one world field: inside an island's
 * rect the island's own field (sampled in island-local coordinates) wins, elsewhere the base terrain
 * answers, and with no base the gap is `ISLAND_VOID_HEIGHT` void. Later islands win overlaps.
 */
export function composeIslandFields(
  base: TerrainField | null,
  islands: readonly TerrainIslandDescriptor[],
  voidHeight = ISLAND_VOID_HEIGHT,
): TerrainField {
  if (islands.length === 0) return base ?? flatField();
  const resolved = islands.map((descriptor) => ({
    descriptor,
    field: resolveTerrainField({ ...descriptor, kind: "terrain" }),
  }));

  function islandAt(x: number, z: number): (typeof resolved)[number] | null {
    for (let index = resolved.length - 1; index >= 0; index -= 1) {
      if (islandContains(resolved[index]!.descriptor, x, z)) return resolved[index]!;
    }
    return null;
  }

  const sampleHeight = (x: number, z: number): number => {
    const island = islandAt(x, z);
    if (island !== null) {
      return island.field.sampleHeight(x - island.descriptor.origin[0], z - island.descriptor.origin[1]);
    }
    return base !== null ? base.sampleHeight(x, z) : voidHeight;
  };

  return {
    sampleHeight,
    sampleNormal(x, z) {
      const island = islandAt(x, z);
      if (island !== null) {
        return island.field.sampleNormal(x - island.descriptor.origin[0], z - island.descriptor.origin[1]);
      }
      return base !== null ? base.sampleNormal(x, z) : ([0, 1, 0] as const);
    },
    ...(base?.bounds === undefined ? {} : { bounds: base.bounds }),
    ...(base?.waterLevel === undefined ? {} : { waterLevel: base.waterLevel }),
  };
}

/** The full ground field for an environment world: base `terrain` composed with any `islands`. */
export function resolveEnvironmentField(feature: EnvironmentWorldFeature): TerrainField {
  const base = feature.terrain === undefined ? null : resolveTerrainField(feature.terrain);
  if (feature.islands === undefined || feature.islands.length === 0) return base ?? flatField();
  return composeIslandFields(base, feature.islands);
}

export interface TerrainSlopeSample {
  /** Unit XZ direction pointing downhill; `[0, 0]` on level ground. */
  downhill: readonly [number, number];
  /** Rise over run (tan of the slope angle); `0` on level ground. */
  steepness: number;
}

/** Local slope from the field's normal — the input for gravity-roll, ski acceleration, and slide checks (#284.6). */
export function sampleSlope(field: TerrainField, x: number, z: number): TerrainSlopeSample {
  const [nx, ny, nz] = field.sampleNormal(x, z);
  const horizontal = Math.hypot(nx, nz);
  if (horizontal < 1e-9) return { downhill: [0, 0], steepness: 0 };
  return {
    downhill: [nx / horizontal, nz / horizontal],
    steepness: horizontal / Math.max(ny, 1e-9),
  };
}

/**
 * Downhill force/acceleration from the local slope: direction × sin(slope angle) × `scale`.
 * Add it to any integrator's XZ velocity each tick (`scale` ≈ gravity for a free-rolling body).
 */
export function slopeForce(field: TerrainField, x: number, z: number, scale = 9.8): readonly [number, number] {
  const [nx, , nz] = field.sampleNormal(x, z);
  if (Math.hypot(nx, nz) < 1e-9) return [0, 0];
  return [nx * scale, nz * scale];
}

export interface TerrainPalette {
  low: string;
  high: string;
  waterline: string;
}

export const DEFAULT_TERRAIN_MATERIAL: TerrainMaterial = "grass";

export const TERRAIN_MATERIAL_PALETTES: Record<TerrainMaterial, TerrainPalette> = {
  grass: { low: "#30402c", high: "#7f8b50", waterline: "#1d4c6e" },
  sand: { low: "#9c8354", high: "#e0c98a", waterline: "#2f6f8f" },
  snow: { low: "#c7d3dc", high: "#ffffff", waterline: "#3a6ea5" },
  rock: { low: "#3a3a3d", high: "#8a8a8d", waterline: "#1d4c6e" },
  ash: { low: "#2b2622", high: "#5c534a", waterline: "#3a3630" },
  highland: { low: "#414f33", high: "#a3a86b", waterline: "#365f63" },
  slate: { low: "#2f3540", high: "#7d8896", waterline: "#26404f" },
};

export function resolveTerrainPalette(descriptor: Pick<TerrainEnvironmentConfig, "material" | "colors"> = {}): TerrainPalette {
  const material = descriptor.material ?? DEFAULT_TERRAIN_MATERIAL;
  const preset = TERRAIN_MATERIAL_PALETTES[material] as TerrainPalette | undefined;
  if (preset === undefined) {
    throw new Error(
      `Unknown terrain material "${material}". Valid materials: ${Object.keys(TERRAIN_MATERIAL_PALETTES).join(", ")}. Use colors: { low, high, waterline } for a custom look.`,
    );
  }
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
 * Per-z palette sampler over a descriptor's `biomeBands` — ordered zones that cross-fade their
 * ground palette across a `fade`-wide window centered on the midpoint z between adjacent centers.
 * Below the first / above the last band clamps to that band's palette. Returns `fallback` when no
 * bands are declared. Pure math, unit-testable independent of rendering.
 */
export function createBiomeBandSampler(
  bands: readonly BiomeBand[],
  fallback: TerrainPalette,
): (z: number) => TerrainPalette {
  if (bands.length === 0) return () => fallback;
  const resolved = bands
    .map((band) => ({ z: band.z, fade: band.fade ?? 64, palette: resolveTerrainPalette(band) }))
    .sort((a, b) => a.z - b.z);
  const first = resolved[0]!;
  const last = resolved[resolved.length - 1]!;
  return (z: number) => {
    if (z <= first.z) return first.palette;
    if (z >= last.z) return last.palette;
    for (let i = 0; i < resolved.length - 1; i += 1) {
      const lower = resolved[i]!;
      const upper = resolved[i + 1]!;
      if (z < lower.z || z > upper.z) continue;
      const boundary = (lower.z + upper.z) / 2;
      const half = Math.min(lower.fade, upper.fade) / 2;
      if (z <= boundary - half) return lower.palette;
      if (z >= boundary + half) return upper.palette;
      return mixPalette(lower.palette, upper.palette, smoothstep(boundary - half, boundary + half, z));
    }
    return fallback;
  };
}

/**
 * Per-position palette sampler over the descriptor's base `material`/`colors` plus its z-ordered
 * `biomeBands` (painted first) and radial `materialRegions` (painted over) — the multi-biome coloring
 * seam. Regions paint fully inside `radius` and blend back across `falloff`; later regions win overlaps.
 */
export function createTerrainPaletteSampler(
  descriptor: Pick<TerrainEnvironmentConfig, "material" | "colors" | "materialRegions" | "biomeBands">,
): (x: number, z: number) => TerrainPalette {
  const base = resolveTerrainPalette(descriptor);
  const bandSampler =
    descriptor.biomeBands === undefined || descriptor.biomeBands.length === 0
      ? null
      : createBiomeBandSampler(descriptor.biomeBands, base);
  const regions = (descriptor.materialRegions ?? []).map((region) => ({
    ...resolveRegionShape(region),
    palette: resolveTerrainPalette(region),
  }));
  if (regions.length === 0 && bandSampler === null) return () => base;
  return (x, z) => {
    let palette = bandSampler === null ? base : bandSampler(z);
    for (const region of regions) {
      const distance = region.coreDistance(x, z);
      if (distance <= 0) {
        palette = region.palette;
      } else if (distance <= region.falloff) {
        const t = smoothstep(0, region.falloff, distance);
        palette = mixPalette(region.palette, palette, t);
      }
    }
    return palette;
  };
}

/**
 * Resolves a `TerrainMaterialRegion` of any shape to a `coreDistance(x, z)` — 0 inside the painted
 * core, growing positive outward — plus its blend-ring `falloff`, so the palette sampler blends every
 * shape through one shape-agnostic loop.
 */
function resolveRegionShape(region: TerrainMaterialRegion): {
  coreDistance: (x: number, z: number) => number;
  falloff: number;
} {
  if (region.shape === "polyline") {
    const half = region.width * 0.5;
    return {
      falloff: region.falloff ?? half,
      coreDistance: (x, z) => {
        const sample = nearestOnPath(region.points, x, z);
        return sample === null ? Number.POSITIVE_INFINITY : Math.max(0, sample.distance - half);
      },
    };
  }
  if (region.shape === "rect") {
    const [hx, hz] = region.halfExtents;
    const angle = region.rotationY ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      falloff: region.falloff ?? Math.min(hx, hz) * 0.5,
      coreDistance: (x, z) => {
        const dx = x - region.center[0];
        const dz = z - region.center[1];
        const lx = dx * cos + dz * sin;
        const lz = -dx * sin + dz * cos;
        return Math.hypot(Math.max(0, Math.abs(lx) - hx), Math.max(0, Math.abs(lz) - hz));
      },
    };
  }
  return {
    falloff: region.falloff ?? region.radius * 0.5,
    coreDistance: (x, z) => Math.max(0, Math.hypot(x - region.center[0], z - region.center[1]) - region.radius),
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

export interface HeightMapFieldConfig {
  columns: number;
  rows: number;
  samples: ArrayLike<number>;
  bounds?: WorldBounds;
  heightScale?: number;
  baseHeight?: number;
  waterLevel?: number;
}

export function heightMapField(config: HeightMapFieldConfig): TerrainField {
  const { columns, rows, samples } = config;
  if (columns <= 0 || rows <= 0) throw new Error("heightMapField: columns/rows must be positive");
  if (samples.length < columns * rows) {
    throw new Error(`heightMapField: samples length ${samples.length} < columns*rows ${columns * rows}`);
  }
  const bounds = config.bounds ?? { w: columns, d: rows };
  const heightScale = config.heightScale ?? 1;
  const baseHeight = config.baseHeight ?? 0;
  const halfW = bounds.w / 2;
  const halfD = bounds.d / 2;

  const sampleAt = (col: number, row: number): number => {
    const c = Math.max(0, Math.min(columns - 1, col));
    const r = Math.max(0, Math.min(rows - 1, row));
    return samples[r * columns + c]!;
  };

  return fieldFromHeight(
    (x, z) => {
      const u = columns <= 1 ? 0 : ((x + halfW) / bounds.w) * (columns - 1);
      const v = rows <= 1 ? 0 : ((z + halfD) / bounds.d) * (rows - 1);
      const c0 = Math.floor(u);
      const r0 = Math.floor(v);
      const fu = u - c0;
      const fv = v - r0;
      const h00 = sampleAt(c0, r0);
      const h10 = sampleAt(c0 + 1, r0);
      const h01 = sampleAt(c0, r0 + 1);
      const h11 = sampleAt(c0 + 1, r0 + 1);
      const top = lerp(h00, h10, fu);
      const bottom = lerp(h01, h11, fu);
      return baseHeight + heightScale * lerp(top, bottom, fv);
    },
    {
      bounds,
      ...(config.waterLevel === undefined ? {} : { waterLevel: config.waterLevel }),
    },
  );
}

export function resolveTerrainField(descriptor?: TerrainEnvironmentDescriptor): TerrainField {
  if (descriptor === undefined) return flatField();
  if (descriptor.heightField === undefined && descriptor.heightMap !== undefined) {
    throw new Error(
      `terrain heightMap "${descriptor.heightMap}" is not auto-loaded. Decode elevation samples into heightMapField({ columns, rows, samples }) and pass heightField: field.sampleHeight (or omit heightMap and set heightField directly).`,
    );
  }
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
