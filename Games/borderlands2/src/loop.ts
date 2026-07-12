import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { registerCommands } from "./game/commands";
import { tickEnemies } from "./game/entities/enemies/ai";
import { enemyById, levelXpFor } from "./game/entities/enemies/catalog";
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
import { MAIN_QUEST_IDS, QUEST_IDS, quests } from "./game/quests/catalog";
import { session } from "./game/session";
import { TRAVEL_STATIONS, zoneAt, zoneLevelAt } from "./game/world/sites";
import { PLAYER_SPAWN, respawnClusters, setupWorld } from "./game/world/setup";

const dropRng = seededRng("bl2-gun-drops");
const RESPAWN_SWEEP_SECONDS = 25;
const DOWNED_WALK_SPEED = 1.6;
const STATION_DISCOVER_RADIUS = 8;

function deathAnchor(ctx: GameContext, event: EntityDiedEvent): readonly [number, number, number] {
  const dead = ctx.scene.entity.get(event.instanceId);
  if (dead !== null) return dead.position;
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  return playerEntity?.position ?? PLAYER_SPAWN;
}

function dropGunAt(ctx: GameContext, event: EntityDiedEvent, anchor: readonly [number, number, number], guaranteed = 0): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  const rolls = guaranteed + (dropRng() < def.gunDropChance ? 1 : 0);
  if (rolls === 0) return;
  const level = Math.max(1, zoneLevelAt(anchor[0], anchor[2]) + Math.floor(dropRng() * 3) - 1);
  for (let index = 0; index < rolls; index += 1) {
    const gun = rollGun(dropRng, level, {
      luck: def.gunLuck,
      ...(guaranteed > 0 && index < guaranteed ? { rarity: "legendary" as const } : {}),
    });
    ctx.scene.worldItem.spawn({
      itemId: gun.id,
      position: [anchor[0] + (dropRng() - 0.5) * 3, anchor[1], anchor[2] + (dropRng() - 0.5) * 3],
      rarity: gun.rarity,
      baseType: gun.family,
      source: "kill",
    });
  }
}

function grantEridium(ctx: GameContext, event: EntityDiedEvent): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  let amount = 0;
  if (def.id === "the_warrior") amount = 20;
  else if (def.family === "boss") amount = 8;
  else if (def.badass) amount = 1 + Math.floor(dropRng() * 3);
  if (amount === 0) return;
  ctx.game.economy.grant(ctx.player.userId, "eridium", amount);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${amount} ERIDIUM`, kind: "pickup" });
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  const userId = ctx.player.userId;
  if (event.instanceId === userId) return;
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === userId) {
    const anchor = deathAnchor(ctx, event);
    grantXp(ctx, userId, levelXpFor(enemy.xp, zoneLevelAt(anchor[0], anchor[2])));
    grantEridium(ctx, event);
    if (enemy.id === "the_warrior") {
      ctx.game.store.set("vaultOpen", { atMs: ctx.time.now() * 1000 });
      dropGunAt(ctx, event, anchor, 3);
    } else {
      dropGunAt(ctx, event, anchor);
    }
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

function nearestDiscoveredStation(ctx: GameContext): { x: number; z: number } {
  const discovered = (ctx.game.store.get("discoveredStations") as readonly string[] | undefined) ?? [];
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  const from = playerEntity?.position ?? PLAYER_SPAWN;
  let best: { x: number; z: number } = { x: PLAYER_SPAWN[0], z: PLAYER_SPAWN[2] };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of TRAVEL_STATIONS) {
    if (!discovered.includes(station.zoneId)) continue;
    const distance = Math.hypot(from[0] - station.x, from[2] - station.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: station.x + 4, z: station.z + 4 };
    }
  }
  return best;
}

function respawnAtNewU(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const cash = ctx.game.economy.balance(userId, "cash");
  const fee = Math.floor(cash * 0.07);
  if (fee > 0) ctx.game.economy.charge(userId, "cash", fee);
  const station = nearestDiscoveredStation(ctx);
  const y = ctx.world.groundHeightAt(station.x, station.z);
  ctx.scene.entity.update(userId, {
    position: [station.x, y, station.z],
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

function tickZoneAndStations(ctx: GameContext, nowMs: number): void {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return;
  const [x, , z] = playerEntity.position;

  const zone = zoneAt(x, z);
  const currentZone = ctx.game.store.get("currentZone") as { id: string } | undefined;
  if (zone !== null && zone.id !== currentZone?.id) {
    ctx.game.store.set("currentZone", { id: zone.id, name: zone.name, level: zone.level, atMs: nowMs });
  }

  const discovered = (ctx.game.store.get("discoveredStations") as readonly string[] | undefined) ?? [];
  for (const station of TRAVEL_STATIONS) {
    if (discovered.includes(station.zoneId)) continue;
    if (Math.hypot(x - station.x, z - station.z) <= STATION_DISCOVER_RADIUS) {
      ctx.game.store.set("discoveredStations", [...discovered, station.zoneId]);
      ctx.scene.entity.floatText({
        instanceId: ctx.player.userId,
        text: `FAST TRAVEL DISCOVERED: ${station.name.toUpperCase()}`,
        kind: "pickup",
      });
      break;
    }
  }
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
  ctx.game.events.on("quest.accepted", (event) => {
    ctx.game.store.set("echo", { questId: event.questId, atMs: ctx.time.now() * 1000 });
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
  ctx.game.quest.accept(ctx.player.userId, MAIN_QUEST_IDS[0]!);
  ctx.game.quest.accept(ctx.player.userId, QUEST_IDS.mongHunt);
  ctx.game.quest.accept(ctx.player.userId, QUEST_IDS.skagDogDays);
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
  tickZoneAndStations(ctx, nowMs);
}

export const loop = { onInit, onNewPlayer, onTick };
