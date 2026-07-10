import { useGameStore } from "@jgengine/react/hooks";
import { createInitialRunState, type RunState } from "../systems/runState";

export function useRunState(): RunState {
  return useGameStore((ctx) => (ctx.game.store.get("run") as RunState | undefined) ?? createInitialRunState());
}
