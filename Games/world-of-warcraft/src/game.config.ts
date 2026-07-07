import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { assets } from "./assets";
import { inventories } from "./inventories";
import { keybinds } from "./keybinds";
import { physics, world } from "./world";

export const game = defineGame({
  name: "World of Warcraft",
  assets,
  world,
  physics,
  inventories,
  input: keybinds,
  server: "persistent",
  save: { auto: "5m", scope: "player+chunks" },
  multiplayer: offline(),
});
