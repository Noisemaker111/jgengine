import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderCityObject } from "./game/render/Buildings";
import { MonumentEnvironment } from "./game/render/Environment";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const DAY_LENGTH = 54;

export const game = defineGame({
  name: "Monument",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (15 / 24), speeds: [1, 3, 8] },
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: MonumentEnvironment,
  renderObject: renderCityObject,
  pointer: { moveCommand: "site.pointer" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 2600 },
    rts: {
      start: { x: 0, z: 30 },
      height: 190,
      pitch: 0.94,
      yaw: Math.PI / 4,
      panSpeed: 80,
      edgeScroll: true,
      rotateSpeed: 1.2,
      bounds: { minX: -260, maxX: 260, minZ: -260, maxZ: 260 },
      zoom: { min: 0.3, max: 2.4, speed: 1 },
    },
  },
});
