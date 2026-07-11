import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderTowerGuardEntity } from "./game/render/entityMeshes";
import { GameUI } from "./game/ui/GameUI";
import { TowerGuardWorldOverlay } from "./game/world/WorldOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Tower Guard",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "defense" },
  content,
  loop,
  GameUI,
  settings: {
    variant: "panel",
  },
  renderEntity: renderTowerGuardEntity,
  WorldOverlay: TowerGuardWorldOverlay,
  worldHealthBars: { statId: "health" },
  pointer: { moveCommand: "tower.build" },
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 34, pitch: 1.05, yaw: Math.PI / 4, zoom: { min: 0.6, max: 1.8 } },
  },
});
