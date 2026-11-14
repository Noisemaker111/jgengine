import type { PanelDef } from "@jgengine/core/ui/panelModel";

/**
 * The haunt's toggleable windows on the engine's `usePanels` manager: the build palette starts open
 * (B toggles it); the séance table (R), the ledger (L) and the ghost register (G) open on request;
 * ESC closes the top one.
 */
export const PARK_PANELS: readonly PanelDef[] = [
  { id: "build", title: "Build palette", hotkey: "KeyB", initial: true },
  { id: "research", title: "Séance table", hotkey: "KeyR" },
  { id: "books", title: "The ledger", hotkey: "KeyL" },
  { id: "ghosts", title: "Ghost register", hotkey: "KeyG" },
];

/** The panel id the séance table renders under. */
export const RESEARCH_PANEL = "research";

/** The panel id the build palette renders under. */
export const BUILD_PANEL = "build";

/** The panel id the ghost register renders under. */
export const GHOSTS_PANEL = "ghosts";
