import { createHudLayout, type HudAnchor, type HudLayoutStore } from "@jgengine/core/hud/hudLayout";

/** The rig panels a player may hide, with the chip label each one had on the old HUD canvas. */
export const HUD_PANELS = [
  { id: "dead-air", chip: "Dead air", anchor: "top-left" },
  { id: "overdrive", chip: "Overdrive", anchor: "left" },
  { id: "missions", chip: "Missions", anchor: "left" },
  { id: "field-notes", chip: "Notes", anchor: "left" },
  { id: "echo", chip: "Echo", anchor: "bottom" },
  { id: "loot-toasts", chip: "Loot", anchor: "top-right" },
  { id: "item-card", chip: "Item", anchor: "right" },
] as const satisfies readonly { id: string; chip: string; anchor: HudAnchor }[];
export type HudPanelId = (typeof HUD_PANELS)[number]["id"];

/** The key the old `useHudLayout({ storageKey: "scrap-signal" })` wrote, so earlier choices carry over. */
export const HUD_STORAGE_KEY = "jg:hud:scrap-signal";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export interface ScrapHudPanels {
  readonly layout: HudLayoutStore;
  visible(id: HudPanelId): boolean;
  toggle(id: HudPanelId): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Which rig panels are shown, on the engine's headless HUD layout model: hydrated from and written
 * back to the same storage entry the old HUD canvas used.
 */
export function createScrapHudPanels(storage: Storage | null): ScrapHudPanels {
  const layout = createHudLayout();
  for (const panel of HUD_PANELS) layout.register(panel.id, { anchor: panel.anchor, dx: 0, dy: 0 });
  layout.hydrate(storage?.getItem(HUD_STORAGE_KEY));
  layout.subscribe(() => storage?.setItem(HUD_STORAGE_KEY, layout.serialize()));
  return {
    layout,
    visible: id => layout.getState().panels[id]?.visible !== false,
    toggle: id => layout.setVisible(id, layout.getState().panels[id]?.visible === false),
    subscribe: listener => layout.subscribe(() => listener()),
  };
}

let shared: ScrapHudPanels | null = null;
/** The page's panel choices, persisted to local storage when the page has it. */
export function scrapHudPanels(): ScrapHudPanels {
  shared ??= createScrapHudPanels(typeof localStorage === "undefined" ? null : localStorage);
  return shared;
}
