import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./fonts/fonts";

export const LOOKS_USED = { hdri: ["highland-clouds"], lut: ["warm-filmic"], fonts: [] } as const;

export const BEACON_FONTS = gameFontStacks(GAME_FONTS);

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
