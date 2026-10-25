import { useMemo, type ReactNode } from "react";

import { GameProvider } from "@jgengine/react/provider";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { llmvilleContent } from "@llmville/game/game/content";
import { gameConfig } from "@/game.config";

export function createLlmvilleGameContext(userId: string): GameContext {
  return createGameContext({
    definition: gameConfig,
    content: llmvilleContent,
    player: { userId, isNew: false },
  });
}

export function LlmvilleGameProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const context = useMemo(() => createLlmvilleGameContext(userId), [userId]);
  return <GameProvider context={context}>{children}</GameProvider>;
}
