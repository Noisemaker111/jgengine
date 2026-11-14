import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";

import type { CommanderPreferences } from "../preferences";

/** Lilita One for the chunky seed-packet headings, Nunito for the body, both from the font library. */
export const GAME_FONTS = libraryFontPairing("lilita-one", "nunito");
export const DISPLAY = GAME_FONTS.display.family;
export const BODY = GAME_FONTS.body.family;

/** The garden journal's colours: leaf-green ink, red-ant action, honey, sunflower, seed-packet cream,
 * the two colonies' inks, and the leaf, soil and moss the frames are cut from. */
export const INK = "#1f2a12";
export const INK_DIM = "#4c5a2c";
export const WAX = "#d9361f";
export const BRASS = "#e0a020";
export const GILT = "#ffe066";
export const PARCHMENT = "#fff6d6";
export const RED_INK = "#d42a1c";
export const RIVAL_INK = "#4b3a66";
export const OCHRE = "#e08a1e";
export const MOSS = "#4caf3a";
export const LEATHER = "#3f7a24";
export const WOOD = "#6b4424";
export const STONE = "#2b4a1a";

type Look = Pick<CommanderPreferences, "largeText" | "highContrast" | "reducedMotion">;

/**
 * LAWN ORDER's one Rune theme: seed-packet cream sheets, leaf and soil frames, moss command tokens and
 * red-ant actions. The commander's field preferences shape it: larger text scales every named style,
 * high contrast inks the sheets solid and darkens the ink, reduced motion stills every transition.
 */
export function lawnTheme(look: Look) {
  const k = look.largeText ? 1.18 : 1;
  const ink = look.highContrast ? "#0b1205" : INK;
  const dim = look.highContrast ? "#1f2a12" : INK_DIM;
  const paper = look.highContrast ? "#fffbea" : "#fff6d6f2";
  return {
    colors: { ink, dim, wax: WAX, brass: BRASS, gilt: GILT, paper: PARCHMENT, colony: RED_INK, rival: RIVAL_INK, track: "#00000022" },
    text: {
      body: { family: BODY, size: Math.round(15 * k), color: ink },
      small: { family: BODY, size: Math.round(13 * k), color: dim },
      eyebrow: { family: DISPLAY, size: Math.round(12 * k), tracking: 1.4, color: look.highContrast ? "#7a1408" : WAX },
      title: { family: DISPLAY, size: Math.round(28 * k), color: ink },
      wordmark: { family: DISPLAY, size: Math.round(54 * k), color: ink, tracking: 1 },
      verb: { family: DISPLAY, size: Math.round(19 * k), color: ink },
      number: { family: BODY, size: Math.round(16 * k), weight: 700, color: ink },
      token: { family: BODY, size: Math.round(11 * k), weight: 700, color: GILT },
      gilt: { family: DISPLAY, size: Math.round(14 * k), color: GILT },
    },
    variants: {
      sheet: { padding: 18, gap: 8, fill: paper, border: { width: look.highContrast ? 2 : 2, color: look.highContrast ? ink : "#3f7a24aa" }, radius: 14, shadow: { y: 6, blur: 18, color: "#00000055" } },
      note: { padding: [10, 12, 10, 12], gap: 5, fill: look.highContrast ? "#fffbea" : "#fff6d6ee", border: { width: 2, color: "#3f7a2477" }, radius: 12, shadow: { y: 3, blur: 8, color: "#00000040" } },
      leather: { padding: 9, gap: 6, fill: LEATHER, border: { width: 3, color: "#24480f" }, radius: 16, shadow: { y: 5, blur: 14, color: "#00000066" } },
      wood: { padding: [9, 9, 8, 9], gap: 6, fill: WOOD, border: { width: 3, color: "#3a230f" }, radius: 14, shadow: { y: 5, blur: 14, color: "#00000066" } },
      seal: { minHeight: 42, padding: [10, 22, 10, 22], fill: WAX, border: { width: 2, color: "#6a120a" }, radius: 21, hover: "#ffffff22", press: "#00000033", items: "center", justify: "center" },
      plank: { minHeight: 38, padding: [8, 16, 8, 16], fill: "#6b4424", border: { width: 2, color: "#3a230f" }, radius: 19, hover: "#ffffff1a", press: "#00000033", items: "center", justify: "center" },
      verb: { minHeight: 34, padding: [5, 10, 5, 10], radius: 10, hover: "#d9361f1a", press: "#d9361f33", items: "center", gap: 10 },
      token: { width: 52, height: 52, fill: STONE, border: { width: 2, color: "#16290c" }, radius: 12, hover: "#ffffff1a", press: "#00000040", items: "center", justify: "center" },
    },
    motion: { duration: look.reducedMotion ? 0 : 160, distance: look.reducedMotion ? 0 : 10, bounce: 0 },
  } satisfies RuneTheme;
}

export type LawnTheme = ReturnType<typeof lawnTheme>;
