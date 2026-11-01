import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";

import { EMBER_FONTS, INK, PARCHMENT, WAX } from "./theme";

/** Ember Command's kit: the parchment language with wax red as its accent and the war table's two faces. */
export const emberKit = customizeKit(UI_KITS.parchment, {
  name: "Ember war table",
  tokens: {
    accent: WAX,
    accentInk: PARCHMENT,
    ink: INK,
    fontDisplay: EMBER_FONTS.fontDisplay,
    fontBody: EMBER_FONTS.fontBody,
  },
});
