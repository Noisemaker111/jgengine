import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./fonts/fonts";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["partly-cloudy"], lut: ["sunny-postcard"], fonts: [] } as const;

/** Lilita One for chunky diner-sign titles, Nunito for everything else: the stacks the site preview card sets. */
export const BEACON_FONTS = gameFontStacks(GAME_FONTS);

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
