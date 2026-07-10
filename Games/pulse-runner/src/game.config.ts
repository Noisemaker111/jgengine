import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { renderPulseRunnerEntity, renderPulseRunnerObject } from "./game/world/render";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Pulse Runner",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop,
  GameUI,
  camera: {
    chase: {
      distance: 6.5,
      height: 3.2,
      lookHeight: 1.4,
      springDamping: 5.5,
      fov: { base: 60, max: 76, speedForMax: 12 },
      shakePerSpeed: 0.006,
    },
    frustum: { far: 220 },
  },
  renderEntity: renderPulseRunnerEntity,
  renderObject: renderPulseRunnerObject,
  shadows: false,
});
