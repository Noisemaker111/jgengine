import { noiseField, type NoiseFieldConfig, type TerrainField } from "@jgengine/core/world/terrain";
import * as THREE from "three";

import { hashNoise2, type TerrainSeed } from "./random";

export type TerrainArea = number | readonly [width: number, depth: number];
export type TerrainHeightSampler = (x: number, z: number) => number;

export interface ProceduralTerrainConfig {
  size?: TerrainArea;
  segments?: number | readonly [x: number, z: number];
  seed?: TerrainSeed;
  height?: number;
  moundScale?: number;
  octaves?: number;
  ridged?: boolean;
  baseOffset?: number;
}

export interface ResolvedTerrainSize {
  width: number;
  depth: number;
}

export interface ResolvedTerrainSegments {
  x: number;
  z: number;
}

export interface TerrainVertexColorOptions {
  low?: THREE.ColorRepresentation;
  high?: THREE.ColorRepresentation;
  waterline?: THREE.ColorRepresentation;
  waterlineHeight?: number;
}

/**
 * Slope/noise surface shading laid over the height lerp so untextured ground reads like terrain
 * instead of a smooth two-tone gradient. All knobs are optional with sane defaults; every field is
 * a pure function of vertex position (+ `seed`), so the coloring is stable across rebuilds and tests.
 */
export interface TerrainSurfaceColorOptions {
  /** 0..1 darkening + desaturation on steep faces (slope sampled from neighbor heights). Default 0.5; 0 disables. */
  slopeStrength?: number;
  /** 0..1 amplitude of deterministic hash mottling (brightness jitter per patch). Default 0.14; 0 disables. */
  mottleStrength?: number;
  /** World-space frequency of the mottling lattice (cells per meter). Default 0.12. */
  mottleScale?: number;
  /** Seed for the mottling hash. Same seed → identical mottling. Default 1. */
  seed?: TerrainSeed;
}

interface ResolvedTerrainSurfaceColorOptions {
  slopeStrength: number;
  mottleStrength: number;
  mottleScale: number;
  seed: TerrainSeed;
}

/** @internal */
export const DEFAULT_TERRAIN_SURFACE_COLOR: ResolvedTerrainSurfaceColorOptions = {
  slopeStrength: 0.5,
  mottleStrength: 0.14,
  mottleScale: 0.12,
  seed: 1,
};

function resolveSurfaceColor(surface: TerrainSurfaceColorOptions | undefined): ResolvedTerrainSurfaceColorOptions {
  return {
    slopeStrength: THREE.MathUtils.clamp(surface?.slopeStrength ?? DEFAULT_TERRAIN_SURFACE_COLOR.slopeStrength, 0, 1),
    mottleStrength: THREE.MathUtils.clamp(surface?.mottleStrength ?? DEFAULT_TERRAIN_SURFACE_COLOR.mottleStrength, 0, 1),
    mottleScale: Math.max(0, surface?.mottleScale ?? DEFAULT_TERRAIN_SURFACE_COLOR.mottleScale),
    seed: surface?.seed ?? DEFAULT_TERRAIN_SURFACE_COLOR.seed,
  };
}

/** Smoothed value noise on the integer hash lattice — continuous, seamless, and a pure function of `x,z`. */
function groundValueNoise(x: number, z: number, scale: number, seed: TerrainSeed): number {
  const sx = x * scale;
  const sz = z * scale;
  const xi = Math.floor(sx);
  const zi = Math.floor(sz);
  const xf = sx - xi;
  const zf = sz - zi;
  const u = xf * xf * (3 - 2 * xf);
  const w = zf * zf * (3 - 2 * zf);
  const n00 = hashNoise2(xi, zi, seed);
  const n10 = hashNoise2(xi + 1, zi, seed);
  const n01 = hashNoise2(xi, zi + 1, seed);
  const n11 = hashNoise2(xi + 1, zi + 1, seed);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * w;
}

/**
 * Layer the slope darkening and hash mottling onto an already height-lerped vertex color, in place.
 * `slope01` is the 0..1 steepness at the vertex; `x,z` seed the deterministic mottling.
 * @internal
 */
