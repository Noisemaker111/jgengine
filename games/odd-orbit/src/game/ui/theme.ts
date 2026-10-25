import { gameFontStacks } from "@jgengine/react/gameFonts";
import { hudTheme } from "@jgengine/react/hudTheme";
import { GAME_FONTS } from "../../art/fonts/fonts";

const fonts = gameFontStacks(GAME_FONTS);

/** Odd Orbit's dusk-lilac habitat palette and its Comfortaa / Quicksand voice; the shell applies it at the HUD root. */
export const orbitTheme = hudTheme({
  palette: { accent: "#f6a6cf", accentDeep: "#914870", accentGlow: "#e690bf44", health: "#8edaba" },
  surface: { surface: "#342547", surfaceDeep: "#20172d", edge: "#765778", edgeBright: "#f5a8dc", text: "#fff0d5", textDim: "#c9b6ce", backdrop: "#1a1029de" },
  status: { warning: "#ffca81", danger: "#ff969b", success: "#8edaba", friendly: "#8edaba" },
  font: { display: fonts.fontDisplay, body: fonts.fontBody, numeric: fonts.fontNumeric },
  frame: { radius: "18px", bg: "#342547", border: "1px solid #765778", glow: "0 6px 18px #170d2866" },
});
