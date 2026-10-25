import { gameFontStacks } from "@jgengine/react/gameFonts";
import { hudTheme } from "@jgengine/react/hudTheme";
import { GAME_FONTS } from "../../art/fonts/fonts";

const FONTS = gameFontStacks(GAME_FONTS);

/** Row Six pit chrome: gunmetal plates, hazard yellow, teal launch marks, stencilled numbers. */
export const driftTheme = hudTheme({
  palette: { accent: "#f2c230", accentDeep: "#b8901c", accentGlow: "#f2c23055", accentDim: "#f2c2301f" },
  surface: {
    surface: "#2c3134",
    surfaceDeep: "#1c2022",
    edge: "#6e777b60",
    edgeBright: "#8a9397",
    text: "#ece3cc",
    textDim: "#b9b4a6",
    backdrop: "#141617ef",
  },
  status: { danger: "#ff4934", warning: "#f2c230", success: "#5de0ce", friendly: "#5de0ce" },
  font: { display: FONTS.fontDisplay, body: FONTS.fontBody, numeric: FONTS.fontDisplay },
  frame: { bg: "#2c3134f2", border: "2px solid #0c0e0f", radius: "0px", glow: "none" },
  slot: { bg: "#1c2022", border: "1px solid #6e777b80", radius: "0px" },
  state: { focusRing: "0 0 0 3px #f2c230" },
});
