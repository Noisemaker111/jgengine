import { defineGame } from "@jgengine/shell/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Loot Shooter",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "ffa" },
  save: "none",
  multiplayer: offline(),
  content,
  loop,
  GameUI,
  worldHealthBars: true,
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.6, sensitivity: 0.0025, reticle: true, viewmodel: true },
  },
});
