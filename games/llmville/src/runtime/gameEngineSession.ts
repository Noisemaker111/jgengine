import { useState } from "react";

import {
  GameEngine,
  type GameEngineParams,
} from "@/runtime/gameEngine";
import { resolveInteractionHint } from "@/runtime/interactionHints";

function sessionKey(params: GameEngineParams): string {
  return `${params.activeSlot}:${params.gameId}:${params.playerId}`;
}

function createSessionEngine(params: GameEngineParams): GameEngine {
  return new GameEngine({ ...params, resolveHint: resolveInteractionHint });
}

/** Stable per-session engine instance — recreates only when slot/game/player changes. */
export function useGameEngineSession(params: GameEngineParams): GameEngine {
  const key = sessionKey(params);
  const [session, setSession] = useState(() => ({
    key,
    engine: createSessionEngine(params),
  }));

  if (session.key !== key) {
    const engine = createSessionEngine(params);
    setSession({ key, engine });
    return engine;
  }

  return session.engine;
}
