import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";

import type { CommanderPreferences } from "../preferences";

/** IM Fell English SC for the hand that writes orders, Alegreya for the body, both from the font library. */
export const GAME_FONTS = libraryFontPairing("im-fell-english-sc", "alegreya");
export const DISPLAY = GAME_FONTS.display.family;
export const BODY = GAME_FONTS.body.family;

/** The war table's colours: iron-gall ink, sealing wax, brass, campaign parchment, and the two sides' inks. */
export const INK = "#2b1d10";
export const INK_DIM = "#5e4630";
export const WAX = "#8e1f17";
export const BRASS = "#c99a4a";
export const GILT = "#e8c27a";
export const PARCHMENT = "#efe3c6";
export const VANGUARD_INK = "#2d5b8c";
export const MARAUDER_INK = "#a3291c";
export const OCHRE = "#b0741c";
export const MOSS = "#3f7a2c";
export const LEATHER = "#4a2c19";
export const WOOD = "#5b3b22";
export const STONE = "#3b3530";

type Look = Pick<CommanderPreferences, "largeText" | "highContrast" | "reducedMotion">;

/**
 * Ember Command's one Rune theme: parchment sheets, leather and wood frames, stone command tokens and
 * wax-red actions. The commander's field preferences shape it: larger text scales every named style,
 * high contrast inks the sheets solid and darkens the ink, reduced motion stills every transition.
 */
export function emberTheme(look: Look) {
  const k = look.largeText ? 1.18 : 1;
  const ink = look.highContrast ? "#140b04" : INK;
  const dim = look.highContrast ? "#2b1d10" : INK_DIM;
  const paper = look.highContrast ? "#fbf3df" : "#efe3c6f5";
  return {
    colors: { ink, dim, wax: WAX, brass: BRASS, gilt: GILT, paper: PARCHMENT, vanguard: VANGUARD_INK, marauder: MARAUDER_INK, track: "#00000022" },
    text: {
      body: { family: BODY, size: Math.round(15 * k), color: ink },
      small: { family: BODY, size: Math.round(13 * k), color: dim },
      eyebrow: { family: DISPLAY, size: Math.round(12 * k), tracking: 1.4, color: look.highContrast ? "#5a0d07" : WAX },
      title: { family: DISPLAY, size: Math.round(28 * k), color: ink },
      wordmark: { family: DISPLAY, size: Math.round(54 * k), color: ink, tracking: 1 },
      verb: { family: DISPLAY, size: Math.round(19 * k), color: ink },
      number: { family: BODY, size: Math.round(16 * k), weight: 700, color: ink },
      token: { family: BODY, size: Math.round(11 * k), weight: 700, color: GILT },
      gilt: { family: DISPLAY, size: Math.round(14 * k), color: GILT },
    },
    variants: {
      sheet: { padding: 18, gap: 8, fill: paper, border: { width: look.highContrast ? 2 : 1, color: look.highContrast ? ink : "#5e463088" }, radius: 2, shadow: { y: 6, blur: 18, color: "#00000066" } },
      note: { padding: [10, 12, 10, 12], gap: 5, fill: look.highContrast ? "#fbf3df" : "#efe3c6ee", border: { width: 1, color: "#5e463066" }, radius: 1, shadow: { y: 3, blur: 8, color: "#0000004d" } },
      leather: { padding: 9, gap: 6, fill: LEATHER, border: { width: 2, color: "#2a170b" }, radius: 6, shadow: { y: 5, blur: 14, color: "#00000080" } },
      wood: { padding: [9, 9, 8, 9], gap: 6, fill: WOOD, border: { width: 2, color: "#2f1d0f" }, radius: 4, shadow: { y: 5, blur: 14, color: "#00000080" } },
      seal: { minHeight: 42, padding: [10, 22, 10, 22], fill: WAX, border: { width: 2, color: "#3a0b06" }, radius: 3, hover: "#ffffff22", press: "#00000033", items: "center", justify: "center" },
      plank: { minHeight: 38, padding: [8, 16, 8, 16], fill: "#7a5230", border: { width: 1, color: "#3a2412" }, radius: 3, hover: "#ffffff1a", press: "#00000033", items: "center", justify: "center" },
      verb: { minHeight: 34, padding: [5, 10, 5, 10], radius: 2, hover: "#8e1f171a", press: "#8e1f1733", items: "center", gap: 10 },
      token: { width: 52, height: 52, fill: STONE, border: { width: 1, color: "#1a1612" }, radius: 5, hover: "#ffffff1a", press: "#00000040", items: "center", justify: "center" },
    },
    motion: { duration: look.reducedMotion ? 0 : 160, distance: look.reducedMotion ? 0 : 10, bounce: 0 },
  } satisfies RuneTheme;
}

export type EmberTheme = ReturnType<typeof emberTheme>;
