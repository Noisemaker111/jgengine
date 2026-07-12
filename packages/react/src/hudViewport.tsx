import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { HudPlatform, HudViewportConfig } from "@jgengine/core/ui/hudScale";

export interface HudViewportContextValue {
  /** True unless the game's `platforms` explicitly excludes `"mobile"` — the HUD auto-fits the design resolution to the live viewport. */
  fitEnabled: boolean;
  config: HudViewportConfig | undefined;
  /** Player's UI-scale setting; multiplies the computed fit scale everywhere. */
  userScale: number;
}

const HudViewportContext = createContext<HudViewportContextValue | null>(null);

/**
 * Mounted by the shell around `GameUI` so every `HudCanvas` inside the game
 * picks up the game's `platforms`/`hudFit` declaration and the player's UI
 * scale setting without any game-side wiring.
 */
export function HudViewportProvider({
  platforms,
  config,
  userScale,
  children,
}: {
  platforms: readonly HudPlatform[] | undefined;
  config: HudViewportConfig | undefined;
  userScale?: number;
  children?: ReactNode;
}) {
  const fitEnabled = platforms?.includes("mobile") ?? true;
  const scale = userScale ?? 1;
  const value = useMemo(
    () => ({ fitEnabled, config, userScale: scale }),
    [fitEnabled, config, scale],
  );
  return <HudViewportContext.Provider value={value}>{children}</HudViewportContext.Provider>;
}

export function useHudViewport(): HudViewportContextValue | null {
  return useContext(HudViewportContext);
}
