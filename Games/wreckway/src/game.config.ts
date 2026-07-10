import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { renderProp } from "./game/world/propMesh";
import { renderVehicle } from "./game/world/kartMesh";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Wreckway",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderVehicle,
  renderObject: renderProp,
  shadows: true,
  camera: {
    rig: "chase",
    chase: {
      distance: 8.5,
      height: 3.1,
      lookHeight: 1.1,
      springDamping: 5,
      fov: { base: 62, max: 82, speedForMax: 24 },
      shakePerSpeed: 0.01,
    },
    frustum: { far: 560 },
  },
});
