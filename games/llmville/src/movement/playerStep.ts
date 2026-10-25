import { useMemo } from "react";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";

import type { PresenceActions, PresenceFeeds } from "@/multiplayer/presenceTransport";
import { useMovementPresence } from "@/movement/movementPresence";
import { usePlayerStep } from "@/movement/movementStepping";
import type { GameEngine } from "@/runtime/gameEngine";

interface UseMovementSessionParams {
  engine: GameEngine;
  playerId: string;
  canViewGame: boolean;
  game: { _id: Id<"games"> } | null | undefined;
  presenceFeeds: PresenceFeeds;
  presenceActions: PresenceActions;
}

export function useMovementSession(params: UseMovementSessionParams) {
  const {
    engine,
    playerId,
    canViewGame,
    game,
    presenceFeeds,
    presenceActions,
  } = params;

  const { otherWorldPresences, hasBeenDisplaced } = useMovementPresence({
    engine,
    playerId,
    canViewGame,
    game,
    presenceFeeds,
    presenceActions,
  });

  const otherPlayerPositions = useMemo(
    () => otherWorldPresences.filter((presence) => presence.online !== false).map((presence) => ({ x: presence.position.x, z: presence.position.z })),
    [otherWorldPresences],
  );

  const { onStepPlayer } = usePlayerStep({
    engine,
    otherPlayerPositions,
  });

  return {
    onStepPlayer,
    otherWorldPresences,
    hasBeenDisplaced,
  };
}
