import type { GameContext } from "../runtime/gameContext";

/**
 * A typed, cast-free handle onto a per-owner keyed family of slots on the reactive game store
 * (`ctx.game.store`) — the {@link StoreHandle} shape widened with an `id` (userId, instanceId, …)
 * so one definition covers every owner instead of one `defineStore` call per key. `keyFor` composes
 * the underlying store key from the id; call sites never see it. Writes flow through the engine
 * store, so they bump `ctx.version()`, serialize into a {@link WorldSnapshot}, and replay under host
 * authority — the same guarantees a hand-rolled `` `prefix:${id}` `` string plus `store.get(key) as T`
 * gives up.
 */
export interface KeyedStoreHandle<T> {
  /** Compose the underlying store key for one owner. Exposed for snapshot/debug tooling; call sites use {@link read}/{@link write}. */
  keyFor(id: string): string;
  /** The current value for `id`, or the definition's initial when that slot has never been written. */
  read(ctx: GameContext, id: string): T;
  /** The raw stored value for `id`, or `undefined` when unset — distinguishes "never written" from the initial. */
  peek(ctx: GameContext, id: string): T | undefined;
  /** Overwrite `id`'s slot; bumps `ctx.version()` and notifies `ctx.subscribe`. */
  write(ctx: GameContext, id: string, value: T): void;
  /** Read-modify-write `id`'s slot in one step, returning the next value. `mutate` receives the current value (or initial when unset). */
  update(ctx: GameContext, id: string, mutate: (previous: T) => T): T;
  /** Delete `id`'s slot, so the next {@link read} for that id returns the initial again. */
  clear(ctx: GameContext, id: string): void;
}

/**
 * Define a typed per-owner keyed family on the game store: game code expresses
 * `read(ctx, userId)`/`write(ctx, userId, v)`/`update(...)` with the value type it means, and both the
 * `` `prefix:${id}` `` key composition and the `unknown → T` cast live once, here, behind the boundary.
 * Reach for this over N separate `defineStore` calls whenever the owning id varies at runtime (per-user
 * class, per-instance auras) — `defineStore` stays the right call for a single fixed slot.
 *
 * Pass a factory for `initial` when the fallback is a fresh mutable object; the factory runs at most
 * once **per id** and its result is reused, so an unwritten id's slot keeps a stable identity across
 * reads (no per-read churn for a React selector, no allocation on a hot path).
 *
 * @capability typed-keyed-store a cast-free typed handle onto a per-owner keyed family of reactive game-store slots, replayable and host-authoritative
 */
export function defineKeyedStore<T>(
  keyFor: (id: string) => string,
  initial: T | (() => T),
): KeyedStoreHandle<T> {
  const resolved = new Map<string, { readonly value: T }>();
  const initialValue = (id: string): T => {
    if (typeof initial !== "function") return initial;
    let entry = resolved.get(id);
    if (entry === undefined) {
      entry = { value: (initial as () => T)() };
      resolved.set(id, entry);
    }
    return entry.value;
  };
  const read = (ctx: GameContext, id: string): T => {
    const value = ctx.game.store.get(keyFor(id));
    return value === undefined ? initialValue(id) : (value as T);
  };
  return {
    keyFor,
    read,
    peek: (ctx, id) => ctx.game.store.get(keyFor(id)) as T | undefined,
    write: (ctx, id, value) => ctx.game.store.set(keyFor(id), value),
    update: (ctx, id, mutate) => {
      const next = mutate(read(ctx, id));
      ctx.game.store.set(keyFor(id), next);
      return next;
    },
    clear: (ctx, id) => ctx.game.store.delete(keyFor(id)),
  };
}
