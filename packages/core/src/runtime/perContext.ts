import type { GameContext } from "./gameContext";

/**
 * Per-`GameContext` lazy state, keyed by context identity through a `WeakMap` so it is reclaimed when
 * the context is — the seam a game uses instead of a module-global `Map`, which is process-global and
 * bleeds across worlds when one host serves several `serverId`s (#632). `init` runs once per distinct
 * context on first access; the same context always resolves to the same value. This mirrors the engine's
 * built-in per-ctx pattern (`ctx.player.motion`, `stepPlayerMovement`).
 *
 * ```ts
 * const heroRuntimes = perContext(() => new Map<string, HeroRuntime>());
 * // per world:
 * heroRuntimes(ctx).set(userId, runtime);
 * ```
 */
export function perContext<T>(init: (ctx: GameContext) => T): (ctx: GameContext) => T {
  const byContext = new WeakMap<GameContext, T>();
  return (ctx) => {
    if (!byContext.has(ctx)) byContext.set(ctx, init(ctx));
    return byContext.get(ctx) as T;
  };
}
