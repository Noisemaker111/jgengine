import { createContext, useContext, type ReactNode } from "react";
import type { EditorUiPanelLayout } from "@jgengine/core/ui/hudDocument";

/**
 * Host-owned callback that commits one HUD panel layout into the scene document
 * (typically an undoable `setUiPanel` dispatch). Injected by the editor so product
 * UI never reaches for editor globals.
 */
export type HudLayoutPersist = (id: string, panel: EditorUiPanelLayout) => void;

const HudLayoutPersistContext = createContext<HudLayoutPersist | null>(null);

/**
 * Provides {@link HudLayoutPersist} / `onPanelCommit` to descendant `useHudLayout`
 * calls. Mount around game UI when a host can accept document UI patches (editor).
 * Absent provider → canvas moves/resizes are no-ops for document writes.
 */
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

/** Injected panel-commit port, or `null` when no host has provided one. */
export function useHudLayoutPersist(): HudLayoutPersist | null {
  return useContext(HudLayoutPersistContext);
}
