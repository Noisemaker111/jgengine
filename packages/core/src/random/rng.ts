const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Deterministic 32-bit FNV-1a hash of a string → unsigned int. Same text, same number, on every
 * platform — the stable seed behind per-id jitter, spread offsets, and content-addressed variation.
 *
 * @capability seeded-random injected deterministic randomness for game logic — never `Math.random` in a simulation
 */
export function hashString(text: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * A stable roll in `[0, 1)` for one key — one deterministic draw with no stream to keep. The hash is
 * avalanched first, so keys that differ only in a trailing index (`lot:3`, `lot:4`) roll independently.
 *
 * @capability seeded-random injected deterministic randomness for game logic — never `Math.random` in a simulation
 */
export function hashUnit(text: string): number {
  let h = hashString(text);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * FNV-1a over a sequence of integers (bytes or 32-bit words) → unsigned int. Pass a previous result as
 * `from` to keep hashing across several arrays. The digest behind replay and simulation snapshots.
 *
 * @capability seeded-random injected deterministic randomness for game logic — never `Math.random` in a simulation
 */
export function hashWords(words: ArrayLike<number>, from: number = FNV_OFFSET): number {
  let h = from >>> 0;
  for (let i = 0; i < words.length; i++) {
    h ^= words[i] ?? 0;
    h = Math.imul(h, FNV_PRIME);
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

/** A {@link seededRng} stream: callable like any `() => number`, with its cursor readable and restorable for snapshots and replay. */
export interface SeededRng {
  (): number;
  /** The current cursor; feed it back to {@link restore} (or a fresh stream's `restore`) to resume the exact sequence. */
  state(): number;
  restore(cursor: number): void;
}

/** Deterministic pseudo-random generator seeded from a string or number — same seed, same sequence.
 *
 * @capability seeded-random injected deterministic randomness for game logic — never `Math.random` in a simulation
 */
export function seededRng(seed: string | number): SeededRng {
  let cursor = randomSeedFrom(hashSeed(seed));
  const next = (): number => {
    const [value, following] = stepRandomSeed(cursor);
    cursor = following;
    return value;
  };
  const rng = next as SeededRng;
  rng.state = () => cursor;
  rng.restore = (value: number) => {
    cursor = randomSeedFrom(value);
  };
  return rng;
}

/** The cursor of a seeded stream, or `null` for a generator that carries no state (an injected closure, `Math.random`). */
export function rngStateOf(rng: () => number): number | null {
  const candidate = rng as Partial<SeededRng>;
  return typeof candidate.state === "function" ? candidate.state() : null;
}

/** Restore a seeded stream's cursor; a no-op for generators that carry no state. */
export function restoreRng(rng: () => number, cursor: number): void {
  const candidate = rng as Partial<SeededRng>;
  if (typeof candidate.restore === "function") candidate.restore(cursor);
}

/** Derives independent, deterministic {@link seededRng} streams from one base seed, keyed by stream name. */
export function seededStreams(seed: string | number): (stream: string) => () => number {
  const base = typeof seed === "number" ? seed.toString() : seed;
  return (stream) => seededRng(`${base}:${stream}`);
}
