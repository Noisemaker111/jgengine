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
  settings: {
    variant: "sidebar",
  },
  environment: CanopyEnvironment,
  shadows: true,
  camera: {
    frustum: { far: 400 },
    inspection: {
      target: { x: 0, y: 0.6, z: 0 },
      initialPosition: { x: 0, y: 9, z: -16 },
      initialDistance: 16,
      minDistance: 6,
      maxDistance: 30,
      minPolarAngle: 0.15,
      maxPolarAngle: Math.PI / 2.3,
      pan: true,
      rotateSpeed: 0.35,
      zoomSpeed: 0.5,
      anchor: "cursor",
    },
  },
});
