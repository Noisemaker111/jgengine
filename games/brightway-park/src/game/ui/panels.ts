import type { PanelDef } from "@jgengine/core/ui/panelModel";

/**
 * The park's toggleable windows on the engine's `usePanels` manager: the build palette starts open
 * (B toggles it); the research lab (R) and the park books (L) open on request; ESC closes the top one.
 */
export const PARK_PANELS: readonly PanelDef[] = [
  { id: "build", title: "Build palette", hotkey: "KeyB", initial: true },
  { id: "research", title: "Research lab", hotkey: "KeyR" },
  { id: "books", title: "Park books", hotkey: "KeyL" },
];

/** The panel id the research lab renders under. */
export const RESEARCH_PANEL = "research";

/** The panel id the build palette renders under. */
export const BUILD_PANEL = "build";
