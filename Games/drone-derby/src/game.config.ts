import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { renderDrone } from "./game/world/droneMesh";
import { renderObject } from "./game/world/renderObject";
import { onInit, onNewPlayer, onTick } from "./loop";
import { world } from "./world";

export const game = defineGame({
  capture: { play: ["start"] },
  name: "Drone Derby",
  assets,
  world,
  content,
  input: keybinds,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "sheet",
  },
  renderEntity: renderDrone,
  renderObject,
  camera: {
    rig: "chase",
    chase: {
      distance: 6,
      height: 2.2,
      lookHeight: 0.6,
      springDamping: 6,
      fov: { base: 70, max: 94, speedForMax: 30 },
      shakePerSpeed: 0.018,
      view: "chase",
    },
  },
});
