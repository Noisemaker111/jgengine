import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { lookCredits } from "../art/look";
import { ASSET_SOURCE_IDS } from "./assets";

/** Junk Drawer's own work, then every pack it ships, generated from the ids its catalogs load. */
export const SCRAP_CREDITS = mergeCredits(
  {
    title: "JUNK DRAWER",
    sections: [
      {
        heading: "Original Junk Drawer work",
        entries: [
          {
            label: "Maple Hollow and its talking junk",
            detail: "Game rules, weapon personalities and their lines, procedural junk and appliance models, UI and art direction; source in scrap-signal/src.",
          },
        ],
      },
      {
        heading: "Built with",
        entries: [
          { label: "JGengine", detail: "game SDK", href: "https://github.com/Noisemaker111/jgengine" },
          { label: "Rune", detail: "MIT" },
          { label: "Three.js", detail: "MIT" },
        ],
      },
    ],
    notice: "Every model and material above is used under the license it is listed with.",
  },
  creditsForSourceIds(ASSET_SOURCE_IDS),
  { title: "JUNK DRAWER", sections: lookCredits() },
);
