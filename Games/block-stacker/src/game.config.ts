import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";

import { assets } from "./assets";
import { keybinds } from "./keybinds";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Block Stacker",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  multiplayer: offline(),
});
