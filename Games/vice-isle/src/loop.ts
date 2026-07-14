import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { dialogueStore, registerCommands } from "./game/commands";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { raceStore, resetHandroll, handroll } from "./game/handroll";
import { vehicleById } from "./game/entities/vehicles/catalog";
import { itemUseHandlers, resetWeaponState } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { QUESTS } from "./game/quests/catalog";
import { DOCK_FIGHT_CENTER, GARAGE_POS, KINGPIN_POS, MARCO_POS, PLAYER_SPAWN } from "./game/world/districts";
import { setupWorld } from "./game/world/setup";

const AGGRO_RADIUS = 18;
const GANGER_SHOT_RANGE = 14;

let convoyTimer = 0;
let convoySpawned = 0;
let kingpinSpawned = false;

export function resetMissionState(): void {
  convoyTimer = 0;
  convoySpawned = 0;
  kingpinSpawned = false;
}

function tickGangers(ctx: GameContext, dt: number): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const now = ctx.time.now();
  for (const entity of ctx.scene.entity.list()) {
    if (!entity.name.startsWith("ganger_") && entity.name !== "kingpin_sal") continue;
    const dist = Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]);
    if (dist > AGGRO_RADIUS) continue;
    if (dist > 6) {
      ctx.scene.entity.moveToward(entity.id, player.position, {
        speed: entity.name === "ganger_enforcer" ? 3.8 : 4.4,
        stopDistance: 5,
        dt,
      });
    }
    if (dist < GANGER_SHOT_RANGE && ctx.scene.entity.hasLineOfSight(entity.id, ctx.player.userId)) {
      const meta = (entity.meta ?? {}) as { nextShotAt?: number };
      if ((meta.nextShotAt ?? 0) <= now) {
        ctx.scene.entity.update(entity.id, { meta: { ...meta, nextShotAt: now + 1.4 } });
        ctx.scene.entity.effect({
          from: entity.id,
          to: ctx.player.userId,
          effect: "damage",
          via: { amount: entity.name === "kingpin_sal" ? 16 : entity.name === "ganger_enforcer" ? 12 : 6 },
        });
      }
    }
  }
}

function tickMissions(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const quests = ctx.game.quest.list(ctx.player.userId);

  const welcome = quests.find((q) => q.questId === "m1_welcome" && q.status === "active");
  if (welcome !== undefined) {
    const dist = Math.hypot(player.position[0] - MARCO_POS[0], player.position[2] - MARCO_POS[2]);
    if (dist < 5) {
      ctx.game.quest.progress(ctx.player.userId, "m1_welcome", "meet_marco", 1);
      ctx.game.quest.turnIn(ctx.player.userId, "m1_welcome");
      dialogueStore.write(ctx, "dlg_marco");
    }
  }

  const shake = quests.find((q) => q.questId === "m4_shake_the_heat" && q.status === "active");
  if (shake !== undefined) {
    const wanted = handroll.wanted();
    if (wanted.peakStars >= 3 && wanted.stars === 0) {
      ctx.game.quest.progress(ctx.player.userId, "m4_shake_the_heat", "lose_wanted", 1);
      ctx.game.quest.turnIn(ctx.player.userId, "m4_shake_the_heat");
      ctx.game.feed.push("vice.log", { text: "You shook the heat. Vice Isle is yours." });
    }
  }

  const race = quests.find((q) => q.questId === "m5_ocean_loop" && q.status === "active");
  if (race !== undefined) {
    const snapshot = raceStore.peek(ctx);
    if (snapshot !== undefined && snapshot.finished && snapshot.won) {
      ctx.game.quest.progress(ctx.player.userId, "m5_ocean_loop", "win_race", 1);
      raceStore.clear(ctx);
    }
  }

  const delivery = quests.find((q) => q.questId === "m6_hot_wheels" && q.status === "active");
  if (delivery !== undefined) {
    const drivingId = handroll.drivingVehicleId();
    const vehicle = drivingId !== null ? ctx.scene.entity.get(drivingId) : null;
    if (vehicle !== null && vehicle.name === "car_sport") {
      const dist = Math.hypot(vehicle.position[0] - GARAGE_POS[0], vehicle.position[2] - GARAGE_POS[2]);
      if (dist < 9) {
        ctx.game.quest.progress(ctx.player.userId, "m6_hot_wheels", "deliver_cicada", 1);
        handroll.exitVehicle(ctx);
        ctx.game.feed.push("vice.log", { text: "Cicada GT delivered." });
      }
    }
  }

  for (const quest of quests) {
    if (quest.status !== "active") continue;
    if (quest.questId !== "m1_welcome" && quest.questId !== "m4_shake_the_heat") {
      if (ctx.game.quest.canTurnIn(ctx.player.userId, quest.questId) === null) {
        ctx.game.quest.turnIn(ctx.player.userId, quest.questId);
      }
    }
  }
}

