import { defineGame } from "@jgengine/shell/defineGame";
import { convex } from "@jgengine/core/runtime/adapter";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import {
  EYE_HEIGHT,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_STEP,
} from "./game/tuning";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Mine Drop",
  assets,
  entitySprites,
  world,
  physics,
  input: keybinds,
  server: { mode: "coop" },
  save: "none",
  multiplayer: convex({ topology: "shared" }),
  content,
  loop,
  GameUI,
  collision: {
    voxel: true,
    halfWidth: PLAYER_HALF_WIDTH,
    height: PLAYER_HEIGHT,
    stepHeight: PLAYER_STEP,
  },
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: EYE_HEIGHT, sensitivity: 0.0026, reticle: true, viewmodel: false },
  },
});
