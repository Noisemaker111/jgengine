import type { EntityDiedEvent } from "@jgengine/core/game/events";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { registerCommands } from "./game/commands";
import { tickEnemies } from "./game/entities/enemies/ai";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { player } from "./game/entities/players/catalog";
import { itemUseHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { grantXp } from "./game/progression/curves";
import { session } from "./game/run/session";
import { PLAYER_SPAWN, setupWorld } from "./game/world/setup";

const LEVEL_HEALTH_BONUS = 6;
const LEVEL_HEAL = 25;

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.instanceId === ctx.player.userId) {
    session.noteDefeat(ctx);
    return;
  }
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  session.noteKill(ctx, event.catalogId);
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === ctx.player.userId) {
    grantXp(ctx, event.reason.killerUserId, enemy.xp);
  }
}

function onLevelUp(ctx: GameContext, userId: string, levelsGained: number): void {
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health === null) return;
  ctx.scene.entity.stats.set(userId, "health", {
    max: health.max + LEVEL_HEALTH_BONUS * levelsGained,
  });
  ctx.scene.entity.stats.delta(userId, "health", LEVEL_HEAL);
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  registerCommands(ctx);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("stat.levelUp", (event) => {
    if (event.stat === "level") onLevelUp(ctx, event.userId, 1);
  });

  setupWorld(ctx);
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(player.id, {
    id: ctx.player.userId,
    position: PLAYER_SPAWN,
    role: "player",
  });
  if (ctx.player.isNew) ctx.player.applyLoadout(ctx.player.userId, "starterKit");
}

function onTick(ctx: GameContext, dt: number): void {
  session.tick(ctx, dt);
  if (session.status() === "wave") tickEnemies(ctx, dt);
}

export const loop = { onInit, onNewPlayer, onTick };
