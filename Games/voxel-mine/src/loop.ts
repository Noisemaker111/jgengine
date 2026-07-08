import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createEditorHandlers } from "./handlers";
import { loadouts, STARTER } from "./loadouts";
import { registerSelectionCommands } from "./selection";
import { createVoxelGrid } from "./voxelGrid";
import { generateWorld } from "./worldgen";

export const EYE_HEIGHT = 1.6;
export const REACH = 6;

export const loop: Required<GameLoop<GameContext>> = {
  onInit(ctx) {
    const grid = createVoxelGrid(ctx);
    ctx.item.use.register(createEditorHandlers(grid, EYE_HEIGHT, REACH));
    ctx.player.loadout.register(loadouts);
    registerSelectionCommands(ctx);
    for (const placement of generateWorld()) {
      grid.set(placement.catalogId, placement.x, placement.y, placement.z);
    }
  },
  onNewPlayer(ctx) {
    ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [0, 0, 0] });
    ctx.player.applyLoadout(ctx.player.userId, STARTER);
  },
  onTick() {},
};
