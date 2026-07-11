import { useGameStore } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { STORE_KEY } from "../state/store";
import type { AppState } from "../state/types";

export type Commands = GameContext["game"]["commands"];

export function useApp(): AppState | undefined {
  return useGameStore((ctx) => ctx.game.store.get(STORE_KEY) as AppState | undefined);
}
