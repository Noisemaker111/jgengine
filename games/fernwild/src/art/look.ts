import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";

export const LOOKS_USED = { hdri: ["tropical-clouds"], lut: ["tropical-lush"], fonts: ["oswald", "source-sans-3"] } as const;

/** Oswald over Source Sans 3, registered with the native UI in `game/rune/kit.tsx`. */
export const FERN_FONTS = libraryFontPairing("oswald", "source-sans-3");

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
