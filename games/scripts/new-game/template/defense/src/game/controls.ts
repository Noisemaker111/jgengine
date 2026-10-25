import { libraryModelCredits } from "@jgengine/assets/catalogs/modelLibrary";

import { idea } from "./idea";

/** Keys, as the Controls pane lists them; the bindings themselves live in `game.config.ts`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ["W A S D / arrows", "Pan the view"],
  ["Q / E", "Turn the view"],
  ["Mouse wheel", "Zoom"],
  ...idea.towers.map((tower, index) => [index < 9 ? String(index + 1) : "-", `Pick up ${tower.label.toLowerCase()} to build`] as const),
  ["Left click", "Build on the nearest empty pad / look at a tower"],
  ["Right click", "Put it down / clear"],
  ["N / Space", `Send the next ${idea.wave.toLowerCase()} now (pays for the time left)`],
  ["U", "Upgrade the tower you look at"],
  ["Delete / X", "Sell it"],
  ["Esc / P", "Pause"],
];

const libraryNames = [idea.core.model, idea.pad, ...idea.towers.map((tower) => tower.model), ...idea.creeps.map((creep) => creep.model), ...idea.scenery]
  .map((ref) => ref.model)
  .filter((model) => !model.startsWith("/"));

/** What a run is, in the order you meet it: the title screen's briefing. */
export const BRIEFING: readonly string[] = [
  `${idea.foe} march down the lanes at ${idea.core.label.toLowerCase()}; every one that reaches it costs lives.`,
  "Build towers on the pads beside the lanes. Kills pay for more.",
  `Upgrade towers between ${idea.wave.toLowerCase()}s; call the next one early for extra ${idea.coin.label.toLowerCase()}.`,
  `Hold ${idea.waves} ${idea.wave.toLowerCase()}s to win.`,
];

export const CREDITS: readonly string[] = [
  `${idea.name} - made with JGengine.`,
  "Towers, props and creatures: Quaternius and KayKit (Kay Lousberg), CC0.",
  ...libraryModelCredits([...new Set(libraryNames)]),
];
