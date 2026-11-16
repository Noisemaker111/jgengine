import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { GameUI } from "./tour-hud";
import { gatherLoop } from "./tour-loop";

// One call wires it up. Binding walk keys gives the player a walk controller;
// the world, camera, menus, saves and the scene editor (F2+E) come with it.
export const game = defineGame({
  name: "Tide Runner",
  rendering: { look: "cinematic", mood: "golden" },
  input: { ...DEFAULT_WALK_CODES, interact: ["KeyE"] },
  systems: [gatherLoop],
  GameUI,
});
