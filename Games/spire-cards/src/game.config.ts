import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";

import { keybinds } from "./keybinds";

export const game = defineGame({
  name: "Spire Cards",
  assets: createAssetCatalog(),
  input: keybinds,
  server: "persistent",
  save: "none",
  multiplayer: offline(),
});
