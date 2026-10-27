import { runToEnd, type SlicedJob } from "@jgengine/core/run/slicedWork";
import { noiseField, type NoiseFieldConfig, type TerrainField } from "@jgengine/core/terrain/terrain";
import * as THREE from "three";

import { hashNoise2, type TerrainSeed } from "./terrainSeed";

/** A square side length, or a `[width, depth]` pair, in metres. */
export type TerrainArea = number | readonly [width: number, depth: number];
/** Ground height at a world `x, z`. */
export type TerrainHeightSampler = (x: number, z: number) => number;

/** Seeded noise terrain settings: size, resolution, seed, height, mound scale, octaves, ridging and base offset. */
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

/** A {@link TerrainArea} as width and depth. */
export interface ResolvedTerrainSize {
  width: number;
  depth: number;
}

/** Grid segment counts along x and z. */
export interface ResolvedTerrainSegments {
  x: number;
  z: number;
}

/** Ground colours from low to high, plus an optional waterline colour and height. */
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

/** Per-position palette override for multi-biome ground coloring — `createTerrainPaletteSampler` from `@jgengine/core/terrain/terrain` returns exactly this shape. */
export type TerrainPaletteSampler = (x: number, z: number) => { low: string; high: string; waterline?: string };

/** How to mesh a terrain field: size, resolution, centre, colours, palette, surface shading and paint. */
export interface FieldGroundOptions {
  size?: TerrainArea | undefined;
  segments?: number | readonly [x: number, z: number] | undefined;
  center?: readonly [x: number, z: number] | undefined;
  colors?: TerrainVertexColorOptions | undefined;
  heightRange?: readonly [min: number, max: number] | undefined;
  /** Sampled per vertex when set; `colors` still supplies `waterlineHeight` and the fallback. */
  paletteAt?: TerrainPaletteSampler | undefined;
  /** Slope/noise surface shading over the height lerp. Omit for the default terrain look; pass `{ slopeStrength: 0, mottleStrength: 0 }` for a flat gradient. */
  surface?: TerrainSurfaceColorOptions;
  /** Authored paint overrides descriptor shading at painted vertices. */
  paintColorAt?: ((x: number, z: number, out: THREE.Color) => boolean) | undefined;
}

/**
 * Mesh any `TerrainField` — including a `CarvableField` with craters/mounds written into it — into a
 * vertex-coloured ground geometry. `sampleHeight` drives the vertices, so runtime carves show up as
 * real depressions the moment the field is re-sampled (bump the caller's rebuild key after a carve).
  * @internal
  */
export function createFieldGroundGeometry(field: TerrainField, options: FieldGroundOptions = {}): THREE.BufferGeometry {
  return runToEnd(fieldGroundGeometryJob(field, options));
}

/**
 * {@link createFieldGroundGeometry} as a sliced job: a large field samples a game's height function
 * hundreds of thousands of times, which run in one go froze the page for seconds. @internal
 */
export function fieldGroundGeometryJob(field: TerrainField, options: FieldGroundOptions = {}): SlicedJob<THREE.BufferGeometry> {
  const grid = resolveFieldGroundGrid(field, options);
  return groundPatchJob(grid, wholeGroundWindow(grid));
}

/** Everything a ground mesh is sampled from: the grid over the world plus how its vertices are coloured. @internal */
export interface GroundGrid {
  size: ResolvedTerrainSize;
  segments: ResolvedTerrainSegments;
  center: readonly [number, number];
  sampler: TerrainHeightSampler;
  colors: TerrainVertexColorOptions;
  heightRange?: readonly [number, number] | undefined;
  paletteAt?: TerrainPaletteSampler | undefined;
  surface?: TerrainSurfaceColorOptions | undefined;
  paintColorAt?: ((x: number, z: number, out: THREE.Color) => boolean) | undefined;
}

/**
 * One rectangle of a {@link GroundGrid} meshed at a vertex stride: `cols`×`rows` grid cells from
 * (`col0`, `row0`), every `step`-th vertex, positioned relative to `origin`. A `skirt` drops a strip
 * that deep below each edge, hiding the cracks where a neighbour is meshed at another stride. @internal
 */
export interface GroundWindow {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  step: number;
  skirt: number;
  origin: readonly [number, number];
}