function tickMissionSpawns(ctx: GameContext, dt: number): void {
  const quests = ctx.game.quest.list(ctx.player.userId);

  const convoy = quests.find((q) => q.questId === "m7_carmine_convoy" && q.status === "active");
  if (convoy !== undefined && convoySpawned < 10) {
    convoyTimer -= dt;
    const alive = ctx.scene.entity.list().filter((e) => e.name === "ganger_dock").length;
    if (convoyTimer <= 0 && alive < 4) {
      convoyTimer = 6;
      convoySpawned += 1;
      const angle = (convoySpawned / 10) * Math.PI * 2;
      const x = DOCK_FIGHT_CENTER[0] + Math.sin(angle) * 22;
      const z = DOCK_FIGHT_CENTER[2] + Math.cos(angle) * 22;
      ctx.scene.entity.spawn("ganger_dock", {
        id: `convoy_${convoySpawned}`,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        role: "npc",
      });
    }
  }

  const kingpin = quests.find((q) => q.questId === "m8_kingpin" && q.status === "active");
  if (kingpin !== undefined && !kingpinSpawned) {
    kingpinSpawned = true;
    ctx.scene.entity.spawn("kingpin_sal", {
      id: "kingpin_sal",
      position: [KINGPIN_POS[0], ctx.world.groundHeightAt(KINGPIN_POS[0], KINGPIN_POS[2]), KINGPIN_POS[2]],
      role: "npc",
    });
    for (let i = 0; i < 3; i += 1) {
      const x = KINGPIN_POS[0] - 6 + i * 6;
      const z = KINGPIN_POS[2] + 8;
      ctx.scene.entity.spawn("ganger_enforcer", {
        id: `sal_guard_${i}`,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        role: "npc",
      });
    }
    ctx.game.feed.push("vice.log", { text: "Sal is holed up in Palm Heights." });
  }
}

function tickPedPanic(ctx: GameContext, dt: number): void {
  if (handroll.wanted().stars === 0) return;
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  for (const entity of ctx.scene.entity.list()) {
    if (!entity.name.startsWith("ped_")) continue;
    const dx = entity.position[0] - player.position[0];
    const dz = entity.position[2] - player.position[2];
    const dist = Math.hypot(dx, dz);
    if (dist > 24 || dist < 0.1) continue;
    const away: readonly [number, number, number] = [
      entity.position[0] + (dx / dist) * 12,
      entity.position[1],
      entity.position[2] + (dz / dist) * 12,
    ];
    ctx.scene.entity.moveToward(entity.id, away, { speed: 4.6, dt });
  }
}

function onInit(ctx: GameContext): void {
  resetHandroll();
  resetWeaponState();
  resetMissionState();
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest.register(QUESTS);
  ctx.game.quest.bind("entity.died");
  ctx.game.quest.bind("inventory.added");
  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => {
    const dead = event as { instanceId?: string; catalogId?: string; at?: readonly [number, number, number] };
    const catalogId = dead.catalogId ?? "";
    const enemy = enemyById(catalogId);
    if (enemy !== undefined && enemy.bounty > 0) {
      ctx.game.economy.grant(ctx.player.userId, "cash", enemy.bounty);
    }
    if (catalogId.startsWith("ped_")) handroll.addHeat(ctx, 60);
    if (catalogId.startsWith("cop_") && catalogId !== "car_cop") handroll.addHeat(ctx, 110);
    if (vehicleById(catalogId) !== undefined && dead.instanceId !== undefined) {
      const at = dead.at ?? ctx.scene.entity.get(dead.instanceId)?.position ?? [0, 0, 0];
      handroll.explodeVehicle(ctx, dead.instanceId, at);
      handroll.addHeat(ctx, 45);
    }
  });

  registerCommands(ctx);
  setupWorld(ctx);
}

function onNewPlayer(ctx: GameContext): void {
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn("street_runner", {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    role: "player",
  });
  if (ctx.player.isNew) {
    ctx.player.applyLoadout(ctx.player.userId, "starterKit");
    ctx.game.quest.grant(ctx.player.userId, "m1_welcome");
  }
}

function onTick(ctx: GameContext, dt: number): void {
  handroll.tick(ctx, dt);
  tickGangers(ctx, dt);
  tickMissions(ctx);
  tickMissionSpawns(ctx, dt);
  tickPedPanic(ctx, dt);

  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health !== null && health.current <= 0) {
    handroll.exitVehicle(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: health.max });
    ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 0 });
    const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
    ctx.scene.entity.setPose(ctx.player.userId, { position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]] });
    ctx.game.economy.charge(ctx.player.userId, "cash", Math.min(200, ctx.game.economy.balance(ctx.player.userId, "cash")));
    handroll.clearWanted(ctx);
    ctx.game.feed.push("vice.log", { text: "Wasted. The clinic took its cut." });
  }
}

export const loop = { onInit, onNewPlayer, onTick };
