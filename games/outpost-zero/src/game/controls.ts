import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Move"],
  ["Shift", "Run"],
  ["Mouse", "Aim"],
  ["Left click", "Fire"],
  ["Right click", "Aim down sights"],
  ["R", "Reload"],
  ...idea.guns.map((gun, index) => [String(index + 1), gun.price === 0 ? gun.label : `${gun.label} (unlock: ${gun.price} ${idea.currency.label.toLowerCase()})`] as const),
  ...idea.upgrades.map((upgrade, index) => [String(idea.guns.length + index + 1), `Upgrade ${upgrade.label.toLowerCase()}`] as const),
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.hero, idea.base.model, ...idea.enemies.map((enemy) => enemy.model), ...idea.cover, ...idea.scenery]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `${idea.foe} hold ${idea.outposts.length} outposts around ${idea.base.label}.`,
  `Clear each one: every guard pays, and the last one down pays the outpost.`,
  `Spend ${idea.currency.label.toLowerCase()} on ${idea.guns.slice(1).map((gun) => gun.label.toLowerCase()).join(", ")} and ${idea.upgrades.map((upgrade) => upgrade.label.toLowerCase()).join(" and ")}.`,
  "Go down and you are back at the last save.",
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Models: Quaternius and KayKit (Kay Lousberg), CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
