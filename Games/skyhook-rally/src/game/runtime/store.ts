import type { GameContext } from "@jgengine/core/runtime/gameContext";

export function storeGet<T>(ctx: GameContext, key: string): T | undefined {
  return ctx.game.store.get(key) as T | undefined;
}

export function storeSet<T>(ctx: GameContext, key: string, value: T): void {
  ctx.game.store.set(key, value);
}
