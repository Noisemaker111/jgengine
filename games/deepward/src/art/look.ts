import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

/** The art direction's looks, named once: the reflection sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["industrial-pipe-valve"], lut: ["cold-teal"], fonts: ["share-tech-mono", "rajdhani"] } as const;

/** Share Tech Mono over Rajdhani. Load with `useGameFonts(GAME_FONTS)`, style with `gameFontStacks(GAME_FONTS)`. */
export const GAME_FONTS = libraryFontPairing("share-tech-mono", "rajdhani");

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
