/** The station hull and the black around it: the deck plating outside, the haze, the deep sky. */
export const HABITAT = {
  groundLow: "#1d1a2b",
  groundHigh: "#2c2840",
  pad: "#3a3550",
  horizon: "#2a2150",
  zenith: "#05040c",
  sun: "#fff1d6",
  fog: "#0d0b1a",
  flora: "#63d6a3",
  floraAlt: "#e08cd0",
  rock: "#24202f",
} as const;

/** The boarding house's modules: enamel cream shells on gunmetal trim, pastel light inside. */
export const STATION = {
  module: "#f4ead8",
  trim: "#4a4566",
  gasket: "#3fd0c0",
  scaffold: "#8f7bd8",
  corridor: "#3a3552",
} as const;

/** What a room's air looks like on its floor and in a leak haze. */
export const AIR_COLOR: Record<"oxygen" | "methane" | "vacuum", string> = { oxygen: "#9fe0c4", methane: "#c9ec5f", vacuum: "#b9a6ff" };
/** The rim of a room's floor by its warmth. */
export const CLIMATE_COLOR: Record<"cold" | "temperate" | "hot", string> = { cold: "#7fd2ff", temperate: "#d8d0e6", hot: "#ff9a52" };
/** Porthole and ceiling strip by a room's light. */
export const LIGHT_COLOR: Record<"dark" | "dim" | "bright", string> = { dark: "#3b4cff", dim: "#ffc98a", bright: "#fff6d8" };

export const NEED_COLORS: Record<string, string> = {
  hunger: "#ffb347",
  energy: "#7ec8ff",
  social: "#ff8fb0",
  fun: "#b98cff",
};

export const MOOD_COLORS: Record<string, string> = {
  radiant: "#5ef2a4",
  content: "#9be36b",
  fine: "#ffd86b",
  glum: "#ff9d5c",
  low: "#ff6b7d",
};
