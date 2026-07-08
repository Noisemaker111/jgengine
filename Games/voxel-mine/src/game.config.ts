import { defineGame } from "@jgengine/shell/defineGame";
import { convex } from "@jgengine/core/runtime/adapter";

import { EYE_HEIGHT, loop } from "./loop";
import { physics, world } from "./world";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { Environment } from "./game/Environment";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { getSelectedSlot } from "./game/selection";
import { GameUI } from "./game/ui/GameUI";

export const game = defineGame({
  name: "Voxel Mine",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "creative" },
  multiplayer: convex({ topology: "shared" }),
  content,
  loop,
  GameUI,
  environment: Environment,
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: EYE_HEIGHT, reticle: true, viewmodel: false },
  },
  hotbarSelection: getSelectedSlot,
  collision: { voxel: true },
  worldItem: { autoPickup: true, pickupRadius: 1.8 },
  touch: {
    hidden: Object.keys(keybinds).filter((action) => action.startsWith("selectSlot")),
  },
});
