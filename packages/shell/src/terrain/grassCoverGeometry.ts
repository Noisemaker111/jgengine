import * as THREE from "three";

import { resolveTerrainSize, type TerrainArea, type TerrainHeightSampler } from "./terrainMath";

/** World metres one cover-texture tile spans; the mat's own grain is sampled in world space. */
export const GRASS_COVER_TILE_METRES = 3;

/** Largest grid a cover mat bakes to, per axis — a 66 m park stays one draw at ~1 m cells. */
export const GRASS_COVER_MAX_SEGMENTS = 96;

/** Inputs for {@link createGrassCoverGeometry}. */
export interface GrassCoverGeometryOptions {
  area: TerrainArea;
  seed: number;
  colorBase: THREE.ColorRepresentation;
  colorTip: THREE.ColorRepresentation;
  /** Ground-cover mat strength 0..1 (the authored `groundCover`); 0 produces no geometry. */
  strength: number;
  /** Meters of soft fringe at the patch border, matching the blade field's own feather. */
  edgeFeather: number;
  heightAt: TerrainHeightSampler;
  coverageAt: TerrainHeightSampler;
  /** Lift above the ground in meters so the mat never z-fights the terrain. Default 0.035. */
  lift?: number;
  /** Grid segments per axis; defaults to one per 2 m, clamped to {@link GRASS_COVER_MAX_SEGMENTS}. */
  segments?: number;
}

/** Bake result for {@link createGrassCoverGeometry}; empty arrays when the mat is switched off. */
export interface GrassCoverGeometry {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  size: readonly [number, number];
}

function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise in world space; deterministic per seed, no allocation on the hot path. */
function valueNoise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const tz = smooth(z - zi);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/**
 * Drapes an authored `grass_field` volume's footprint with a feathered turf mat: vertices follow the
 * runtime ground, the patch edge fades out over `edgeFeather`, and authored clearance masks punch
 * the cover back out where a path or footing crosses it. This is the surface under the blades, so a
 * park reads as grass instead of bare pavement with stubble on it.
 * @internal
 */
export function createGrassCoverGeometry(options: GrassCoverGeometryOptions): GrassCoverGeometry {
  const size = resolveTerrainSize(options.area);
  const segments = Math.max(
    1,
    Math.min(
      GRASS_COVER_MAX_SEGMENTS,
      Math.floor(options.segments ?? Math.min(GRASS_COVER_MAX_SEGMENTS, Math.max(2, Math.round(Math.max(size.width, size.depth) / 2)))),
    ),
  );
  if (options.strength <= 0 || size.width <= 0 || size.depth <= 0) {
    return { positions: new Float32Array(), normals: new Float32Array(), colors: new Float32Array(), uvs: new Float32Array(), indices: new Uint32Array(), size: [size.width, size.depth] };
  }
  const lift = options.lift ?? 0.035;
  const halfW = size.width / 2;
  const halfD = size.depth / 2;
  const base = new THREE.Color(options.colorBase);
  const tip = new THREE.Color(options.colorTip);
  const root = base.clone().multiplyScalar(0.55);
  const sheen = base.clone().multiplyScalar(0.98);
  const cols = segments + 1;
  const count = cols * cols;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const uvs = new Float32Array(count * 2);
  const eps = Math.max(0.25, Math.min(size.width, size.depth) / segments / 2);

  for (let iz = 0; iz < cols; iz += 1) {
    const z = -halfD + (iz / segments) * size.depth;
    for (let ix = 0; ix < cols; ix += 1) {
      const x = -halfW + (ix / segments) * size.width;
      const index = iz * cols + ix;
      positions[index * 3] = x;
      positions[index * 3 + 1] = options.heightAt(x, z) + lift;
      positions[index * 3 + 2] = z;

      const hL = options.heightAt(x - eps, z);
      const hR = options.heightAt(x + eps, z);
      const hD = options.heightAt(x, z - eps);
      const hU = options.heightAt(x, z + eps);
      const nx = hL - hR;
      const nz = hD - hU;
      const ny = 2 * eps;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[index * 3] = nx / length;
      normals[index * 3 + 1] = ny / length;
      normals[index * 3 + 2] = nz / length;

      const edge = Math.min(halfW - Math.abs(x), halfD - Math.abs(z));
      const feather = Math.max(0.001, options.edgeFeather);
      const edgeFade = smooth(Math.min(1, Math.max(0, edge / feather)));
      const coverage = Math.max(0, Math.min(1, options.coverageAt(x, z)));
      const grain = valueNoise(x / 1.7, z / 1.7, options.seed);
      const patch = valueNoise(x / 11 + 31.7, z / 11 - 9.2, options.seed + 17);
      const alpha = options.strength * edgeFade * coverage * (0.82 + 0.18 * grain);
      // Macro patches lift the mat toward the blade tip hue and back to a rooted shade, so a park
      // reads as turf with light and dry pockets instead of one flat green sheet.
      const light = smooth(Math.min(1, Math.max(0, (patch - 0.25) / 0.6)));
      const r = root.r + (sheen.r - root.r) * light;
      const g = root.g + (sheen.g - root.g) * light;
      const b = root.b + (sheen.b - root.b) * light;
      const tipMix = grain * 0.3;
      colors[index * 4] = r + (tip.r - r) * tipMix;
      colors[index * 4 + 1] = g + (tip.g - g) * tipMix;
      colors[index * 4 + 2] = b + (tip.b - b) * tipMix;
      colors[index * 4 + 3] = alpha;
      uvs[index * 2] = x / GRASS_COVER_TILE_METRES;
      uvs[index * 2 + 1] = z / GRASS_COVER_TILE_METRES;
    }
  }

  const indices = new Uint32Array(segments * segments * 6);
  let cursor = 0;
  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = iz * cols + ix;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  return { positions, normals, colors, uvs, indices, size: [size.width, size.depth] };
}
