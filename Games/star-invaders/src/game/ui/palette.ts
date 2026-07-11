export const COLORS = {
  squid: "#5ff2ff",
  crab: "#84ff6b",
  octopus: "#eaf3ff",
  cannon: "#54ff9f",
  shot: "#ffffff",
  bomb: "#ffe27a",
  bunker: "#57d986",
  saucer: "#ff6f91",
  explosion: "#fff2a8",
  baseline: "#2fae5c",
} as const;

export const ROW_COLOR: readonly string[] = [COLORS.squid, COLORS.crab, COLORS.crab, COLORS.octopus, COLORS.octopus];
