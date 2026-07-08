import { defineGame } from "@jgengine/shell/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { entityById } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

const SIDE_VIEW_ENTITY = "dev-player";

export const game = defineGame({
  name: "Platform Hopper",
  assets: createAssetCatalog(),
  world,
  physics,
  input: keybinds,
  server: { mode: "single" },
  save: "none",
  content: { entityById },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: {
    rig: "observer",
    observer: {
      bind: { kind: "entity", entityId: SIDE_VIEW_ENTITY },
      orbitSpeed: 0,
      startAngle: Math.PI,
      distance: 15,
      height: 3,
      lookHeight: 1.1,
    },
    transitionSeconds: 0,
  },
  worldHealthBars: false,
});
