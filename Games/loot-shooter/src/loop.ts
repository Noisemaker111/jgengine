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

const ELEMENTS = ["fire", "frost", "lightning", "poison"];

let telegraphTimer = 0;
let numberTimer = 0;

function otherEntities(ctx: GameContext) {
  return ctx.scene.entity.list().filter((entity) => entity.id !== ctx.player.userId);
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

  telegraphTimer += dt;
  numberTimer += dt;
  const enemies = otherEntities(ctx);
  if (enemies.length === 0) return;

  if (telegraphTimer >= 1.2) {
    telegraphTimer = 0;
    for (const enemy of enemies) {
      ctx.scene.entity.telegraph({
        from: enemy.id,
        shape: { kind: "circle", radius: 2.4 },
        at: [enemy.position[0], enemy.position[1], enemy.position[2]],
        windupMs: 1600,
        kind: "danger",
      });
    }
  }

  if (numberTimer >= 0.5) {
    numberTimer = 0;
    const enemy = enemies[Math.floor(Math.random() * enemies.length)];
    const roll = Math.random();
    ctx.scene.entity.floatText({
      instanceId: enemy.id,
      text: String(120 + Math.floor(Math.random() * 480)),
      kind: "damage",
      crit: roll > 0.65,
      ...(roll > 0.4 ? { element: ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)] } : {}),
    });
  }
}

export const loop = { onInit, onNewPlayer, onTick };
