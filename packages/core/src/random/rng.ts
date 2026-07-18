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

/**
 * Opaque, serializable PRNG cursor for state machines that must persist their own random stream
 * (a spawn director, a heat/pursuit meter) instead of holding a closure — the state round-trips
 * through save/load and multiplayer sync, so it can't carry a function. Never read or do
 * arithmetic on the raw value directly; thread it through {@link stepRandomSeed} only.
 */
export type RandomSeed = number & { readonly __randomSeed: unique symbol };

/** Wraps an already-integer seed (e.g. a `config.seed`) as a {@link RandomSeed} — no hashing. */
export function randomSeedFrom(seed: number): RandomSeed {
  return (seed | 0) as RandomSeed;
}

/**
 * One step of the {@link seededRng} recurrence in pure (seed in, seed out) form — the same
 * mulberry32-style generator, shared by every state machine that persists its own PRNG cursor
 * instead of closing over a generator.
 */
export function stepRandomSeed(seed: RandomSeed): readonly [value: number, next: RandomSeed] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next as RandomSeed];
}

/** Deterministic pseudo-random generator seeded from a string or number — same seed, same sequence.
 *
 * @capability seeded-random injected deterministic randomness for game logic — never `Math.random` in a simulation
 */
export function seededRng(seed: string | number): () => number {
  let cursor = randomSeedFrom(hashSeed(seed));
  return () => {
    const [value, next] = stepRandomSeed(cursor);
    cursor = next;
    return value;
  };
}

/** Derives independent, deterministic {@link seededRng} streams from one base seed, keyed by stream name. */
export function seededStreams(seed: string | number): (stream: string) => () => number {
  const base = typeof seed === "number" ? seed.toString() : seed;
  return (stream) => seededRng(`${base}:${stream}`);
}
