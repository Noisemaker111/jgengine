import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { keybinds } from "./keybinds";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Platform Hopper",
  assets: createAssetCatalog(),
  world,
  physics,
  input: keybinds,
  server: { mode: "single" },
  save: "none",
  multiplayer: offline(),
});
