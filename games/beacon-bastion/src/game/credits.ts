import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";

import { ASSET_SOURCE_IDS } from "./assets";

/** The keep's own work, then every pack it actually ships - both derived, neither retyped by hand. */
const AUTHORED = {
  title: "BEACON BASTION",
  sections: [
    {
      heading: "Original Beacon Bastion work",
      entries: [
        {
          label: "Keep, towers, raiders and beacon",
          detail: "Authored tower-defense rules, wave manifest, field-kit HUD and the keep's palette; source in beacon-bastion/src.",
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
  notice: "Every model pack above is used under the license it is listed with.",
};

export const BEACON_CREDITS = mergeCredits(AUTHORED, creditsForSourceIds(ASSET_SOURCE_IDS));
