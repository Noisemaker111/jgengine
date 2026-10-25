import { gameFontStacks } from "@jgengine/react/gameFonts";
import { hudTheme } from "@jgengine/react/hudTheme";

import { GAME_FONTS } from "../../art/fonts/fonts";

/** The bundled faces: IM Fell English SC for the hand that writes orders, Alegreya for the body. */
export const EMBER_FONTS = gameFontStacks(GAME_FONTS);

/** The war table's colours: iron-gall ink, sealing wax, brass, campaign parchment, and the two sides' inks. */
export const INK = "#2b1d10";
export const INK_DIM = "#5e4630";
export const WAX = "#8e1f17";
export const BRASS = "#c99a4a";
export const PARCHMENT = "#efe3c6";
export const VANGUARD_INK = "#2d5b8c";
export const MARAUDER_INK = "#a3291c";

/** Ember Command's field-desk palette; the shell applies it at the HUD root (notices, engine blocks). */
export const emberTheme = hudTheme({
  palette: { accent: "#c99a4a", accentDeep: "#8a6528", accentGlow: "#e8c27a55", accentDim: "#c99a4a22" },
  surface: { surface: "#efe3c6f2", surfaceDeep: "#e3d3ae", edge: "#5e463088", edgeBright: "#2b1d10", text: "#2b1d10", textDim: "#5e4630", backdrop: "#1a120ae0" },
  status: { warning: "#b0741c", danger: "#a3291c", success: "#3f6f2a", hostile: "#a3291c", friendly: "#2d5b8c" },
  font: { display: EMBER_FONTS.fontDisplay, body: EMBER_FONTS.fontBody, numeric: EMBER_FONTS.fontNumeric },
  frame: { bg: "linear-gradient(180deg, #f3e8cd, #e2cfa6)", border: "1px solid #5e463088", radius: "2px", glow: "0 6px 18px #0007" },
});
