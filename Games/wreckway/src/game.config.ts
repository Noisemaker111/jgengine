import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Wreckway",
  world,
  physics,
  input: keybinds,
  assets,
  content,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  GameUI,
  capture: {
    play: ["startRun"],
    probe: (ctx): Record<string, number> => {
      const car = ctx.scene.entity.get(ctx.player.userId);
      if (car === null) return {};
      return { x: car.position[0], y: car.position[1], z: car.position[2] };
    },
  },
  entityModels,
  objectModels,
  shadows: true,
  camera: {
    rig: "chase",
    chase: {
      distance: 8.5,
      height: 3.1,
      lookHeight: 1.1,
      springDamping: 5,
      fov: { base: 62, max: 82, speedForMax: 24 },
      shakePerSpeed: 0.01,
    },
    frustum: { far: 560 },
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "startRun"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Wreck the corridor run again from the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
