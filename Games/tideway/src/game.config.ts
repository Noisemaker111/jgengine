import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderTidewayEntity, renderTidewayObject } from "./game/render/renderers";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Tideway",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: {
    rig: "chase",
    chase: {
      distance: 7.5,
      height: 2.1,
      lookHeight: 0.9,
      springDamping: 5.5,
      fov: { base: 60, max: 76, speedForMax: 20 },
      shakePerSpeed: 0.01,
      view: "chase",
    },
  },
  renderEntity: renderTidewayEntity,
  renderObject: renderTidewayObject,
});
