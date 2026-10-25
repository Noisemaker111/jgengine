import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Move"],
  ["Shift", "Run"],
  ["Mouse", "Look"],
  ["Left click / F", "Strike"],
  ["E", "Gather, tame, repair, upgrade"],
  ...idea.structures.map((structure, index) => [String(index + 1), `Build ${structure.label.toLowerCase()} in front of you`] as const),
  ["N", `Call the next ${idea.wave.toLowerCase()} early for a bonus`],
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.home.model, idea.hero, ...idea.nodes.map((node) => node.prop), ...idea.structures.map((structure) => structure.prop), ...idea.scenery]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `${idea.nodes.map((node) => node.verb).filter((verb, index, all) => all.indexOf(verb) === index).join(", ")} for ${idea.resources.map((resource) => resource.label.toLowerCase()).join(" and ")}.`,
  `Build ${idea.structures.map((structure) => structure.label.toLowerCase()).join(", ")} around the ${idea.home.label.toLowerCase()}.`,
  ...(idea.allies.length === 0 ? [] : [`${idea.allies[0]!.verb} a ${idea.allies[0]!.label.toLowerCase()} and it fights for you.`]),
  `Every ${idea.wave.toLowerCase()} is bigger than the last. Hold ${idea.winAt} and you win.`,
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Characters and creatures: KayKit (Kay Lousberg) and Quaternius, CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
