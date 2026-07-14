import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { AppState } from "./types";

export const appStore = defineStore<AppState | undefined>("nonogram", undefined);

export function getState(ctx: GameContext): AppState | undefined {
  return appStore.peek(ctx);
}

export function setState(ctx: GameContext, state: AppState): void {
  appStore.write(ctx, state);
  setGamePhase(ctx, state.view === "menu" ? "menu" : state.status === "solving" ? "playing" : "ended");
}
