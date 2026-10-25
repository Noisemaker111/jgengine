import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D / arrows", "Pan the view"],
  ["Q / E", "Turn the view"],
  ["Mouse wheel", "Zoom"],
  ...idea.buildings.map((building, index) => [index < 9 ? String(index + 1) : "-", `Pick up ${building.label.toLowerCase()} to place`] as const),
  ["Left click", "Place what you hold / look at a building"],
  ["Right click", "Put it down / clear"],
  ["U", "Upgrade the building you look at"],
  ["Delete / X", "Demolish it"],
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.seat.model, ...idea.buildings.map((building) => building.model), ...idea.people.walkers, ...idea.scenery]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

const [food] = idea.resources;
const crown = idea.buildings.find((building) => building.role === "crown");

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `Build homes so ${idea.people.label.toLowerCase()} move in; every building needs hands to work it.`,
  `${idea.people.label} eat ${food?.label.toLowerCase() ?? "food"}. Run out and work stops.`,
  `Grow from ${idea.tiers.map((tier) => tier.label.toLowerCase()).join(" to ")}; each tier unlocks new buildings.`,
  ...(crown === undefined ? [] : [`Raise the ${crown.label.toLowerCase()} to finish the story.`]),
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Buildings and props: Quaternius and KayKit (Kay Lousberg), CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
