import { createElement } from "react";

import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectStyles } from "./game/objects/catalog";
import { GameUI } from "./game/ui/GameUI";
import { BotMesh } from "./game/world/BotMesh";
import { CourseOverlay } from "./game/world/CourseOverlay";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Magnet Run",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  GameUI,
  capture: { play: ["startRun"] },
  camera: {
    rig: "chase",
    chase: {
      distance: 7.5,
      springDamping: 6,
      fov: { base: 64, max: 80, speedForMax: 18 },
      shakePerSpeed: 0.015,
      view: "chase",
    },
  },
  objectStyles,
  renderEntity: () => createElement(BotMesh),
  WorldOverlay: CourseOverlay,
  settings: {
    variant: "sheet",
    hideBindings: ["restartSector", "startRun"],
    actions: [
      {
        id: "restartSector",
        label: "Restart sector",
        kind: "danger",
        description: "Jump back to the start of the current sector.",
        run: (ctx) => ctx.game.commands.run("restartSector", {}),
      },
      {
        id: "startRun",
        label: "Start / continue run",
        description: "Begin the run or continue past the current screen.",
        run: (ctx) => ctx.game.commands.run("startRun", {}),
      },
    ],
  },
});
