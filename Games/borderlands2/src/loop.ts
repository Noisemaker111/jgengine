import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { registerCommands } from "./game/commands";
import { tickEnemies } from "./game/entities/enemies/ai";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { player } from "./game/entities/players/catalog";
import {
  enterDowned,
  ffylExpired,
  ffylPhase,
  finishReloads,
  markRespawned,
  rollGun,
  secondWind,
  tickDots,
  tickShields,
} from "./game/handroll";
import { itemUseHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { grantXp, REGEN_PER_QUICKCHARGE_POINT } from "./game/progression/curves";
import { quests } from "./game/quests/catalog";
import { session } from "./game/session";
import { NEW_U_STATION } from "./game/world/sites";
import { PLAYER_SPAWN, respawnClusters, setupWorld } from "./game/world/setup";

const dropRng = seededRng("bl2-gun-drops");
const RESPAWN_SWEEP_SECONDS = 20;
const DOWNED_WALK_SPEED = 1.6;

function dropGunAt(ctx: GameContext, event: EntityDiedEvent): void {
  const def = enemyById(event.catalogId);
  if (def === undefined || dropRng() >= def.gunDropChance) return;
  const level = ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
  const gun = rollGun(dropRng, Math.max(1, level + Math.floor(dropRng() * 2) - 1), { luck: def.gunLuck });
  const dead = ctx.scene.entity.get(event.instanceId);
  const anchor = dead?.position ?? ctx.scene.entity.get(ctx.player.userId)?.position ?? PLAYER_SPAWN;
  ctx.scene.worldItem.spawn({
    itemId: gun.id,
    position: [anchor[0] + (dropRng() - 0.5) * 2, anchor[1], anchor[2] + (dropRng() - 0.5) * 2],
    rarity: gun.rarity,
    baseType: gun.family,
    source: "kill",
  });
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  const userId = ctx.player.userId;
  if (event.instanceId === userId) return;
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === userId) {
    grantXp(ctx, userId, enemy.xp);
    dropGunAt(ctx, event);
    if (ffylPhase() === "downed") {
      secondWind(ctx);
      ctx.scene.entity.update(userId, { movement: { walkSpeed: player.walkSpeed } });
      ctx.scene.entity.floatText({ instanceId: userId, text: "SECOND WIND!", kind: "pickup" });
    }
    if (enemy.id === "captain_flynt") ctx.game.store.set("flyntDown", true);
  }
}

function onLevelUp(ctx: GameContext, userId: string): void {
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    ctx.scene.entity.stats.set(userId, "health", { max: health.max + 8 });
    ctx.scene.entity.stats.delta(userId, "health", health.max + 8);
  }
  ctx.scene.entity.stats.delta(userId, "skillPoints", 1);
  ctx.scene.entity.floatText({ instanceId: userId, text: "LEVEL UP! +1 SKILL POINT", kind: "pickup" });
}

function respawnAtNewU(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const cash = ctx.game.economy.balance(userId, "cash");
  const fee = Math.floor(cash * 0.07);
  if (fee > 0) ctx.game.economy.charge(userId, "cash", fee);
  const y = ctx.world.groundHeightAt(NEW_U_STATION[0], NEW_U_STATION[2]);
  ctx.scene.entity.update(userId, {
    position: [NEW_U_STATION[0], y, NEW_U_STATION[2]],
    movement: { walkSpeed: player.walkSpeed },
  });
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) ctx.scene.entity.stats.delta(userId, "health", health.max);
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", shield.max);
  markRespawned(ctx);
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: fee > 0 ? `RECONSTRUCTED — $${fee} FEE` : "RECONSTRUCTED",
    kind: "warn",
  });
}

function tickFfyl(ctx: GameContext, nowMs: number): void {
  const userId = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health === null) return;
  if (ffylPhase() === "up" && health.current <= (health.min ?? 1)) {
    enterDowned(ctx, nowMs);
    ctx.scene.entity.update(userId, { movement: { walkSpeed: DOWNED_WALK_SPEED } });
  }
  if (ffylExpired(nowMs)) respawnAtNewU(ctx);
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest.register(quests);
  ctx.game.quest.bind("entity.died");
  registerCommands(ctx);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("stat.levelUp", (event) => {
    if (event.stat === "level") onLevelUp(ctx, event.userId);
  });
  ctx.game.events.on("quest.completed", (event) => {
    ctx.game.quest.turnIn(event.userId, event.questId);
    const reward = quests.find((quest) => quest.id === event.questId)?.rewards;
    if (reward?.xp !== undefined) grantXp(ctx, event.userId, reward.xp.amount);
    ctx.scene.entity.floatText({ instanceId: event.userId, text: "MISSION COMPLETE", kind: "pickup" });
  });

  setupWorld(ctx);
  ctx.time.every(RESPAWN_SWEEP_SECONDS, () => respawnClusters(ctx));
}

function onNewPlayer(ctx: GameContext): void {
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn(player.id, {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    role: "player",
  });
  if (ctx.player.isNew) ctx.player.applyLoadout(ctx.player.userId, "starterKit");
  for (const quest of quests) ctx.game.quest.accept(ctx.player.userId, quest.id);
  session.reset(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  const nowMs = ctx.time.now() * 1000;
  const quickcharge = ctx.scene.entity.stats.get(ctx.player.userId, "skill_quickcharge")?.current ?? 0;
  tickEnemies(ctx, dt);
  tickShields(ctx, nowMs, dt, 1 + quickcharge * REGEN_PER_QUICKCHARGE_POINT);
  tickDots(ctx, nowMs);
  finishReloads(ctx, nowMs);
  tickFfyl(ctx, nowMs);
}

export const loop = { onInit, onNewPlayer, onTick };
