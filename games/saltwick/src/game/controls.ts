import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Walk"],
  ["Shift", "Run"],
  ["Mouse", "Look"],
  ["E", "Plant, harvest, sell, cast and reel, sleep, talk"],
  [`1-${Math.min(6, idea.crops.length)}`, "Pick the seed you plant"],
  ["1-6 at the market", "Buy seeds, a better rod, more land"],
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.hero, idea.home.model, idea.stall.model, idea.market.model, ...idea.villagers.map((villager) => villager.model), ...idea.animals, ...idea.scenery]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

/** What a day is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `Plant ${idea.crops[0]!.label.toLowerCase()} in the plots by your ${idea.home.label.toLowerCase()}; crops grow by the in-world clock.`,
  `Cast a line at the ${idea.water.label.toLowerCase()} and press E when the marker is in the green.`,
  `Sell what you grow and catch at the ${idea.stall.label.toLowerCase()}, then spend it at the ${idea.market.label.toLowerCase()} in ${idea.market.town}.`,
  `Sleep in the ${idea.home.label.toLowerCase()} to end the day: crops ripen overnight and the game saves.`,
  `Help the village with their requests until the festival.`,
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Characters, creatures and nature: KayKit (Kay Lousberg) and Quaternius, CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
