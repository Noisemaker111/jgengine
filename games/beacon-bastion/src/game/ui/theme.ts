import { gameFontStacks } from "@jgengine/react/gameFonts";
import { HUD_THEME_PRESETS, type HudTheme } from "@jgengine/react/hudTheme";

import { GAME_FONTS } from "../../art/fonts/fonts";

/** Cinzel for carved titles and numbers, Alegreya Sans for the little reading there is. */
export const BEACON_FONTS = gameFontStacks(GAME_FONTS);

const base = HUD_THEME_PRESETS.fieldkit;

/**
 * Beacon Bastion's HUD theme: the field-kit structure re-lit by the beacon - fire amber accent,
 * soot-dark timber surfaces, parchment text - and the game's own fonts. The engine's notices,
 * touch buttons and settings rows read these tokens, so they sit in the same world as the game's
 * carved and timbered pieces.
 */
export const beaconTheme: HudTheme = {
  ...base,
  palette: {
    ...base.palette,
    accent: "#f2ad4a",
    accentGlow: "rgba(255, 160, 60, 0.45)",
    accentDeep: "#7a4a16",
  },
  surface: {
    ...base.surface,
    surface: "#1f1813",
    surfaceDeep: "#120d09",
    edge: "#4c3b28",
    edgeBright: "#8d6c40",
    text: "#f4ead2",
    textDim: "#c2b08c",
  },
  font: { display: BEACON_FONTS.fontDisplay, body: BEACON_FONTS.fontBody, numeric: BEACON_FONTS.fontNumeric },
};

/** The beacon's fire, for glows and the cursor. */
export const FIRE = "#ffb347";
