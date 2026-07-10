import { ANTENNA_OBJECT, BANNER_OBJECT, BRIDGE_OBJECT } from "./catalog";

export const PALETTE = {
  cloudWhite: "#f4f7f9",
  skyTeal: "#4ecdc4",
  citySlate: "#5d737e",
  windsockOrange: "#ff9f1c",
  shadowBlue: "#2b3a67",
} as const;

export const OBJECT_STYLES: Record<string, { color?: string; opacity?: number }> = {
  [BANNER_OBJECT]: { color: PALETTE.skyTeal, opacity: 0.9 },
  [BRIDGE_OBJECT]: { color: PALETTE.cloudWhite },
  [ANTENNA_OBJECT]: { color: PALETTE.citySlate },
};
