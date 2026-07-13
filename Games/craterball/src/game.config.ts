import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { BALL_ENTITY_ID } from "./game/world/setup";
import { beforeCommit } from "./game/world/playerMovement";
import { Environment } from "./game/world/Environment";
import { renderEntity } from "./game/world/renderEntity";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Craterball",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  capture: { play: ["start"] },
  settings: {
    variant: "sheet",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart match",
        kind: "danger",
        description: "Reset the court and start a fresh match.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
  environment: Environment,
  renderEntity,
  camera: {
    rig: "topDown",
    followEntityId: BALL_ENTITY_ID,
    topDown: {
      height: 42,
      pitch: 1.12,
      yaw: 0,
      followSmoothing: 1.6,
      zoom: { min: 0.85, max: 1.25, speed: 0.5 },
    },
    frustum: { fov: 52, far: 260 },
  },
  pointer: { moveCommand: "throwCharge" },
  movement: { beforeCommit },
  shadows: true,
});
