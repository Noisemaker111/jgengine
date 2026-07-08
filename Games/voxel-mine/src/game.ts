import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./assets";
import { inventories } from "./inventories";
import { keybinds } from "./keybinds";
import { loop } from "./loop";
import { GameUI } from "./ui/GameUI";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Voxel Mine",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: { mode: "creative" },
  multiplayer: offline(),
  ui: GameUI,
  loop,
});
