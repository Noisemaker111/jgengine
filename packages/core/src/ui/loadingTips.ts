import { shuffleWithRng } from "../random/pick";
import { seededRng } from "../random/rng";

/**
 * The tip rotation behind a loading screen: a deterministic shuffle of the game's tips, shown one at a
 * time, cycling without repeating until the list is exhausted. Deterministic for a given seed, so a
 * capture or a test sees the same first tip every run. Presentation-free — the loading block owns the
 * look and the timer.
 */

export interface TipRotationConfig {
  tips: readonly string[];
  /** Seed for the shuffle. Default `"tips"`, so the order is stable across runs. */
  seed?: string | number;
}

export interface TipRotationSnapshot {
  order: number[];
  cursor: number;
}

/** A deterministic, cycle-through tip list. */
export interface TipRotation {
  current(): string | null;
  next(): string | null;
  index(): number;
  reset(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): TipRotationSnapshot;
  restore(snapshot: TipRotationSnapshot): void;
}

function shuffled(count: number, seed: string | number): number[] {
  return shuffleWithRng([...Array(count).keys()], seededRng(seed));
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
