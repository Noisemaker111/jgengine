/** @jsxImportSource @jgengine/core/ui/jsx */
import { createContext, useContext, type ReactNode } from "@jgengine/core/ui/jsx";
import type { EditorUiPanelLayout } from "@jgengine/core/hud/hudDocument";

/**
 * Host-owned callback that commits one HUD panel layout into the scene document
 * (typically an undoable `setUiPanel` dispatch). Injected by the editor so product
 * UI never reaches for editor globals.
 */
export type HudLayoutPersist = (id: string, panel: EditorUiPanelLayout) => void;

const HudLayoutPersistContext = createContext<HudLayoutPersist | null>(null);

/** @capability hud-layout-persist inject a host callback so canvas HUD edits commit into the scene document */
export function HudLayoutPersistProvider({
  onPanelCommit,
  children,
}: {
  onPanelCommit: HudLayoutPersist;
  children?: ReactNode;
}) {
  return (
    <HudLayoutPersistContext.Provider value={onPanelCommit}>{children}</HudLayoutPersistContext.Provider>
  );
}

/** @capability hud-layout-persist-hook read the host panel-commit port from a HUD layout widget */
export function useHudLayoutPersist(): HudLayoutPersist | null {
  return useContext(HudLayoutPersistContext);
}
