import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { AppState } from "./types";

export const STORE_KEY = "nonogram";

export function getState(ctx: GameContext): AppState | undefined {
  return ctx.game.store.get(STORE_KEY) as AppState | undefined;
}

export function setState(ctx: GameContext, state: AppState): void {
  ctx.game.store.set(STORE_KEY, state);
}
