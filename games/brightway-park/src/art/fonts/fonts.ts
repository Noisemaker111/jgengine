import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";

/** Lilita One for titles and numbers, Nunito for reading text: the shared library's OFL files. Load with `useGameFonts(GAME_FONTS)`, style with `gameFontStacks(GAME_FONTS)`. */
export const GAME_FONTS = libraryFontPairing("lilita-one", "nunito");
