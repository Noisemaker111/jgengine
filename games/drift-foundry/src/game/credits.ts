import { creditsForLooks } from "@jgengine/assets/catalogs/looksCredits";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { ASSET_SOURCE_IDS } from "./assets";

/** The store's credits: its own art, then every asset pack the departments use. */
export const FOUNDRY_CREDITS = mergeCredits({
  title: "CLEANUP ON AISLE 9",
  sections: [
    {
      heading: "Original Cleanup on Aisle 9 art",
      entries: [
        { label: "Shopping carts, shoppers, cart mods, products and store fixtures", detail: "Original procedural geometry by JGengine Games contributors; source in drift-foundry/scripts/author-models.mjs." },
        { label: "Store brands", detail: "Every product and label is invented for this game; no real brands appear." },
      ],
    },
    {
      heading: "Built with",
      entries: [{ label: "JGengine", detail: "game SDK", href: "https://github.com/Noisemaker111/jgengine" }],
    },
  ],
  notice: "Every pack above is used under the license it is listed with.",
}, creditsForSourceIds(ASSET_SOURCE_IDS), { title: "CLEANUP ON AISLE 9", sections: creditsForLooks({ hdri: ["interior-industrial"], lut: ["vivid-pop"], fonts: ["lilita-one", "nunito"] }) });
