import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

const people = idea.colonists.label.toLowerCase();

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D / arrows", "Pan the view"],
  ["Q / E", "Turn the view"],
  ["Mouse wheel", "Zoom"],
  ["Left click / drag", `Select ${people}`],
  ["F", `Select all your ${people}`],
  ["Right click", "Send the selected: a node to gather, a raider to fight, ground to walk"],
  ["G", "Send the selected (or the idle) to the nearest node"],
  ...idea.structures.map((structure, index) => [index < 9 ? String(index + 1) : "-", `Pick up ${structure.label.toLowerCase()}, right click to place`] as const),
  ["Esc / P", "Pause"],
];

const libraryNames = [
  idea.hq.model,
  ...idea.colonists.models,
  ...idea.nodes.map((node) => node.model),
  ...idea.structures.map((structure) => structure.model),
  ...idea.raiders.kinds.map((raider) => raider.model),
  ...idea.scenery,
]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

const [food] = idea.resources;
const crown = idea.structures.find((structure) => structure.role === "crown");

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `A few ${people} and the ${idea.hq.label.toLowerCase()}. Select them and right click a node to gather.`,
  `They eat ${food!.label.toLowerCase()}; farms grow more. Houses bring new ${people}.`,
  `${idea.raiders.label} come every few minutes. Fight them off and build towers.`,
  `Build the ${crown?.label ?? "last building"} to win.`,
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Characters, buildings and props: Quaternius and KayKit (Kay Lousberg), CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
