import type { CSSProperties } from "react";

import type { Player } from "../logic/board";

export interface DiscTheme {
  name: string;
  fill: string;
  edge: string;
  glow: string;
  chip: string;
}

export const DISCS: Record<Player, DiscTheme> = {
  1: {
    name: "Sunflower",
    fill: "#fbbf24",
    edge: "#d97706",
    glow: "rgba(251, 191, 36, 0.85)",
    chip: "#f59e0b",
  },
  2: {
    name: "Crimson",
    fill: "#ef4444",
    edge: "#991b1b",
    glow: "rgba(239, 68, 68, 0.85)",
    chip: "#dc2626",
  },
};

/** Royal-blue board frame with a soft top highlight and pressed-in edges. */
export const boardFrame: CSSProperties = {
  background: "linear-gradient(160deg, #2563eb 0%, #1d4ed8 45%, #1e3a8a 100%)",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -4px 10px rgba(8,20,60,0.6), 0 24px 50px -22px rgba(6,20,60,0.9)",
  border: "1px solid rgba(191, 219, 254, 0.35)",
};

/** A punched, empty hole in the frame — reads as a shadowed cut-out. */
export const emptyHole: CSSProperties = {
  background: "radial-gradient(circle at 38% 32%, #16234a 0%, #101a38 60%, #0b1330 100%)",
  boxShadow: "inset 2px 3px 5px rgba(3,8,24,0.85), inset -1px -1px 2px rgba(120,150,220,0.25)",
};

export function discStyle(player: Player): CSSProperties {
  const theme = DISCS[player];
  return {
    background: `radial-gradient(circle at 36% 30%, #ffffff55 0%, ${theme.fill} 42%, ${theme.edge} 100%)`,
    boxShadow: `inset 2px 3px 4px rgba(255,255,255,0.35), inset -2px -3px 6px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.4)`,
  };
}

/** Soft photographic-studio sweep behind the whole board. Opaque — guarantees the backdrop. */
export const studioBackdrop: CSSProperties = {
  background:
    "radial-gradient(120% 90% at 50% 12%, #f1f5f9 0%, #dbe3ee 42%, #b6c2d6 78%, #93a2bd 100%)",
};

/** Grain-free vignette layered over the studio sweep for depth. */
export const studioVignette: CSSProperties = {
  background: "radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(30,41,80,0.28) 100%)",
};

export const HUD_STYLES = `
@keyframes fir-drop {
  0% { transform: translateY(var(--fir-fall, -320px)); }
  68% { transform: translateY(0); }
  80% { transform: translateY(-7%); }
  90% { transform: translateY(0); }
  95% { transform: translateY(-2%); }
  100% { transform: translateY(0); }
}
.fir-drop { animation: fir-drop 0.44s cubic-bezier(0.33, 0.9, 0.55, 1) both; }
@keyframes fir-win {
  0%, 100% { box-shadow: inset 2px 3px 4px rgba(255,255,255,0.35), 0 0 0 0 rgba(255,255,255,0); }
  50% { box-shadow: inset 2px 3px 4px rgba(255,255,255,0.5), 0 0 16px 4px rgba(255,255,255,0.95); }
}
.fir-win { animation: fir-win 1s ease-in-out infinite; }
@keyframes fir-ghost-pulse { 0%, 100% { opacity: 0.32; } 50% { opacity: 0.5; } }
.fir-ghost { animation: fir-ghost-pulse 1.1s ease-in-out infinite; }
`;
