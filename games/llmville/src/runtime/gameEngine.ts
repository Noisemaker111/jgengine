import type { GameEngine, GameEngineState } from "@llmville/game/simulation/gameEngine";
import { useSyncExternalStore } from "react";

export * from "@llmville/game/simulation/gameEngine";
export { wrapMutation, withEditAccess } from "@/runtime/engineAccess";

export function useGameEngineState<T>(engine: GameEngine, selector: (state: GameEngineState) => T): T {
  return useSyncExternalStore(
    (listener) => engine.subscribe(() => listener()),
    () => selector(engine.getState()),
    () => selector(engine.getState()),
  );
}
