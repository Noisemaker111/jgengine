import { offline } from "@jgengine/core/runtime/adapter";
import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { DAY_LENGTH } from "./game/catalog";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, objectModels } from "./game/models";
import { LooplineWorldOverlay } from "./game/render/WorldOverlay";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Loopline",
  world,
  physics,
  assets,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  multiplayer: offline(),
  features: { unlocks: true },
  time: { scale: 1, dayLength: DAY_LENGTH, start: DAY_LENGTH * (9 / 24), speeds: [1, 2, 4] },
  content,
  loop,
  GameUI,
  entityModels,
  objectModels,
  WorldOverlay: LooplineWorldOverlay,
  worldHealthBars: false,
  pointer: { moveCommand: "park.pointer", secondaryCommand: "build.clear" },
  camera: {
    rig: "rts",
    followEntityId: null,
    frustum: { far: 1200 },
    rts: {
      start: { x: 0, z: 16 },
      height: 52,
      pitch: 0.86,
      yaw: Math.PI / 4,
      panSpeed: 55,
      edgeScroll: true,
      rotateSpeed: 1.1,
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      zoom: { min: 0.5, max: 2.4, speed: 1 },
    },
  },
});
