import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

import { GAME_FONTS } from "../../art/fonts/fonts";

/** The art direction's sky and grade, named once; the credits list them. */
export const LOOKS_USED = { hdri: ["lilac-dusk"], lut: ["pastel-dusk"] } as const;

const STACKS = gameFontStacks(GAME_FONTS);

/** Signal enamel plates, bubblegum accent, Comfortaa over Quicksand. */
export const orbitKit = customizeKit(UI_KITS.signal, {
  name: "odd-orbit",
  tokens: { accent: "#f6a6cf", accentInk: "#3a2140", fontDisplay: STACKS.fontDisplay, fontBody: STACKS.fontBody },
});

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
