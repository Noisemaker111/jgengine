import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { renderVehicle } from "./game/world/carMesh";
import { TrackEnvironment } from "./game/world/environment";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { world } from "./world";

export const game = defineGame({
  name: "Speed Circuit",
  assets,
  world,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: TrackEnvironment,
  renderEntity: renderVehicle,
  camera: {
    rig: "chase",
    chase: {
      distance: 7.5,
      height: 2.8,
      lookHeight: 1.1,
      springDamping: 5.5,
      fov: { base: 62, max: 80, speedForMax: 26 },
      shakePerSpeed: 0.01,
    },
  },
  settings: {
    variant: "sheet",
  },
});
