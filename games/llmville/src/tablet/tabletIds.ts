/** Tablet app and store-tab identifiers — no imports to avoid cycles with tablet shell hooks. */

export type TabletAppId = "models" | "inference" | "stats" | "store" | "storage" | "map" | "bills" | "bot" | "settings";
export type TabletStoreTabId = "infrastructure" | "decor" | "hardware" | "cooling" | "operator";

export const TABLET_APP_ID = {
  models: "models",
  inference: "inference",
  stats: "stats",
  store: "store",
  storage: "storage",
  map: "map",
  bills: "bills",
  bot: "bot",
  settings: "settings",
} as const satisfies Record<string, TabletAppId>;

export const TABLET_STORE_TAB_ID = {
  infrastructure: "infrastructure",
  decor: "decor",
  hardware: "hardware",
  cooling: "cooling",
  operator: "operator",
} as const satisfies Record<string, TabletStoreTabId>;