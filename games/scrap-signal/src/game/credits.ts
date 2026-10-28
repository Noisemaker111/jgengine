import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { ASSET_SOURCE_IDS } from "./assets";
import { CAST_LIBRARY_MODELS } from "./world/models";

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
        heading: "Cast and their tools",
        entries: libraryModelCredits(CAST_LIBRARY_MODELS).map((label) => ({ label })),
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
    notice: "Every model and material above is used under the license it is listed with.",
  },
  creditsForSourceIds(ASSET_SOURCE_IDS),
);