/** The grid {@link fieldGroundGeometryJob} meshes, for callers that mesh it in pieces. @internal */
export function resolveFieldGroundGrid(field: TerrainField, options: FieldGroundOptions = {}): GroundGrid {
  return {
    size: resolveTerrainSize(options.size),
    segments: resolveTerrainSegments(options.segments),
    center: options.center ?? [0, 0],
    sampler: (x, z) => field.sampleHeight(x, z),
    colors: options.colors ?? {},
    heightRange: options.heightRange,
    paletteAt: options.paletteAt,
    surface: options.surface,
    paintColorAt: options.paintColorAt,
  };
}

/** The whole grid as one window at full density, in world coordinates. @internal */
export function wholeGroundWindow(grid: GroundGrid): GroundWindow {
  return { col0: 0, row0: 0, cols: grid.segments.x, rows: grid.segments.z, step: 1, skirt: 0, origin: [0, 0] };
}

function buildGroundGeometry(grid: GroundGrid): THREE.BufferGeometry {
  return runToEnd(groundPatchJob(grid, wholeGroundWindow(grid)));
}

/** Grid indices a window samples along one axis: every `step`-th from `first`, always ending on `first + cells`. */
function windowIndices(first: number, cells: number, step: number): number[] {
  const indices: number[] = [];
  for (let offset = 0; offset < cells; offset += step) indices.push(first + offset);
  indices.push(first + cells);
  return indices;
}

/**
 * Mesh one window of a ground grid into a vertex-coloured geometry, pausing after each row of
 * vertices. Normals and the slope shading come from the sampled heights (one stride out past each
 * edge), so two windows that share an edge at the same stride light and shade it identically.
 * @internal
 */
