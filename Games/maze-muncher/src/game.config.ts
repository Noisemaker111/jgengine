import { defineGame } from "@jgengine/shell/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { flat } from "@jgengine/core/world/features";

import { entityCatalog } from "./game/catalog";
import { keybinds } from "./game/keybinds";
import { collideSlide } from "./game/maze";
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
    entityById: entityCatalog,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: MazeEnvironment,
  WorldOverlay: PelletOverlay,
  renderEntity: renderMazeEntity,
  shadows: false,
  backdrop: { background: "#03030a" },
  lighting: { ambient: { color: "#242036", intensity: 0.16 } },
  movement: {
    beforeCommit: ({ current, next }) => {
      const [x, z] = collideSlide(current[0], current[2], next[0], next[2]);
      return [x, next[1], z] as [number, number, number];
    },
  },
  camera: {
    rig: "first",
    frustum: { fov: 74, far: 60 },
    firstPerson: { eyeHeight: 1.3, sensitivity: 0.0022, reticle: true, viewmodel: false },
  },
  settings: {
    variant: "fullscreen",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart maze",
        kind: "danger",
        description: "Descend from level one with fresh lives.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
