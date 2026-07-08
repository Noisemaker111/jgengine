import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { flat } from "@jgengine/core/world/features";

import { keybinds } from "./keybinds";

export const game = defineGame({
  name: "Maze Muncher",
  assets: createAssetCatalog(),
  multiplayer: offline(),
  world: flat(),
  inventories: {},
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
});