export function* groundPatchJob(grid: GroundGrid, window: GroundWindow): SlicedJob<THREE.BufferGeometry> {
  const { size, segments, sampler } = grid;
  const colors = grid.colors;
  const paletteAt = grid.paletteAt;
  const surface = resolveSurfaceColor(grid.surface);
  const shadeSlope = surface.slopeStrength > 0;
  const xs = windowIndices(window.col0, window.cols, window.step);
  const zs = windowIndices(window.row0, window.rows, window.step);
  const worldX = (index: number) => grid.center[0] + (index / segments.x - 0.5) * size.width;
  const worldZ = (index: number) => grid.center[1] + (index / segments.z - 0.5) * size.depth;
  const countX = xs.length;
  const countZ = zs.length;
  // Heights on the window's vertices plus a one-vertex ring, so normals and slope at the edge read
  // the same neighbours the next window does; every height is sampled once.
  const ringX = [xs[0]! - window.step, ...xs, xs[countX - 1]! + window.step];
  const ringZ = [zs[0]! - window.step, ...zs, zs[countZ - 1]! + window.step];
  const stride = countX + 2;
  const heights = new Float64Array(stride * (countZ + 2));
  let sampledRows = 0;
  const sampleRowsThrough = (last: number) => {
    for (; sampledRows <= last; sampledRows += 1) {
      const z = worldZ(ringZ[sampledRows]!);
      for (let column = 0; column < stride; column += 1) heights[sampledRows * stride + column] = sampler(worldX(ringX[column]!), z);
    }
  };
  const heightAt = (column: number, row: number) => heights[(row + 1) * stride + column + 1]!;

  const skirtVertices = window.skirt > 0 ? 2 * (countX + countZ) : 0;
  const vertexCount = countX * countZ + skirtVertices;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colorValues = new Float32Array(vertexCount * 3);
  const color = new THREE.Color();
  const low = new THREE.Color(colors.low ?? "#30402c");
  const high = new THREE.Color(colors.high ?? "#7f8b50");
  const waterline = colors.waterline === undefined ? null : new THREE.Color(colors.waterline);
  const minHeight = grid.heightRange?.[0] ?? -3;
  const maxHeight = grid.heightRange?.[1] ?? 3;
  const normal = new THREE.Vector3();
  for (let row = 0; row < countZ; row += 1) {
    sampleRowsThrough(row + 2);
    const z = worldZ(zs[row]!);
    const dz = worldZ(ringZ[row + 2]!) - worldZ(ringZ[row]!);
    for (let column = 0; column < countX; column += 1) {
      const vertex = row * countX + column;
      const x = worldX(xs[column]!);
      const y = heightAt(column, row);
      positions[vertex * 3] = x - window.origin[0];
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z - window.origin[1];
      uvs[vertex * 2] = xs[column]! / segments.x;
      uvs[vertex * 2 + 1] = zs[row]! / segments.z;
      const dx = worldX(ringX[column + 2]!) - worldX(ringX[column]!);
      const dhx = (heightAt(column + 1, row) - heightAt(column - 1, row)) / Math.max(1e-6, dx);
      const dhz = (heightAt(column, row + 1) - heightAt(column, row - 1)) / Math.max(1e-6, dz);
      normal.set(-dhx, 1, -dhz).normalize();
      normals[vertex * 3] = normal.x;
      normals[vertex * 3 + 1] = normal.y;
      normals[vertex * 3 + 2] = normal.z;
      if (paletteAt !== undefined) {
        const palette = paletteAt(x, z);
        low.set(palette.low);
        high.set(palette.high);
        if (waterline !== null && palette.waterline !== undefined) waterline.set(palette.waterline);
      }
      color.copy(low).lerp(high, normalizeHeightBlend(y, minHeight, maxHeight));
      if (waterline !== null && y <= (colors.waterlineHeight ?? 0)) color.lerp(waterline, 0.65);
      let slope01 = 0;
      if (shadeSlope) {
        const gradient = Math.hypot(dhx, dhz);
        slope01 = gradient / (gradient + 1);
      }
      applyTerrainSurfaceShading(color, x, z, slope01, surface);
      grid.paintColorAt?.(x, z, color);
      colorValues[vertex * 3] = color.r;
      colorValues[vertex * 3 + 1] = color.g;
      colorValues[vertex * 3 + 2] = color.b;
    }
    yield;
  }

  const quads = (countX - 1) * (countZ - 1);
  // Skirt quads are emitted in both windings so the strip shows from either side of the edge.
  const skirtQuads = window.skirt > 0 ? 2 * (countX - 1 + countZ - 1) : 0;
  const indices = new Uint32Array((quads + skirtQuads * 2) * 6);
  let cursor = 0;
  const quad = (a: number, b: number, c: number, d: number) => {
    indices[cursor] = a;
    indices[cursor + 1] = c;
    indices[cursor + 2] = b;
    indices[cursor + 3] = b;
    indices[cursor + 4] = c;
    indices[cursor + 5] = d;
    cursor += 6;
  };
  for (let row = 0; row < countZ - 1; row += 1) {
    for (let column = 0; column < countX - 1; column += 1) {
      const a = row * countX + column;
      quad(a, a + 1, a + countX, a + countX + 1);
    }
  }
  if (window.skirt > 0) {
    let next = countX * countZ;
    const edge = (vertices: readonly number[]) => {
      const first = next;
      for (const source of vertices) {
        positions[next * 3] = positions[source * 3]!;
        positions[next * 3 + 1] = positions[source * 3 + 1]! - window.skirt;
        positions[next * 3 + 2] = positions[source * 3 + 2]!;
        for (let axis = 0; axis < 3; axis += 1) {
          normals[next * 3 + axis] = normals[source * 3 + axis]!;
          colorValues[next * 3 + axis] = colorValues[source * 3 + axis]!;
        }
        uvs[next * 2] = uvs[source * 2]!;
        uvs[next * 2 + 1] = uvs[source * 2 + 1]!;
        next += 1;
      }
      for (let index = 0; index < vertices.length - 1; index += 1) {
        const top0 = vertices[index]!;
        const top1 = vertices[index + 1]!;
        const bottom0 = first + index;
        const bottom1 = first + index + 1;
        quad(top0, top1, bottom0, bottom1);
        quad(top1, top0, bottom1, bottom0);
      }
    };
    const rowOf = (row: number) => Array.from({ length: countX }, (_, column) => row * countX + column);
    const columnOf = (column: number) => Array.from({ length: countZ }, (_, row) => row * countX + column);
    edge(rowOf(0));
    edge(rowOf(countZ - 1));
    edge(columnOf(0));
    edge(columnOf(countX - 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
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
  return buildGroundGeometry({
    size,
    segments,
    sampler,
    colors,
    center: [0, 0],
    heightRange: [base - span, base + span],
    surface: { seed: config.seed ?? DEFAULT_TERRAIN_SURFACE_COLOR.seed },
  });
}
