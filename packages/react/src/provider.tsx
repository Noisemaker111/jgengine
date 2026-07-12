import { createContext, useContext, type ReactNode } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

const GameReactContext = createContext<GameContext | null>(null);

export function GameProvider({ context, children }: { context: GameContext; children?: ReactNode }) {
  return <GameReactContext.Provider value={context}>{children}</GameReactContext.Provider>;
}

export function useGameContext(): GameContext {
  const ctx = useContext(GameReactContext);
  if (ctx === null) throw new Error("useGameContext must be used within <GameProvider>");
  return ctx;
}

/** The game context if a `GameProvider` is present, otherwise `null` — for chrome that may render outside a running game (showcases, previews). */
export function useOptionalGameContext(): GameContext | null {
  return useContext(GameReactContext);
}
