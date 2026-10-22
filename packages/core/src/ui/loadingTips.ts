import { hashString } from "../random/rng";

/**
 * The tip rotation behind a loading screen: a deterministic shuffle of the game's tips, shown one at a
 * time, cycling without repeating until the list is exhausted. Deterministic for a given seed, so a
 * capture or a test sees the same first tip every run. Presentation-free — the loading block owns the
 * look and the timer.
 */

/** How a tip rotation is wired. */
export interface TipRotationConfig {
  /** The tips to rotate, in authored order. Empty means no tip is shown. */
  tips: readonly string[];
  /** Seed for the shuffle. Default `"tips"`, so the order is stable across runs. */
  seed?: string | number;
}

/** Serializable rotation state. */
export interface TipRotationSnapshot {
  /** Shuffled indices into the authored tip list. */
  order: number[];
  /** Position in {@link order} of the tip being shown. */
  cursor: number;
}

/** A deterministic, cycle-through tip list. */
export interface TipRotation {
  /** The tip being shown, or `null` when the game authored none. */
  current(): string | null;
  /** Advance to the next tip (wrapping) and return it. */
  next(): string | null;
  /** Index into {@link TipRotationConfig.tips} of the current tip, or `-1`. */
  index(): number;
  /** Restart at the first tip of the same shuffled order. */
  reset(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): TipRotationSnapshot;
  restore(snapshot: TipRotationSnapshot): void;
}

function shuffled(count: number, seed: string | number): number[] {
  const order = [...Array(count).keys()];
  let state = hashString(String(seed)) >>> 0;
  for (let i = order.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }
  return order;
}

/**
 * Create a {@link TipRotation} over the game's tips. Order is a seeded shuffle; `next()` walks it and
 * wraps, so every tip is seen once per cycle instead of a random repeat.
 *
 * @capability loading-tips deterministic loading-screen tip rotation with a seeded shuffle and snapshot/restore
 */
export function createTipRotation(config: TipRotationConfig): TipRotation {
  const tips = [...config.tips];
  let snapshot: TipRotationSnapshot = { order: shuffled(tips.length, config.seed ?? "tips"), cursor: 0 };
  const listeners = new Set<() => void>();

  function commit(next: TipRotationSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function current(): string | null {
    if (tips.length === 0) return null;
    return tips[snapshot.order[snapshot.cursor] ?? 0] ?? null;
  }

  return {
    current,
    next() {
      if (tips.length === 0) return null;
      commit({ order: snapshot.order, cursor: (snapshot.cursor + 1) % tips.length });
      return current();
    },
    index() {
      if (tips.length === 0) return -1;
      return snapshot.order[snapshot.cursor] ?? -1;
    },
    reset() {
      commit({ order: snapshot.order, cursor: 0 });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => ({ order: [...snapshot.order], cursor: snapshot.cursor }),
    restore(next) {
      const order = next.order.filter((index) => Number.isInteger(index) && index >= 0 && index < tips.length);
      const valid = order.length === tips.length && new Set(order).size === tips.length;
      commit({
        order: valid ? [...order] : shuffled(tips.length, config.seed ?? "tips"),
        cursor: valid ? Math.max(0, Math.min(next.cursor, tips.length - 1)) : 0,
      });
    },
  };
}
