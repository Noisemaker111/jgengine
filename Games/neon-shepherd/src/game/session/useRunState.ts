import { useGameStore } from "@jgengine/react/hooks";
import { createInitialRunState, RUN_STORE_KEY, type RunState } from "./store";

export function useRunState(): RunState {
  return useGameStore((ctx) => (ctx.game.store.get(RUN_STORE_KEY) as RunState | undefined) ?? createInitialRunState());
}
