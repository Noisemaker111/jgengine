import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { CanopyEnvironment } from "./game/render";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Commit Canopy",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: CanopyEnvironment,
  shadows: true,
  camera: {
    rig: "orbit",
    followEntityId: null,
    frustum: { far: 400 },
    minDistance: 6,
    maxDistance: 30,
    initialDistance: 16,
    initialHeight: 9,
    targetHeight: 0.6,
    minPolarAngle: 0.15,
    maxPolarAngle: Math.PI / 2.3,
  },
});
