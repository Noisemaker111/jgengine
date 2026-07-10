import { createElement } from "react";

import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectStyles } from "./game/objects/catalog";
import { GameUI } from "./game/ui/GameUI";
import { BotMesh } from "./game/world/BotMesh";
import { CourseOverlay } from "./game/world/CourseOverlay";
import { onInit, onNewPlayer, onTick } from "./loop";
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
  GameUI,
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
});
