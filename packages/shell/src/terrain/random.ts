export type TerrainSeed = number | string;

/** @internal */
export function seedToUint32(seed: TerrainSeed = 1): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** @internal */
export function hashNoise2(x: number, z: number, seed: TerrainSeed = 1): number {
  let hash = seedToUint32(seed);
  hash ^= Math.imul(x | 0, 374761393);
  hash ^= Math.imul(z | 0, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}
