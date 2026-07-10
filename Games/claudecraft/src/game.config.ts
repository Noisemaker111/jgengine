import { defineGame } from "@jgengine/shell/defineGame";

import { assets, entitySprites } from "./game/assets";
import { content } from "./game/content";
import { inventories } from "./game/inventories";
import { keybinds } from "./game/keybinds";
import { npcPrompts } from "./game/world/setup";
import { GameUI } from "./game/ui/GameUI";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "World of ClaudeCraft",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  content,
  loop,
  GameUI,
  entitySprites,
  prompts: npcPrompts,
  worldHealthBars: true,
  camera: {
    perspective: "third",
    minDistance: 3.5,
    maxDistance: 16,
    targetHeight: 1.8,
    frustum: { far: 720 },
  },
});
