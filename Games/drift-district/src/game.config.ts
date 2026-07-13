import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { OBJECT_STYLES } from "./game/objects/styles";
import { GameUI } from "./game/ui/GameUI";
import { renderVehicle } from "./game/world/carMesh";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Drift District",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  capture: { play: ["confirm"] },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "confirm"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Reset the drift run from the start line.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
  renderEntity: renderVehicle,
  objectStyles: OBJECT_STYLES,
  camera: {
    rig: "chase",
    chase: {
      distance: 7.2,
      height: 2.6,
      lookHeight: 1,
      springDamping: 5.5,
      fov: { base: 64, max: 84, speedForMax: 28 },
      shakePerSpeed: 0.012,
    },
  },
});
