import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { OBJECT_STYLES } from "./game/objects/styles";
import { GameUI } from "./game/ui/GameUI";
import { renderGlider } from "./game/world/gliderMesh";
import { renderCityProp } from "./game/world/propMesh";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Turbine City",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderGlider,
  renderObject: renderCityProp,
  objectStyles: OBJECT_STYLES,
  camera: {
    rig: "chase",
    frustum: { far: 900 },
    chase: {
      distance: 8.5,
      height: 2.4,
      lookHeight: 0.6,
      springDamping: 5,
      fov: { base: 62, max: 92, speedForMax: 30 },
      shakePerSpeed: 0.01,
    },
  },
});
