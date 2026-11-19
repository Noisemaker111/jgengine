import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

export const LOOKS_USED = { hdri: ["industrial-pipe-valve"], lut: ["cold-teal"], fonts: ["share-tech-mono", "rajdhani"] } as const;

export const GAME_FONTS = libraryFontPairing("share-tech-mono", "rajdhani");

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
