import { hashString } from "../random/rng";

/** A terrain seed: a number, or a string hashed to one. */
export type TerrainSeed = number | string;

/** @internal */
export function seedToUint32(seed: TerrainSeed = 1): number {
  return typeof seed === "number" ? seed >>> 0 : hashString(seed);
}

/** @internal */
export function hashNoise2(x: number, z: number, seed: TerrainSeed = 1): number {
  let hash = seedToUint32(seed);
  hash ^= Math.imul(x | 0, 374761393);
  hash ^= Math.imul(z | 0, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}
