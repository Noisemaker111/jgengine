import { sky } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { renderCourier } from "./game/environment/renderEntity";
import { SkyhookEnvironment } from "./game/environment/SkyhookEnvironment";
import { SkyhookWorldOverlay } from "./game/environment/SkyhookWorldOverlay";
import { keybinds } from "./game/keybinds";
import { beforeCommit } from "./game/runtime/movement";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Skyhook Rally",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  capture: { play: ["startRun"] },
  environment: SkyhookEnvironment,
  WorldOverlay: SkyhookWorldOverlay,
  renderEntity: renderCourier,
  movement: { beforeCommit },
  backdrop: {
    sky: sky({ preset: "day", horizonColor: "#f7c59f", zenithColor: "#8fd0e0", sunIntensity: 1.15, ambientIntensity: 0.8 }),
  },
  camera: {
    rig: "chase",
    chase: {
      distance: 9.5,
      height: 4.2,
      lookHeight: 1.6,
      springDamping: 4.5,
      fov: { base: 64, max: 98, speedForMax: 26 },
      shakePerSpeed: 0.006,
    },
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restartCourse"],
    actions: [
      {
        id: "restartCourse",
        label: "Restart course",
        kind: "danger",
        description: "Restart the current course from the first checkpoint.",
        run: (ctx) => ctx.game.commands.run("restartCourse", {}),
      },
      {
        id: "returnToMenu",
        label: "Return to menu",
        description: "Exit back to the course-select menu.",
        run: (ctx) => ctx.game.commands.run("returnToMenu", {}),
      },
    ],
  },
});
