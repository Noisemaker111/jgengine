import { useCallback } from "react";

import { resolveWalkerStep } from "@jgengine/core/movement/solidObstacles";
import { useGameContext } from "@jgengine/react/provider";
import {
  stepPlayer,
  type GeometryStepResolver,
  type PlayerPosition,
} from "@llmville/game/movement/playerMovement";
import { PLAYER_COLLISION_RADIUS } from "@llmville/game/world/grid";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";

export function usePlayerStep({
  engine,
  otherPlayerPositions,
}: {
  engine: GameEngine;
  otherPlayerPositions: readonly PlayerPosition[];
}) {
  const ctx = useGameContext();

  const resolveGeometryStep = useCallback<GeometryStepResolver>(
    (from, stepX, stepZ) =>
      resolveWalkerStep(ctx, [from.x, 0, from.z], stepX, stepZ, {
        radius: PLAYER_COLLISION_RADIUS,
      }),
    [ctx],
  );

  const onStepPlayer = useCallback(
    (deltaX: number, deltaZ: number) => {
      const playerPosition = engine.getState().player.position;
      const next = stepPlayer(playerPosition, deltaX, deltaZ, {
        resolveGeometryStep,
        otherPlayers: otherPlayerPositions,
      });
      engine.dispatch(engineActions.setPlayerPosition(next));
    },
    [engine, otherPlayerPositions, resolveGeometryStep],
  );

  return { onStepPlayer };
}
