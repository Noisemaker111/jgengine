export const HABITAT = {
  groundLow: "#3b3350",
  groundHigh: "#5a4f72",
  pad: "#6b6486",
  horizon: "#c9a6e0",
  zenith: "#2a2545",
  sun: "#ffe6b0",
  fog: "#4a3f66",
  flora: "#63d6a3",
  floraAlt: "#e08cd0",
  rock: "#463d5c",
} as const;

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
