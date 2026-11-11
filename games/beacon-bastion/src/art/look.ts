import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./fonts/fonts";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["highland-clouds"], lut: ["warm-filmic"], fonts: [] } as const;

/** Cinzel for carved titles, Alegreya Sans for numbers: the stacks the site preview card sets. */
export const BEACON_FONTS = gameFontStacks(GAME_FONTS);

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
