/**
 * Deterministic 32-bit FNV-1a hash of a string → unsigned int. Same text, same number, on every
 * platform — the stable seed behind per-id jitter, spread offsets, and content-addressed variation.
 */
export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashSeed(seed: string | number): number {
  return hashString(typeof seed === "number" ? seed.toString() : seed);
}

/** Deterministic pseudo-random generator seeded from a string or number — same seed, same sequence. */
export function seededRng(seed: string | number): () => number {
  let a = hashSeed(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives independent, deterministic {@link seededRng} streams from one base seed, keyed by stream name. */
export function seededStreams(seed: string | number): (stream: string) => () => number {
  const base = typeof seed === "number" ? seed.toString() : seed;
  return (stream) => seededRng(`${base}:${stream}`);
}
