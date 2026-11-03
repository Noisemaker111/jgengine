import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./fonts/fonts";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["highland-clouds"], lut: ["warm-filmic"], fonts: [] } as const;

const STACKS = gameFontStacks(GAME_FONTS);

/** Parchment kit, beacon-ember accent, Cinzel over Alegreya Sans. */
export const beaconKit = customizeKit(UI_KITS.parchment, {
  name: "beacon-bastion",
  tokens: { accent: "#d9541e", accentInk: "#fff4e0", fontDisplay: STACKS.fontDisplay, fontBody: STACKS.fontBody },
});

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
