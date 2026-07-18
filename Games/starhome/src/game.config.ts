import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectModels } from "./game/models";
import { renderEntity } from "./game/render/renderEntity";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { DAY_LENGTH, physics, world } from "./world";

export const game = defineGame({
  name: "Starhome",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4] },
  content,
  loop,
  GameUI,
  assets,
  objectModels,
  renderEntity,
  pointer: { moveCommand: "world.pointer", select: true },
  touch: { buttons: [] },
  lighting: {
    ambient: { color: "#c3b0e0", intensity: 0.75 },
    hemisphere: { skyColor: "#c9a6e0", groundColor: "#4a3f66", intensity: 0.7 },
    directional: [{ color: "#ffe6b0", intensity: 1.35, position: [30, 48, 24], castShadow: true }],
  },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 5 },
      height: 19,
      pitch: 1.0,
      yaw: Math.PI / 4,
      panSpeed: 30,
      edgeScroll: true,
      rotateSpeed: 1.1,
      bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
      zoom: { min: 0.55, max: 2.2, speed: 1 },
    },
  },
});
