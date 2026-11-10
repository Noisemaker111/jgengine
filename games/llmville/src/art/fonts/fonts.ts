import type { GameFontFace } from "@jgengine/core/ui/fonts.view";

/**
 * LLMville's bundled fonts (OFL 1.1; see the OFL files and SOURCE.md beside them): Baloo 2 for titles
 * and numbers, Nunito for reading text. Variable files, so one file covers every weight the kit asks
 * for. Load with `loadGameFonts(GAME_FONTS)`; the kit's font stacks name the same families.
 */
export const GAME_FONTS: readonly GameFontFace[] = [
  { family: "Baloo 2", src: new URL("./Baloo2-VF.ttf", import.meta.url).href, weight: "400 800" },
  { family: "Nunito", src: new URL("./Nunito-VF.ttf", import.meta.url).href, weight: "200 1000" },
  { family: "Nunito", src: new URL("./Nunito-Italic-VF.ttf", import.meta.url).href, weight: "200 1000", style: "italic" },
];
