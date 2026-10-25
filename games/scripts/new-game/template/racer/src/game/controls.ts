import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W / Up", "Throttle"],
  ["S / Down", "Brake and reverse"],
  ["A D / Left Right", "Steer"],
  ["Space", "Handbrake"],
  ["Shift", "Nitro"],
  ["T", "Steering assist on / off"],
  ["Enter", "Start the race (garage)"],
  ...idea.upgrades.map((upgrade, index) => [String(index + 1), `Upgrade ${upgrade.label.toLowerCase()} (garage)`] as const),
  ["Esc / P", "Pause"],
];

/** What a career is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `${idea.races.length} races, each against a bigger, quicker field.`,
  `Finish in the top three to get paid; a win pays the most.`,
  `Spend it in the garage: ${idea.upgrades.map((upgrade) => upgrade.label.toLowerCase()).join(", ")}.`,
  `Stay on the road - the dirt costs you half your speed.`,
];

const libraryNames = [idea.car, ...idea.rivals, ...idea.scenery, idea.trackside].map((ref) => ref.model).filter((model) => !model.startsWith("/"));

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "City and cars: KayKit City Builder (Kay Lousberg), CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
