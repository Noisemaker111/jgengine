import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";

/** The art direction's looks, named once: the reflection sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["night-clear"], lut: [], fonts: ["fredoka", "nunito"] } as const;

/** Fredoka over Nunito: round, warm and readable at a glance. */
export const GAME_FONTS = libraryFontPairing("fredoka", "nunito");

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
