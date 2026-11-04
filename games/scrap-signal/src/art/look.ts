import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { broadcastKit } from "@jgengine/core/ui/kit/uiKitBroadcast.view";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "./fonts/fonts";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["desert-noon"], lut: ["sun-bleached-comic"], fonts: [] } as const;

const STACKS = gameFontStacks(GAME_FONTS);

/** Broadcast kit, signal red-orange accent, Russo One over Chakra Petch. */
export const scrapKit = customizeKit(broadcastKit, {
  name: "scrap-signal",
  tokens: { accent: "#ff5a2e", accentInk: "#1a1410", fontDisplay: STACKS.fontDisplay, fontBody: STACKS.fontBody },
});

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
