export interface BenchParams {
  /** Small gray bed cubes, seeded asleep. */
  small: number;
  /** Larger gray cubes that drop onto the bed and settle. */
  large: number;
  /** Orange chaos cubes kicked into the bed at high speed. */
  chaos: number;
  /** Bed layer count (stack depth of the small-cube bed). */
  layers: number;
  seed: number;
  gravity: number;
  cellSize: number;
}

export const DEFAULT_PARAMS: BenchParams = {
  small: 100000,
  large: 40,
  chaos: 8,
  layers: 3,
  seed: 1337,
  gravity: -22,
  cellSize: 1,
};

function readInt(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readFloat(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function resolveParams(search: string): BenchParams {
  const params = new URLSearchParams(search);
  return {
    small: readInt(params, "small", DEFAULT_PARAMS.small),
    large: readInt(params, "large", DEFAULT_PARAMS.large),
    chaos: readInt(params, "chaos", DEFAULT_PARAMS.chaos),
    layers: Math.max(1, readInt(params, "layers", DEFAULT_PARAMS.layers)),
    seed: readInt(params, "seed", DEFAULT_PARAMS.seed),
    gravity: readFloat(params, "gravity", DEFAULT_PARAMS.gravity),
    cellSize: Math.max(0.25, readFloat(params, "cellSize", DEFAULT_PARAMS.cellSize)),
  };
}

/** Deterministic PRNG (mulberry32) so a given seed always builds the same scene. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
