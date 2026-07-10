import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { renderProp } from "./game/world/propMesh";
import { renderSled } from "./game/world/sledMesh";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Frostbite Circuit",
  world,
  physics,
  assets,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderSled,
  renderObject: renderProp,
  camera: {
    rig: "chase",
    chase: {
      distance: 7.6,
      height: 2.8,
      lookHeight: 1,
      springDamping: 5.2,
      fov: { base: 62, max: 82, speedForMax: 24 },
      shakePerSpeed: 0.01,
    },
  },
});
