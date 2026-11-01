import { gameFontStacks } from "@jgengine/core/ui/fonts.view";
import { hudTheme } from "@jgengine/core/hud/hudTheme.view";

import { GAME_FONTS } from "../../art/fonts/fonts";

const FONTS = gameFontStacks(GAME_FONTS);

/** Brightway's seaside midway: deep teal-glass boards, ribbon gold, cream type, soft rounded corners. */
export const parkTheme = hudTheme({
  palette: { accent: "#edbc5c", accentDeep: "#c9973f", accentGlow: "#edbc5c55", accentDim: "#edbc5c1f" },
  surface: {
    surface: "#24444c",
    surfaceDeep: "#24444c",
    edge: "#91b2aa66",
    edgeBright: "#91b2aa",
    text: "#fff1cf",
    textDim: "#b4c8bf",
    backdrop: "#14323870",
  },
  status: { success: "#a1e3bb", danger: "#a64f44", warning: "#edbc5c", friendly: "#a1e3bb" },
  font: { display: FONTS.fontDisplay, body: FONTS.fontBody, numeric: FONTS.fontDisplay },
  frame: { bg: "rgba(28,57,64,.94)", border: "1px solid #91b2aa66", radius: "16px", glow: "0 8px 28px #152c3540" },
  slot: { bg: "#366169", border: "1px solid #91b2aa66", radius: "10px" },
  state: { hover: "rgba(255,241,207,0.08)", focusRing: "0 0 0 3px #fff1cf" },
});
