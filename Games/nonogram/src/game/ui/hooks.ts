import { useStore } from "@jgengine/react/store";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { appStore } from "../state/store";
import type { AppState } from "../state/types";

export type Commands = GameContext["game"]["commands"];

export function useApp(): AppState | undefined {
  return useStore(appStore);
}