export function applyTerrainSurfaceShading(
  color: THREE.Color,
  x: number,
  z: number,
  slope01: number,
  surface: ResolvedTerrainSurfaceColorOptions,
): void {
  if (surface.mottleStrength > 0 && surface.mottleScale > 0) {
    // Two octaves: broad patchiness plus a finer break-up. Centered on 0.5 so it only jitters brightness.
    const broad = groundValueNoise(x, z, surface.mottleScale, surface.seed);
    const fine = groundValueNoise(x + 41.7, z - 19.3, surface.mottleScale * 3.1, surface.seed);
    const mottle = broad * 0.65 + fine * 0.35;
    color.multiplyScalar(1 + (mottle - 0.5) * 2 * surface.mottleStrength);
  }
  if (surface.slopeStrength > 0 && slope01 > 0) {
    // Steep faces read as exposed earth: pull toward luminance (desaturate) then darken.
    const slopeK = THREE.MathUtils.clamp(slope01 * surface.slopeStrength, 0, 1);
    const lum = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
    color.r = THREE.MathUtils.lerp(color.r, lum, slopeK * 0.5);
    color.g = THREE.MathUtils.lerp(color.g, lum, slopeK * 0.5);
    color.b = THREE.MathUtils.lerp(color.b, lum, slopeK * 0.5);
    color.multiplyScalar(1 - 0.4 * slopeK);
  }
}

/** @internal */
export function normalizeHeightBlend(height: number, minHeight: number, maxHeight: number): number {
  const range = maxHeight - minHeight;
  if (range <= 1e-6) return 0.5;
  return THREE.MathUtils.clamp((height - minHeight) / range, 0, 1);
}

/** @internal */
export function resolveTerrainSize(size: TerrainArea = 40): ResolvedTerrainSize {
  return typeof size === "number" ? { width: size, depth: size } : { width: size[0], depth: size[1] };
}

/** @internal */
export function resolveTerrainSegments(segments: ProceduralTerrainConfig["segments"] = 96): ResolvedTerrainSegments {
  if (typeof segments !== "number") return { x: Math.max(1, Math.floor(segments[0])), z: Math.max(1, Math.floor(segments[1])) };
  const resolved = Math.max(1, Math.floor(segments));
  return { x: resolved, z: resolved };
}

/** @internal */
export function toNoiseFieldConfig(config: ProceduralTerrainConfig = {}): NoiseFieldConfig {
  return {
    seed: config.seed,
    amplitude: config.height ?? 1.4,
    frequency: config.moundScale ?? 0.075,
    octaves: config.octaves ?? 4,
    ridged: config.ridged ?? false,
    baseHeight: config.baseOffset ?? 0,
  };
}

/** @internal */
export function createProceduralTerrainSampler(config: ProceduralTerrainConfig = {}): TerrainHeightSampler {
  return noiseField(toNoiseFieldConfig(config)).sampleHeight;
}

/** Per-position palette override for multi-biome ground coloring — `createTerrainPaletteSampler` from `@jgengine/core/world/terrain` returns exactly this shape. */
export type TerrainPaletteSampler = (x: number, z: number) => { low: string; high: string; waterline?: string };

export interface FieldGroundOptions {
  size?: TerrainArea;
  segments?: number | readonly [x: number, z: number];
  center?: readonly [x: number, z: number];
  colors?: TerrainVertexColorOptions;
  heightRange?: readonly [min: number, max: number];
  /** Sampled per vertex when set; `colors` still supplies `waterlineHeight` and the fallback. */
  paletteAt?: TerrainPaletteSampler;
  /** Slope/noise surface shading over the height lerp. Omit for the default terrain look; pass `{ slopeStrength: 0, mottleStrength: 0 }` for a flat gradient. */
  surface?: TerrainSurfaceColorOptions;
}

/**
 * Mesh any `TerrainField` — including a `CarvableField` with craters/mounds written into it — into a
 * vertex-coloured ground geometry. `sampleHeight` drives the vertices, so runtime carves show up as
 * real depressions the moment the field is re-sampled (bump the caller's rebuild key after a carve).
  * @internal
  */
export function createFieldGroundGeometry(field: TerrainField, options: FieldGroundOptions = {}): THREE.BufferGeometry {
  const size = resolveTerrainSize(options.size);
  const segments = resolveTerrainSegments(options.segments);
  const [cx, cz] = options.center ?? [0, 0];
  return buildGroundGeometry(size, segments, (x, z) => field.sampleHeight(x, z), {
    colors: options.colors ?? {},
    center: [cx, cz],
    heightRange: options.heightRange,
    paletteAt: options.paletteAt,
    surface: options.surface,
  });
}

