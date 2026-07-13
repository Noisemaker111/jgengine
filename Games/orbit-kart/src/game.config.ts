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
  capture: { play: ["startRace"] },
  environment: OrbitEnvironment,
  WorldOverlay: TrajectoryOverlay,
  renderEntity: renderKart,
  camera: {
    rig: "topDown",
    followEntityId: CAMERA_ANCHOR_ID,
    topDown: { height: 52, pitch: 1.08, yaw: 0, followSmoothing: 7 },
    frustum: { far: 900 },
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "startRace"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Send every kart back to the starting orbit and begin again.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
