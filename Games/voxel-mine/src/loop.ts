import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createEditorHandlers } from "./game/handlers";
import { loadouts, STARTER } from "./game/loadouts";
import { quests, QUEST_PROSPECTING } from "./game/quests";
import { registerSelectionCommands } from "./game/selection";
import { createVoxelGrid } from "./game/voxelGrid";
import { generateWorld } from "./game/worldgen";

export const EYE_HEIGHT = 1.6;

function autoTurnInQuests(ctx: GameContext): void {
  ctx.game.events.on("quest.updated", (event) => {
    if (ctx.game.quest.canTurnIn(event.userId, event.questId) === null) {
      ctx.game.quest.turnIn(event.userId, event.questId);
    }
  });
}

/**
 * Mining now drops a physical item the player walks over to collect, so credit
 * flows through the world-item pickup rather than the break. Re-emit each pickup
 * as `inventory.added` — the event quests and the pickup feed already listen to.
 */
export function creditPickupsToQuests(ctx: GameContext): void {
  ctx.game.events.on("worldItem.picked_up", (event) => {
    ctx.game.events.emit("inventory.added", {
      userId: event.userId,
      item: event.itemId,
      count: event.count,
    });
  });
}

export const loop: Required<GameLoop<GameContext>> = {
  onInit(ctx) {
    const grid = createVoxelGrid(ctx);
    ctx.item.use.register(createEditorHandlers(grid, EYE_HEIGHT));
    ctx.player.loadout.register(loadouts);
    registerSelectionCommands(ctx);
    ctx.game.quest.register(quests);
    ctx.game.quest.bind("inventory.added");
    ctx.game.feed.bind("inventory.added");
    ctx.game.feed.bind("quest.completed");
    creditPickupsToQuests(ctx);
    autoTurnInQuests(ctx);
    for (const placement of generateWorld()) {
      grid.set(placement.catalogId, placement.x, placement.y, placement.z);
    }
  },
  onNewPlayer(ctx) {
    ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: [0, 0, 0] });
    ctx.player.applyLoadout(ctx.player.userId, STARTER);
    ctx.game.quest.accept(ctx.player.userId, QUEST_PROSPECTING);
  },
  onTick() {},
};