function buildGroundGeometry(
  size: ResolvedTerrainSize,
  segments: ResolvedTerrainSegments,
  sampler: TerrainHeightSampler,
  opts: {
    colors: TerrainVertexColorOptions;
    center: readonly [number, number];
    heightRange?: readonly [number, number];
    paletteAt?: TerrainPaletteSampler;
    surface?: TerrainSurfaceColorOptions;
  },
): THREE.BufferGeometry {
  const colors = opts.colors;
  const paletteAt = opts.paletteAt;
  const surface = resolveSurfaceColor(opts.surface);
  const shadeSlope = surface.slopeStrength > 0;
  // Neighbor spacing for the finite-difference slope estimate — one grid cell per axis.
  const slopeStepX = shadeSlope ? Math.max(1e-3, size.width / Math.max(1, segments.x)) : 0;
  const slopeStepZ = shadeSlope ? Math.max(1e-3, size.depth / Math.max(1, segments.z)) : 0;
  const vertexCountX = segments.x + 1;
  const vertexCountZ = segments.z + 1;
  const positions = new Float32Array(vertexCountX * vertexCountZ * 3);
  const uvs = new Float32Array(vertexCountX * vertexCountZ * 2);
  const colorValues = new Float32Array(vertexCountX * vertexCountZ * 3);
  const indices = new Uint32Array(segments.x * segments.z * 6);
  const low = new THREE.Color(colors.low ?? "#30402c");
  const high = new THREE.Color(colors.high ?? "#7f8b50");
  const waterline = colors.waterline === undefined ? null : new THREE.Color(colors.waterline);
  const minHeight = opts.heightRange?.[0] ?? -3;
  const maxHeight = opts.heightRange?.[1] ?? 3;
  let index = 0;
  let uvIndex = 0;
  let colorIndex = 0;
  for (let zIndex = 0; zIndex < vertexCountZ; zIndex += 1) {
    const v = zIndex / segments.z;
    const z = opts.center[1] + (v - 0.5) * size.depth;
    for (let xIndex = 0; xIndex < vertexCountX; xIndex += 1) {
      const u = xIndex / segments.x;
      const x = opts.center[0] + (u - 0.5) * size.width;
      const y = sampler(x, z);
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      uvs[uvIndex] = u;
      uvs[uvIndex + 1] = v;
      if (paletteAt !== undefined) {
        const palette = paletteAt(x, z);
        low.set(palette.low);
        high.set(palette.high);
        if (waterline !== null && palette.waterline !== undefined) waterline.set(palette.waterline);
      }
      const blend = normalizeHeightBlend(y, minHeight, maxHeight);
      const color = low.clone().lerp(high, blend);
      if (waterline !== null && y <= (colors.waterlineHeight ?? 0)) color.lerp(waterline, 0.65);
      let slope01 = 0;
      if (shadeSlope) {
        // Bounded per-vertex finite difference (4 extra samples) — build-time only, no per-frame scan.
        const dhx = (sampler(x + slopeStepX, z) - sampler(x - slopeStepX, z)) / (2 * slopeStepX);
        const dhz = (sampler(x, z + slopeStepZ) - sampler(x, z - slopeStepZ)) / (2 * slopeStepZ);
        const grad = Math.hypot(dhx, dhz);
        slope01 = grad / (grad + 1);
      }
      applyTerrainSurfaceShading(color, x, z, slope01, surface);
      colorValues[colorIndex] = color.r;
      colorValues[colorIndex + 1] = color.g;
      colorValues[colorIndex + 2] = color.b;
      index += 3;
      uvIndex += 2;
      colorIndex += 3;
    }
  }
  let triangleIndex = 0;
  for (let zIndex = 0; zIndex < segments.z; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments.x; xIndex += 1) {
      const a = zIndex * vertexCountX + xIndex;
      const b = a + 1;
      const c = a + vertexCountX;
      const d = c + 1;
      indices[triangleIndex] = a;
      indices[triangleIndex + 1] = c;
      indices[triangleIndex + 2] = b;
      indices[triangleIndex + 3] = b;
      indices[triangleIndex + 4] = c;
      indices[triangleIndex + 5] = d;
      triangleIndex += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Meshes the built-in procedural noise terrain into a vertex-coloured ground. A thin wrapper over the
 * shared {@link buildGroundGeometry}: same height lerp, plus slope-aware shading and hash mottling
 * seeded from `config.seed` so the plain ground reads like terrain rather than a two-tone gradient.
 * @internal
 */
export function createProceduralGroundGeometry(
  config: ProceduralTerrainConfig = {},
  colors: TerrainVertexColorOptions = {},
): THREE.BufferGeometry {
  const size = resolveTerrainSize(config.size);
  const segments = resolveTerrainSegments(config.segments);
  const sampler = createProceduralTerrainSampler(config);
  const base = config.baseOffset ?? 0;
  const span = (config.height ?? 1.4) * 1.2;
  return buildGroundGeometry(size, segments, sampler, {
    colors,
    center: [0, 0],
    heightRange: [base - span, base + span],
    surface: { seed: config.seed ?? DEFAULT_TERRAIN_SURFACE_COLOR.seed },
  });
}
