import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { TrackEnvironment } from "./game/environment/TrackEnvironment";
import { keybinds } from "./game/keybinds";
import { OBJECT_BASE_COLORS } from "./game/objects/catalog";
import { renderRunnerEntity } from "./game/render/renderEntity";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Loop Station",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: TrackEnvironment,
  renderEntity: renderRunnerEntity,
  objectStyles: Object.fromEntries(Object.entries(OBJECT_BASE_COLORS).map(([id, color]) => [id, { color }])),
  camera: {
    rig: "chase",
    chase: {
      distance: 8,
      height: 3.2,
      lookHeight: 1.2,
      springDamping: 5,
      fov: { base: 62, max: 82, speedForMax: 9 },
      shakePerSpeed: 0.02,
    },
  },
  devtools: true,
});
