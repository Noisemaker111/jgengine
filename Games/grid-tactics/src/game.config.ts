import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { BattleOverlay, GridEnvironment, renderUnit } from "./game/world/render";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Grid Tactics",
  assets,
  world,
  physics,
  inventories: {},
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: GridEnvironment,
  WorldOverlay: BattleOverlay,
  renderEntity: renderUnit,
  worldHealthBars: true,
  pointer: { moveCommand: "battle.boardClick" },
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 15, pitch: 1.02, yaw: 0, followSmoothing: 8 },
  },
  settings: {
    variant: "sidebar",
  },
});
