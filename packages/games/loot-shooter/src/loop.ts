import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { itemUseHandlers } from "./items/use-handlers";
import { loadouts } from "./loadouts";
import { lootTables } from "./entities/enemies/loot-tables";
import { enemyById } from "./entities/enemies/catalog";
import { player } from "./entities/players/catalog";
import { grantXp } from "./progression/curves";
import { PLAYER_SPAWN, setupWorld } from "./world/setup";
import { downed, publishHud, ring, ringHudAt } from "./session/raid";

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (event.instanceId === ctx.player.userId) return;
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === ctx.player.userId) {
    grantXp(ctx, event.reason.killerUserId, enemy.xp);
  }
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));

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
  const now = ctx.time.now();
  const self = ctx.scene.entity.get(ctx.player.userId);
  const groundPos: [number, number] = self === null ? [0, 0] : [self.position[0], self.position[2]];
  publishHud({ ring: ringHudAt(now, groundPos) });

  for (const hit of ring.damageOutside(now, dt, [{ id: ctx.player.userId, position: groundPos }])) {
    ctx.scene.entity.stats.delta(hit.id, "health", -hit.damage);
  }

  downed.tick(dt);
}

export const loop = { onInit, onNewPlayer, onTick };
