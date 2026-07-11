import type { CSSProperties } from "react";

export interface PegDef {
  readonly color: string;
  /** Colorblind-safe distinct glyph rendered on the peg. */
  readonly glyph: string;
  readonly name: string;
}

/** Eight lacquered pegs — distinct hue AND distinct glyph so color is never the only signal. */
export const PEGS: readonly PegDef[] = [
  { color: "#d5493f", glyph: "●", name: "Ruby" },
  { color: "#e8892d", glyph: "■", name: "Amber" },
  { color: "#e7c53a", glyph: "▲", name: "Gold" },
  { color: "#4f9d5b", glyph: "★", name: "Jade" },
  { color: "#4aa3d6", glyph: "♥", name: "Sky" },
  { color: "#8b73c9", glyph: "♦", name: "Plum" },
  { color: "#38b2a3", glyph: "♣", name: "Teal" },
  { color: "#d873a6", glyph: "♠", name: "Rose" },
];

export const CREDIT = "Bulls & Cows — traditional; popularized as Mastermind (Mordecai Meirowitz, 1970)";

/** Full-viewport backdrop — sits AROUND the HudCanvas, never inside it. */
export const TABLE_FELT: CSSProperties = {
  background: "radial-gradient(130% 120% at 50% 0%, #3a2c22 0%, #241a13 52%, #150e09 100%)",
};

/** Walnut deck the rows are set into. */
export const DECK_STYLE: CSSProperties = {
  background: "linear-gradient(158deg, #5c4029 0%, #442d1c 46%, #35220f 100%)",
  border: "1px solid rgba(0,0,0,0.5)",
  boxShadow:
    "inset 0 1px 0 rgba(255,214,170,0.18), inset 0 -20px 44px rgba(0,0,0,0.45), 0 26px 64px rgba(0,0,0,0.55)",
};

/** Brass shield holding the secret code. */
export const SECRET_STYLE: CSSProperties = {
  background: "linear-gradient(150deg, #7a5a2b 0%, #5a4120 60%, #45311a 100%)",
  border: "1px solid rgba(30,20,8,0.7)",
  boxShadow: "inset 0 1px 0 rgba(255,232,180,0.35), inset 0 -3px 8px rgba(0,0,0,0.4)",
};

/** Recessed empty peg well in the deck. */
export const WELL_STYLE: CSSProperties = {
  background: "radial-gradient(circle at 50% 35%, #241708 0%, #130b04 72%)",
  boxShadow: "inset 0 2px 5px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,210,160,0.08)",
  border: "1px solid rgba(0,0,0,0.55)",
};

/** Brass plate the 2x2 key-peg cluster sits in. */
export const KEY_PLATE: CSSProperties = {
  background: "linear-gradient(145deg, #b98b3e 0%, #8a6528 55%, #6d4f20 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,235,190,0.4), inset 0 -2px 4px rgba(0,0,0,0.4)",
  border: "1px solid rgba(60,40,15,0.7)",
};

export function pegStyle(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.7) 0%, ${color} 40%, ${color} 62%, rgba(0,0,0,0.42) 100%)`,
    boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.4)",
    border: "1px solid rgba(0,0,0,0.32)",
  };
}

export function keyPegStyle(kind: "black" | "white" | "empty"): CSSProperties {
  if (kind === "black") {
    return {
      background: "radial-gradient(circle at 38% 30%, #6b6b72 0%, #17171b 66%)",
      boxShadow: "inset 0 -1px 1px rgba(0,0,0,0.6), 0 1px 1px rgba(0,0,0,0.5)",
      border: "1px solid rgba(0,0,0,0.6)",
    };
  }
  if (kind === "white") {
    return {
      background: "radial-gradient(circle at 38% 30%, #ffffff 0%, #e6ddc7 58%, #c9bfa4 100%)",
      boxShadow: "inset 0 -1px 1px rgba(120,100,60,0.4), 0 1px 1px rgba(0,0,0,0.35)",
      border: "1px solid rgba(120,95,50,0.5)",
    };
  }
  return {
    background: "radial-gradient(circle at 50% 40%, #5a4423 0%, #38290f 72%)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
    border: "1px solid rgba(40,28,12,0.6)",
  };
}

/** Component-owned keyframes — shipped inline so they work on the runner/shoot path. */
export const GAME_CSS = `
@keyframes cb-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
@keyframes cb-pop { 0%{transform:scale(0.68);opacity:0} 60%{transform:scale(1.07)} 100%{transform:scale(1);opacity:1} }
@keyframes cb-rise { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes cb-glow { 0%,100%{box-shadow:inset 0 1px 0 rgba(255,232,180,0.35), 0 0 0 rgba(231,197,58,0)} 50%{box-shadow:inset 0 1px 0 rgba(255,232,180,0.35), 0 0 22px rgba(231,197,58,0.7)} }
.cb-pop { animation: cb-pop 0.24s ease both; }
.cb-rise { animation: cb-rise 0.3s ease both; }
.cb-shake { animation: cb-shake 0.5s ease both; }
.cb-win { animation: cb-glow 1.5s ease-in-out infinite; }
`;
