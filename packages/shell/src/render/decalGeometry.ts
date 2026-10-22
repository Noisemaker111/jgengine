import type { TerrainHeightSampler } from "../terrain/terrainMath";

/** Inputs for {@link createDecalDrapeGeometry}. */
export interface DecalDrapeOptions {
  /** Decal edge length in metres. */
  size: number;
  rotationY: number;
  heightAt: TerrainHeightSampler;
  /** Height above the sampled ground, metres. */
  lift: number;
  /** Grid resolution per axis; defaults to 12 (bounded, decals are small). */
  segments?: number;
}

/** Baked vertex/index buffers for one draped ground decal. */
export interface DecalDrapeGeometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * A ground decal's draped quad: an `size`² patch rotated by `rotationY`, every vertex lifted onto
 * the live terrain so a stain follows a curb or a camber instead of floating over it or sinking
 * through it. Bounded to one small grid — decals are metres, not patches.
 * @internal
 */
export function createDecalDrapeGeometry(options: DecalDrapeOptions): DecalDrapeGeometry {
  const segments = Math.max(2, Math.min(24, Math.floor(options.segments ?? 12)));
  const half = options.size / 2;
  const cos = Math.cos(options.rotationY);
  const sin = Math.sin(options.rotationY);
  const cols = segments + 1;
  const positions = new Float32Array(cols * cols * 3);
  const normals = new Float32Array(cols * cols * 3);
  const uvs = new Float32Array(cols * cols * 2);
  const eps = Math.max(0.05, options.size / segments / 2);
  for (let iz = 0; iz < cols; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const lx = -half + (ix / segments) * options.size;
      const lz = -half + (iz / segments) * options.size;
      const x = lx * cos + lz * sin;
      const z = -lx * sin + lz * cos;
      const index = iz * cols + ix;
      positions[index * 3] = x;
      positions[index * 3 + 1] = options.heightAt(x, z) + options.lift;
      positions[index * 3 + 2] = z;
      const hx = options.heightAt(x + eps, z) - options.heightAt(x - eps, z);
      const hz = options.heightAt(x, z + eps) - options.heightAt(x, z - eps);
      const length = Math.hypot(hx, 2 * eps, hz) || 1;
      normals[index * 3] = -hx / length;
      normals[index * 3 + 1] = (2 * eps) / length;
      normals[index * 3 + 2] = -hz / length;
      uvs[index * 2] = ix / segments;
      uvs[index * 2 + 1] = 1 - iz / segments;
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
  return { positions, normals, uvs, indices };
}
