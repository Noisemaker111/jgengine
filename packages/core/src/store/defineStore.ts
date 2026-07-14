import type { GameContext } from "../runtime/gameContext";

/**
 * A typed, cast-free handle onto one slot of the reactive game store (`ctx.game.store`). The single
 * type parameter is fixed at definition; `read`/`write`/`update` never widen to `unknown`, so no call
 * site repeats `store.get(key) as T`. Writes flow through the engine store, so they bump
 * `ctx.version()`, serialize into a {@link WorldSnapshot}, and replay under host authority — the same
 * guarantees a hand-rolled `store.get`/`store.set` pair gives up the moment it forks run state into a
 * module-level singleton.
 */
export interface StoreHandle<T> {
  /** The underlying store key. Exposed for snapshot/debug tooling; call sites use {@link read}/{@link write}. */
  readonly key: string;
  /** The current value, or the definition's initial when the slot has never been written. */
  read(ctx: GameContext): T;
  /** The raw stored value, or `undefined` when unset — for callers that need to distinguish "never written" from the initial. */
  peek(ctx: GameContext): T | undefined;
  /** Overwrite the slot; bumps `ctx.version()` and notifies `ctx.subscribe`. */
  write(ctx: GameContext, value: T): void;
  /** Read-modify-write in one step, returning the next value. `mutate` receives the current value (or initial when unset). */
  update(ctx: GameContext, mutate: (previous: T) => T): T;
  /** Delete the slot, so the next {@link read} returns the initial again. */
  clear(ctx: GameContext): void;
}

/**
 * Define a typed slot on the game store: game code expresses `read(ctx)`/`write(ctx, v)`/`update(...)`
 * with the value type it means, and the `unknown → T` cast lives once, here, behind the boundary. Pass
 * a factory for `initial` when the fallback is a fresh mutable object; the factory runs at most once and
 * its result is reused, so an unwritten slot keeps a stable identity across reads (no per-read churn for
 * a React selector, no allocation on a hot path).
 *
 * @capability typed-store a cast-free typed handle onto one reactive game-store slot, replayable and host-authoritative
 */
export function defineStore<T>(key: string, initial: T | (() => T)): StoreHandle<T> {
  let resolved: { readonly value: T } | null = null;
  const initialValue = (): T => {
    if (typeof initial !== "function") return initial;
    if (resolved === null) resolved = { value: (initial as () => T)() };
    return resolved.value;
  };
  const read = (ctx: GameContext): T => {
    const value = ctx.game.store.get(key);
    return value === undefined ? initialValue() : (value as T);
  };
  return {
    key,
    read,
    peek: (ctx) => ctx.game.store.get(key) as T | undefined,
    write: (ctx, value) => ctx.game.store.set(key, value),
    update: (ctx, mutate) => {
      const next = mutate(read(ctx));
      ctx.game.store.set(key, next);
      return next;
    },
    clear: (ctx) => ctx.game.store.delete(key),
  };
}
