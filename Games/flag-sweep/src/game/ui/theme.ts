import type { CSSProperties } from "react";

/** Classic Minesweeper number ramp: 1 blue, 2 green, 3 red, then the darker tail. */
export const NUMBER_COLORS: Record<number, string> = {
  1: "#2563eb",
  2: "#15803d",
  3: "#dc2626",
  4: "#1e3a8a",
  5: "#7f1d1d",
  6: "#0e7490",
  7: "#0f172a",
  8: "#6b7280",
};

export const SIGNAL_RED = "#e5352b";

/** Raised slate tile with a modernized double bevel. */
export const coveredTile: CSSProperties = {
  background: "linear-gradient(150deg, #5b6b80 0%, #47566a 55%, #3a4759 100%)",
  boxShadow:
    "inset 2px 2px 0 rgba(255,255,255,0.22), inset -2px -2px 0 rgba(8,12,20,0.45), 0 1px 1px rgba(0,0,0,0.25)",
};

export const coveredTilePressed: CSSProperties = {
  background: "linear-gradient(150deg, #3f4c5e 0%, #374356 100%)",
  boxShadow: "inset 2px 2px 0 rgba(8,12,20,0.45), inset -1px -1px 0 rgba(255,255,255,0.12)",
};

/** Sunk off-white cell for revealed squares. */
export const revealedTile: CSSProperties = {
  background: "#eef1f5",
  boxShadow: "inset 0 0 0 1px rgba(20,28,40,0.10)",
};

export const boardFrame: CSSProperties = {
  background: "#e7ebf1",
  boxShadow:
    "inset 3px 3px 0 #ffffff, inset -3px -3px 0 #b9c3d0, 0 18px 40px -18px rgba(0,0,0,0.7)",
};

export const ledPanel: CSSProperties = {
  background: "#160a0a",
  boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,80,60,0.15)",
};

export function formatLed(value: number): string {
  if (value < 0) {
    const magnitude = Math.min(99, -value);
    return `-${String(magnitude).padStart(2, "0")}`;
  }
  return String(Math.min(999, value)).padStart(3, "0");
}
