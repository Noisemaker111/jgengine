import { defineGame } from "@jgengine/shell/defineGame";
import { CORRIDOR_HALF_WIDTH, PARK_Z, SANCTUARY_Z } from "./game/constants";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderEntity } from "./game/render/renderEntity";
import { renderObject } from "./game/render/renderObject";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

const MOVE_MARGIN = 0.6;
const Z_OVERRUN = 8;

export const game = defineGame({
  name: "Neon Shepherd",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: {
    rig: "topDown",
    topDown: { height: 30, pitch: 1.3, yaw: 0, followSmoothing: 6 },
  },
  renderEntity,
  renderObject,
  movement: {
    collideObjects: false,
    beforeCommit(frame) {
      const [x, y, z] = frame.next;
      const clampedX = Math.min(CORRIDOR_HALF_WIDTH - MOVE_MARGIN, Math.max(-(CORRIDOR_HALF_WIDTH - MOVE_MARGIN), x));
      const clampedZ = Math.min(SANCTUARY_Z + Z_OVERRUN, Math.max(PARK_Z - Z_OVERRUN, z));
      if (clampedX === x && clampedZ === z) return undefined;
      return [clampedX, y, clampedZ];
    },
  },
});
