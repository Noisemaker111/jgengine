import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { DAY_LENGTH } from "./game/calendar";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderAnnalsEntity } from "./game/render/caravan";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "The Annals",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  time: { scale: 60, dayLength: DAY_LENGTH, speeds: [1, 2, 4, 8] },
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderAnnalsEntity,
  pointer: { moveCommand: "annals.focus" },
  camera: {
    rig: "rts",
    rts: {
      start: { x: 0, z: 40 },
      height: 260,
      pitch: 0.95,
      yaw: Math.PI / 4,
      panSpeed: 90,
      edgeScroll: true,
      rotateSpeed: 1.2,
      bounds: { minX: -420, maxX: 420, minZ: -420, maxZ: 420 },
      zoom: { min: 0.4, max: 2.2, speed: 1 },
    },
  },
});
