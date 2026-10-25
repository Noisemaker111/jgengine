import { hashString, randomSeedFrom, stepRandomSeed } from "@jgengine/core/random/rng";

/** Deterministic 32-bit hash for structural city indices — never use Math.random(). */
export function hashStructuralSeed(parts: readonly (string | number)[]): number {
  return hashString(parts.join(":"));
}

/** The engine's seeded stream over an integer seed — returns [0, 1), same sequence as before the move. */
export function mulberry32(seed: number): () => number {
  let cursor = randomSeedFrom(seed >>> 0);
  return () => {
    const [value, next] = stepRandomSeed(cursor);
    cursor = next;
    return value;
  };
}

export function hashedInt(seed: number, min: number, max: number): number {
  const rng = mulberry32(seed);
  return min + Math.floor(rng() * (max - min + 1));
}
