import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { CREATURE_MODEL_SOURCES, type CreatureModelSource } from "./data/creatureModels";
import { SURVIVOR_MODELS } from "./models";
import { itemIconCredits } from "./ui/itemIcons";

/** One credit line per author and licence of the creature models, naming each model. */
function creatureCredits(): string[] {
  const byAuthor = new Map<string, string[]>();
  for (const source of Object.values(CREATURE_MODEL_SOURCES) as CreatureModelSource[]) {
    const key = `${source.author}, ${source.license}`;
    const titles = byAuthor.get(key) ?? [];
    if (!titles.includes(source.title)) titles.push(source.title);
    byAuthor.set(key, titles);
  }
  return [...byAuthor].map(([key, titles]) => `Creature models (${titles.join(", ")}): ${key} via poly.pizza.`);
}

/** Keys, as the Controls pane lists them; the bindings live in `game.config.ts`. ARK's PC layout. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Move"],
  ["Shift", "Run (costs stamina; your mount's when riding)"],
  ["Space", "Jump"],
  ["Mouse", "Look"],
  ["Left click", "Punch, chop or mine with what is in hand"],
  ["E", "Pick bushes and stones, drink; open a downed or tamed creature, ride, get off"],
  ["T / U", "Whistle your tames to follow / stay"],
  ["I", "Inventory, crafting, stats and engrams"],
  ["V", "First / third person"],
  ["1 - 0", "Equip a hotbar tool or eat hotbar food"],
  ["Esc", "Pause"],
];

/** The title screen's briefing, in the order a fresh survivor meets it. */
export const BRIEFING: readonly string[] = [
  "You wake on a beach with nothing.",
  "Punch trees for thatch and wood, pick bushes for fiber and berries, gather stones from the ground.",
  "Craft a stone pick, level up, and spend engram points on new recipes.",
  "Club a creature unconscious, put its food in its inventory, and it is yours. Saddle it to ride.",
  "Eat and drink before hunger and thirst take your health.",
];

export const CREDITS: readonly string[] = [
  "Fernwild — made with JGengine.",
  "A love letter to ARK: Survival Evolved's systems. Not affiliated with Studio Wildcard.",
  "Nature models: Quaternius (Stylized Nature MegaKit), CC0.",
  ...creatureCredits(),
  ...libraryModelCredits(SURVIVOR_MODELS),
  ...itemIconCredits(),
];
