import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { OrbitEnvironment } from "./game/world/OrbitEnvironment";
import { TrajectoryOverlay } from "./game/world/TrajectoryOverlay";
import { renderKart } from "./game/world/karts";
import { CAMERA_ANCHOR_ID } from "./game/constants";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Orbit Kart",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: OrbitEnvironment,
  WorldOverlay: TrajectoryOverlay,
  renderEntity: renderKart,
  camera: {
    rig: "topDown",
    followEntityId: CAMERA_ANCHOR_ID,
    topDown: { height: 52, pitch: 1.08, yaw: 0, followSmoothing: 7 },
    frustum: { far: 900 },
  },
});
