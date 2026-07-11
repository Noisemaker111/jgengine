export interface TileStyle {
  bg: string;
  fg: string;
  glow: string;
}

const INK = "#6b4a2b";
const CREAM = "#fff6e6";

const emberGlow = (color: string): string => `0 0 14px ${color}, 0 2px 8px rgba(120,45,15,0.35)`;

export const TILE_RAMP: Record<number, TileStyle> = {
  2: { bg: "#f3e5c9", fg: INK, glow: "none" },
  4: { bg: "#f1d8a2", fg: INK, glow: "none" },
  8: { bg: "#f0b45c", fg: CREAM, glow: "none" },
  16: { bg: "#ec8f3f", fg: CREAM, glow: "none" },
  32: { bg: "#e86f37", fg: CREAM, glow: "none" },
  64: { bg: "#e14e2b", fg: CREAM, glow: emberGlow("rgba(225,78,43,0.45)") },
  128: { bg: "#d63a3f", fg: CREAM, glow: emberGlow("rgba(214,58,63,0.5)") },
  256: { bg: "#c8283f", fg: CREAM, glow: emberGlow("rgba(200,40,63,0.55)") },
  512: { bg: "#b31d47", fg: CREAM, glow: emberGlow("rgba(179,29,71,0.6)") },
  1024: { bg: "#c99a34", fg: CREAM, glow: emberGlow("rgba(201,154,52,0.6)") },
  2048: { bg: "#e2b93b", fg: "#4a3410", glow: emberGlow("rgba(226,185,59,0.8)") },
  4096: { bg: "#caa23a", fg: CREAM, glow: emberGlow("rgba(202,162,58,0.7)") },
  8192: { bg: "#b8862f", fg: CREAM, glow: emberGlow("rgba(184,134,47,0.7)") },
};

const FALLBACK: TileStyle = { bg: "#8a5a2b", fg: "#ffe9b0", glow: emberGlow("rgba(255,207,120,0.75)") };

export function styleFor(value: number): TileStyle {
  return TILE_RAMP[value] ?? FALLBACK;
}

export function fontClassFor(value: number): "lg" | "md" | "sm" | "xs" {
  if (value < 100) return "lg";
  if (value < 1000) return "md";
  if (value < 10000) return "sm";
  return "xs";
}
