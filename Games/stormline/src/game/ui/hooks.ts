import { useGameStore } from "@jgengine/react/hooks";
import { initialRunState, type RunState } from "../course/run";

export function useRunState(): RunState {
  return useGameStore((ctx) => (ctx.game.store.get("run") as RunState | undefined) ?? initialRunState());
}
