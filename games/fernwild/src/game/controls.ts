import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";
import { creditsForSourceIds } from "@jgengine/assets/credits";

import type { CreditsDocument, CreditsEntry } from "@jgengine/core/menu/credits";
import { mergeCredits } from "@jgengine/core/menu/credits";

import { lookCredits } from "../art/look";
import { BODY_SOURCE_IDS } from "./assets";
import { TOOL_MODELS } from "./models";
import { itemIconCredits } from "./data/itemIcons";

/** Keys, as the Controls pane lists them; the bindings live in `game.config.ts`. ARK's PC layout. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Move"],
  ["Shift", "Run (costs stamina; your mount's when riding)"],
  ["Space", "Jump"],
  ["Mouse", "Look"],
  ["Left click", "Punch, chop or mine with what is in hand"],
  ["E", "Pick bushes and stones, drink; open a downed or uploaded bot, ride, get off"],
  ["T / U", "Whistle your bots to follow / stay"],
  ["I", "Inventory, crafting, stats and schematics"],
  ["V", "First / third person"],
  ["H", "Show the numbers under the vital icons"],
  ["1 - 0", "Equip a hotbar tool or eat hotbar food"],
  ["Esc", "Pause"],
];

/** The title screen's briefing, in the order a fresh survivor meets it. */
export const BRIEFING: readonly string[] = [
  "A century ago the colony was abandoned with its fabricators running. The machines kept printing, repairing and rewriting each other.",
  "You wash up on the south beach, a lone technician with a multitool and a pocket of fuses.",
  "Punch trees for thatch and wood, pick bushes for fiber and berries, gather stones; craft tools and spend schematic points.",
  "Drain a bot with a club or EMP arrows until it shuts down, then jack in: feed it firmware or biogel while the upload holds. Rig it to ride.",
  "Eat and drink before hunger and thirst take your health, and park your bots under a roof on Signal Storm nights.",
];

const creditLines = (): CreditsEntry[] =>
  [
    "Wildwire: robot-taming survival on a feral machine island. Inspired by the creature-survival genre.",
    "Robots: built in code from the engine body-plan builder. Nature models: Quaternius (Stylized Nature MegaKit), CC0.",
    "Cloth texture: ambientCG (Fabric 007), CC0.",
    ...libraryModelCredits(TOOL_MODELS),
    ...itemIconCredits(),
  ].map((label) => ({ label }));

export const CREDITS: CreditsDocument = mergeCredits(
  { sections: [{ heading: "Wildwire", entries: [{ label: "Wildwire — made with JGengine." }] }, { heading: "Models and icons", entries: creditLines() }] },
  creditsForSourceIds(BODY_SOURCE_IDS),
  { sections: lookCredits() },
);
