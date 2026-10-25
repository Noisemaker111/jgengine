import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

const relics = idea.landmarks.flatMap((landmark) => (landmark.relic === undefined ? [] : [landmark.relic]));
const final = idea.landmarks.find((landmark) => landmark.role === "final");

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D", "Walk"],
  ["Shift", "Run (uses stamina)"],
  ["Space", "Jump - with the right relic, jump again in the air, or hold to glide"],
  ["Mouse", "Look"],
  ["Left click / F", "Strike"],
  ["E", "Take a relic, use the goal"],
  ["T", "Fast travel to the next place you have found"],
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.hero, idea.pedestal, idea.goal.model, ...idea.scenery, ...idea.landmarks.flatMap((landmark) => [landmark.centerpiece, ...landmark.ruins])]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `Walk to the landmarks on the compass. Reaching one puts it on your map and opens it for fast travel.`,
  `${relics.length} relics wait at the old places: ${relics.map((relic) => relic.label).join(", ")}. Each one lets you do something new.`,
  `Guardians keep most of them. Strike them down before you take what they guard.`,
  `With every relic, go to ${final?.label ?? "the last place"} and ${idea.goal.verb.toLowerCase()} ${idea.goal.label}.`,
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Characters, creatures and ruins: KayKit (Kay Lousberg) and Quaternius, CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
