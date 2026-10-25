import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { ASSET_SOURCE_IDS } from "./assets";

/** Scrap Signal's own work, then every pack it ships, generated from the ids its catalogs load. */
export const SCRAP_CREDITS = mergeCredits(
  {
    title: "SCRAP SIGNAL",
    sections: [
      {
        heading: "Original Scrap Signal work",
        entries: [
          {
            label: "Ferralon and the carrier",
            detail: "Game rules, reclaimers, relay contracts, broadcast UI and art direction; source in scrap-signal/src.",
          },
        ],
      },
      {
        heading: "Built with",
        entries: [
          { label: "JGengine", detail: "game SDK", href: "https://github.com/Noisemaker111/jgengine" },
          { label: "React", detail: "MIT" },
          { label: "Three.js", detail: "MIT" },
        ],
      },
    ],
    notice: "Every model and material pack above is CC0 and used under the license it is listed with.",
  },
  creditsForSourceIds(ASSET_SOURCE_IDS),
);
