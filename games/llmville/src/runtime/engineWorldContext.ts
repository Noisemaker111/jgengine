import { ENGINE_WORLD_ACTION, type GameEngine, type GameEngineAction } from "@llmville/game/simulation/gameEngine";
import {
  engineWorldContextEquals,
  type EngineWorldContext,
} from "@llmville/game/simulation/worldContext";
import { useEffect, useRef } from "react";

export {
  defaultEngineWorldContext,
  type EngineWorldContext,
  type EngineWorldRack,
} from "@llmville/game/simulation/worldContext";

export interface UseEngineWorldContextParams {
  engine: Pick<GameEngine, "dispatch">;
  enabled: boolean;
  context: EngineWorldContext;
}

export function useEngineWorldContext({ engine, enabled, context }: UseEngineWorldContextParams): void {
  const previousContextRef = useRef<EngineWorldContext | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (previousContextRef.current !== null && engineWorldContextEquals(previousContextRef.current, context)) {
      return;
    }
    previousContextRef.current = context;

    const action: GameEngineAction = {
      type: ENGINE_WORLD_ACTION.setWorldContext,
      benchPosition: context.benchPosition,
      racks: context.racks,
      placedBuildItems: context.placedBuildItems,
      isTraining: context.isTraining,
      hasLab: context.hasLab,
      touchControlsEnabled: context.touchControlsEnabled,
      tutorialSignals: context.tutorialSignals,
    };
    engine.dispatch(action);
  }, [context, enabled, engine]);
}
