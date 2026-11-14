import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { lookCredits } from "../art/look";
import { ASSET_SOURCE_IDS } from "./assets";

/** The game's own work, then every pack it actually ships - both derived, neither retyped by hand. */
const AUTHORED = {
  title: "DO NOT DISTURB",
  sections: [
    {
      heading: "Original Do Not Disturb work",
      entries: [
        {
          label: "Workers, technology, town and voice lines",
          detail: "Authored tower-defense rules, distraction, wave manifest, procedural tech meshes and the diner HUD; source in beacon-bastion/src.",
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
  notice: "Fonts: Lilita One (Juan Montoreano) and Nunito (Vernon Adams, Jacques Le Bailly), SIL OFL 1.1. Every model pack above is used under the license it is listed with.",
};

export const BEACON_CREDITS = mergeCredits(
  AUTHORED,
  creditsForSourceIds(ASSET_SOURCE_IDS),
  { title: "DO NOT DISTURB", sections: lookCredits() },
);
