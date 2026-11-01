import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";
import { gameFontStacks } from "@jgengine/core/ui/fonts.view";

/** The art direction's looks, named once: the sky, the grade and the type the credits list. */
export const LOOKS_USED = { hdri: ["tropical-clouds"], lut: ["tropical-lush"], fonts: ["oswald", "source-sans-3"] } as const;

export const FERN_FONTS = libraryFontPairing("oswald", "source-sans-3");
const STACKS = gameFontStacks(FERN_FONTS);

/** Holo kit, shallows-teal accent, Oswald over Source Sans 3. */
export const fernwildKit = customizeKit(UI_KITS.holo, {
  name: "fernwild",
  tokens: { accent: "#3fd0c9", accentInk: "#062a2a", fontDisplay: STACKS.fontDisplay, fontBody: STACKS.fontBody },
});

export const lookCredits = (): ReturnType<typeof creditsForLooks> => creditsForLooks(LOOKS_USED);
