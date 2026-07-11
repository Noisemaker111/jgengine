import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { PROP_OBJECT_STYLES } from "./game/objects/catalog";
import { TideOcean } from "./game/render/TideOcean";
import { prompts } from "./game/run/session";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Courier Zero",
  world,
  physics,
  input: keybinds,
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "panel",
    hideBindings: ["restartRun", "toggleMap"],
    actions: [
      {
        id: "restartRun",
        label: "Restart run",
        kind: "danger",
        description: "Wash the delivery route away and start the tide clock over.",
        run: (ctx) => ctx.game.commands.run("restartRun", {}),
      },
      {
        id: "toggleMap",
        label: "Toggle flood map",
        description: "Show or hide the tide and route overlay.",
        run: (ctx) => ctx.game.commands.run("toggleMap", {}),
      },
    ],
  },
  prompts,
  WorldOverlay: TideOcean,
  objectStyles: PROP_OBJECT_STYLES,
  worldHealthBars: false,
  camera: {
    rig: "orbit",
    initialDistance: 17,
    targetHeight: 2.6,
    minPolarAngle: 0.4,
    maxPolarAngle: 1.05,
    rotateSpeed: 0.9,
    zoomSpeed: 0.9,
    frustum: { far: 420 },
  },
});
