import { defineGame } from "@jgengine/shell/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { flat } from "@jgengine/core/world/features";

import { entityCatalog } from "./game/catalog";
import { keybinds } from "./game/keybinds";
import { onInit, onNewPlayer, onTick } from "./loop";
import { MazeEnvironment, PelletOverlay, renderMazeEntity } from "./game/render/world";
import { GameUI } from "./game/ui/GameUI";

export const game = defineGame({
  name: "Maze Muncher",
  assets: createAssetCatalog(),
  world: flat(),
  inventories: {},
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content: {
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: MazeEnvironment,
  WorldOverlay: PelletOverlay,
  renderEntity: renderMazeEntity,
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 26, pitch: 0, yaw: 0 },
  },
});
