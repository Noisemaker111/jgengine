import { gameFontStacks } from "@jgengine/react/gameFonts";
import { hudTheme } from "@jgengine/react/hudTheme";
import { GAME_FONTS } from "../../art/fonts/fonts";
import { FERRALON } from "../palette";

const fonts = gameFontStacks(GAME_FONTS);

/** Reclaimer field kit: soot-black carbon housings, phosphor tubes, hazard-amber trim; Russo One over Chakra Petch. */
export const scrapTheme = hudTheme({
  palette: { accent: FERRALON.hudAmber, accentDeep: "#8a5a00", accentGlow: "#ffb40055", accentDim: "#ffb40022", health: FERRALON.hudRed, shield: FERRALON.hudShield, xp: FERRALON.hudXp },
  surface: { surface: FERRALON.hudPanel, surfaceDeep: "#0c0a09", edge: "#57534e", edgeBright: "#fbbf24", text: "#f5f5f4", textDim: "#a8a29e", backdrop: "#000000a8" },
  status: { danger: FERRALON.hudRed, warning: FERRALON.hudAmber, success: FERRALON.hudXp, hostile: FERRALON.hudRed, friendly: "#72dfdf", neutral: "#d6d3d1" },
  font: { display: fonts.fontDisplay, body: fonts.fontBody, numeric: fonts.fontNumeric },
  frame: { bg: "#0c0a09f2", border: "2px solid #f59e0bcc", radius: "0px", glow: "0 8px 40px rgba(0,0,0,0.9)" },
  slot: { bg: "#1c1917cc", border: "1px solid #44403c", radius: "0px" },
});
