import { createContext, useContext, type ReactNode } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

const GameReactContext = createContext<GameContext | null>(null);

export function GameProvider({ context, children }: { context: GameContext; children?: ReactNode }) {
  return <GameReactContext.Provider value={context}>{children}</GameReactContext.Provider>;
}

/**
 * Re-provide a captured {@link GameContext} across a nested React reconciler boundary. The `<Canvas>`
 * of `@react-three/fiber` renders its children in a *separate* React root, so a `GameProvider` in the
 * outer tree does NOT reach inside it — hooks like `useGameContext` / `useEntityRenderCues` throw. The
 * fix the shell already uses internally: capture the context outside the boundary (with
 * {@link useOptionalGameContext}) and wrap the inner tree in `GameContextBridge`. A `null` context
 * renders children unchanged, so the same code works in showcases with no running game. This is the
 * seam behind `EntityPreview` — reach for it directly when building a bespoke nested canvas.
 *
 * @capability game-context-bridge re-provide the GameContext across a nested Canvas/reconciler boundary
 */
export function GameContextBridge({
  context,
  children,
}: {
  context: GameContext | null;
  children?: ReactNode;
}) {
  if (context === null) return <>{children}</>;
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
