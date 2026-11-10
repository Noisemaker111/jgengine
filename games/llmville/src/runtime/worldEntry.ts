import { useMutation } from "convex/react";
import { useEffect, useState } from "@jgengine/core/ui/jsx";

import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";

/**
 * Enters the shared datacenter once per lab: the server stamps the lab and name on the player's
 * presence row and says where it spawns, and the player is placed there. The shell's presence lane
 * carries every pose after that. `false` until the spawn is known.
 */
export function useWorldEntry(engine: GameEngine, gameId: Id<"games"> | null, canViewGame: boolean): boolean {
  const ensurePresence = useMutation(api.multiplayer.worldPresence.ensureHumanPresence);
  const [enteredGameId, setEnteredGameId] = useState<Id<"games"> | null>(null);

  useEffect(() => {
    if (!canViewGame || gameId === null || enteredGameId === gameId) return;
    let cancelled = false;
    void ensurePresence({ gameId }).then((result) => {
      if (cancelled || result === null) return;
      engine.dispatch(engineActions.setPlayerPosition({ x: result.position.x, z: result.position.z }));
      setEnteredGameId(gameId);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewGame, engine, ensurePresence, enteredGameId, gameId]);

  return gameId !== null && enteredGameId === gameId;
}
