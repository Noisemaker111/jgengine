import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import {
  bestRaceStore,
  continueStore,
  garageStore,
  RACE_BEST_BONUS,
  RACE_WIN_PAYOUT,
  registerCommands,
  safehouseStore,
  shopStore,
  startedStore,
} from "./game/commands";
import { enemyById } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { drivingStore, raceStore, resetHandroll, handroll } from "./game/handroll";
import { vehicleById } from "./game/entities/vehicles/catalog";
import { advanceBustedHold, BUSTED_HOLD_SEC, BUSTED_RADIUS, bustedFine, clinicFee } from "./game/failStates";
import { itemUseHandlers, resetWeaponState } from "./game/items/use-handlers";
import { onBountyKilled, tickBounties } from "./game/jobs/bounties";
import { loadouts } from "./game/loadouts";
import { CRED_BY_QUEST, grantCred, RACE_WIN_CRED } from "./game/progression/cred";
import { QUESTS } from "./game/quests/catalog";
import {
  CICADA_STAGE_POS,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  KINGPIN_POS,
  MARCO_POS,
  PLAYER_SPAWN,
  SAFEHOUSE_POS,
  VCPD_POS,
} from "./game/world/districts";
import { setupWorld } from "./game/world/setup";

const AGGRO_RADIUS = 18;
const GANGER_SHOT_RANGE = 14;
const CONVOY_TOTAL = 10;
const CICADA_STAGE_ID = "cicada_stage_car";
const RACE_BANNER_SEC = 6;

/** Convoy spawn counter lives in a store so mid-m7 saves keep unique ids and the 10-spawn cap. */
const convoyStageStore = defineStore<number | undefined>("vice.convoyStage", undefined);

let convoyTimer = 0;
let kingpinSpawned = false;
let bustedHold = 0;
let raceSettled = false;
let raceClearAt = 0;

export function resetMissionState(): void {
  convoyTimer = 0;
  kingpinSpawned = false;
  bustedHold = 0;
  raceSettled = false;
  raceClearAt = 0;
}

function tickGangers(ctx: GameContext, dt: number): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const now = ctx.time.now();
  for (const entity of ctx.scene.entity.list()) {
    const hostile =
      entity.name.startsWith("ganger_") || entity.name === "kingpin_sal" || entity.name === "bounty_mark";
    if (!hostile) continue;
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
          via: {
            amount:
              entity.name === "kingpin_sal" ? 16 : entity.name === "ganger_enforcer" || entity.name === "bounty_mark" ? 12 : 6,
          },
        });
      }
    }
  }
}

function tickMissions(ctx: GameContext): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const quests = ctx.game.quest!.list(ctx.player.userId);

  const welcome = quests.find((q) => q.questId === "m1_welcome" && q.status === "active");
  if (welcome !== undefined) {
    const dist = Math.hypot(player.position[0] - MARCO_POS[0], player.position[2] - MARCO_POS[2]);
    if (dist < 5) {
      ctx.game.quest!.progress(ctx.player.userId, "m1_welcome", "meet_marco", 1);
      ctx.game.quest!.turnIn(ctx.player.userId, "m1_welcome");
      ctx.game.dialogue!.open("dlg_marco");
    }
  }

  const shake = quests.find((q) => q.questId === "m4_shake_the_heat" && q.status === "active");
  if (shake !== undefined) {
    const wanted = handroll.wanted();
    if (wanted.peakStars >= 3 && wanted.stars === 0) {
      ctx.game.quest!.progress(ctx.player.userId, "m4_shake_the_heat", "lose_wanted", 1);
      ctx.game.quest!.turnIn(ctx.player.userId, "m4_shake_the_heat");
      ctx.game.feed.push("vice.log", { text: "You shook the heat. Vice Isle is yours." });
    }
  }

  const race = quests.find((q) => q.questId === "m5_ocean_loop" && q.status === "active");
  if (race !== undefined) {
    const snapshot = raceStore.peek(ctx);
    if (snapshot !== undefined && snapshot.finished && snapshot.won) {
      ctx.game.quest!.progress(ctx.player.userId, "m5_ocean_loop", "win_race", 1);
    }
  }

  const delivery = quests.find((q) => q.questId === "m6_hot_wheels" && q.status === "active");
  if (delivery !== undefined) {
    const drivingId = handroll.drivingVehicleId();
    const vehicle = drivingId !== null ? ctx.scene.entity.get(drivingId) : null;
    if (vehicle !== null && vehicle.name === "car_sport") {
      const dist = Math.hypot(vehicle.position[0] - GARAGE_POS[0], vehicle.position[2] - GARAGE_POS[2]);
      if (dist < 9) {
        ctx.game.quest!.progress(ctx.player.userId, "m6_hot_wheels", "deliver_cicada", 1);
        handroll.exitVehicle(ctx);
        ctx.game.feed.push("vice.log", { text: "Cicada GT delivered." });
      }
    }
  }

  for (const quest of quests) {
    if (quest.status !== "active") continue;
    if (quest.questId !== "m1_welcome" && quest.questId !== "m4_shake_the_heat") {
      if (ctx.game.quest!.canTurnIn(ctx.player.userId, quest.questId) === null) {
        ctx.game.quest!.turnIn(ctx.player.userId, quest.questId);
      }
    }
  }
}

function tickMissionSpawns(ctx: GameContext, dt: number): void {
  const quests = ctx.game.quest!.list(ctx.player.userId);

  const convoy = quests.find((q) => q.questId === "m7_carmine_convoy" && q.status === "active");
  const convoySpawned = convoyStageStore.read(ctx) ?? 0;
  if (convoy !== undefined && convoySpawned < CONVOY_TOTAL) {
    convoyTimer -= dt;
    const alive = ctx.scene.entity.list().filter((e) => e.name === "ganger_dock").length;
    if (convoyTimer <= 0 && alive < 4) {
      convoyTimer = 6;
      const wave = convoySpawned + 1;
      convoyStageStore.write(ctx, wave);
      const angle = (wave / CONVOY_TOTAL) * Math.PI * 2;
      const x = DOCK_FIGHT_CENTER[0] + Math.sin(angle) * 22;
      const z = DOCK_FIGHT_CENTER[2] + Math.cos(angle) * 22;
      ctx.scene.entity.spawn("ganger_dock", {
        id: `convoy_${wave}`,
        position: [x, ctx.world.groundHeightAt(x, z), z],
        role: "npc",
      });
    }
  }

  const kingpin = quests.find((q) => q.questId === "m8_kingpin" && q.status === "active");
  if (kingpin !== undefined && !kingpinSpawned) {
    kingpinSpawned = true;
    if (ctx.scene.entity.get("kingpin_sal") === null) {
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

  // m6 needs a guaranteed target: keep one Cicada staged at the authored Palm Heights spot
  // while the mission runs (it re-stages if the last one burned).
  const hotWheels = quests.find((q) => q.questId === "m6_hot_wheels" && q.status === "active");
  if (hotWheels !== undefined && ctx.scene.entity.get(CICADA_STAGE_ID) === null) {
    const [x, , z] = CICADA_STAGE_POS;
    ctx.scene.entity.spawn("car_sport", {
      id: CICADA_STAGE_ID,
      position: [x, ctx.world.groundHeightAt(x, z), z],
      role: "prop",
    });
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

/** Settle a finished race once (payout, cred, best-time bonus), then clear the banner. */
function tickRaceEconomy(ctx: GameContext): void {
  const snapshot = raceStore.peek(ctx);
  if (snapshot === undefined || !snapshot.finished) {
    raceSettled = false;
    return;
  }
  if (!raceSettled) {
    raceSettled = true;
    raceClearAt = ctx.time.now() + RACE_BANNER_SEC;
    if (snapshot.won) {
      ctx.game.economy.grant(ctx.player.userId, "cash", RACE_WIN_PAYOUT);
      grantCred(ctx, RACE_WIN_CRED);
      const best = bestRaceStore.read(ctx);
      if (best === undefined || snapshot.timeSec < best) {
        bestRaceStore.write(ctx, snapshot.timeSec);
        if (best !== undefined) {
          ctx.game.economy.grant(ctx.player.userId, "cash", RACE_BEST_BONUS);
          ctx.game.feed.push("vice.log", {
            text: `New Ocean Loop record ${snapshot.timeSec.toFixed(1)}s — $${RACE_WIN_PAYOUT + RACE_BEST_BONUS}.`,
          });
        } else {
          ctx.game.feed.push("vice.log", { text: `Won the Ocean Loop — $${RACE_WIN_PAYOUT}.` });
        }
      } else {
        ctx.game.feed.push("vice.log", { text: `Won the Ocean Loop — $${RACE_WIN_PAYOUT}.` });
      }
    } else {
      ctx.game.feed.push("vice.log", { text: "Lost the Ocean Loop. The garage runs it again anytime." });
    }
  }
  if (ctx.time.now() >= raceClearAt) raceStore.clear(ctx);
}

/** A cop on top of an on-foot wanted player for a sustained beat makes the arrest. */
function tickBusted(ctx: GameContext, dt: number): void {
  const stars = handroll.wanted().stars;
  if (stars === 0 || handroll.drivingVehicleId() !== null) {
    bustedHold = 0;
    return;
  }
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health !== null && health.current <= 0) return;
  const copInReach = ctx.scene.entity.list().some((entity) => {
    if (entity.name !== "cop_patrol" && entity.name !== "cop_swat") return false;
    const dist = Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]);
    return dist < BUSTED_RADIUS && ctx.scene.entity.hasLineOfSight(entity.id, ctx.player.userId);
  });
  bustedHold = advanceBustedHold(bustedHold, copInReach, dt);
  if (bustedHold < BUSTED_HOLD_SEC) return;
  bustedHold = 0;
  const fine = bustedFine(ctx.game.economy.balance(ctx.player.userId, "cash"), stars);
  if (fine > 0) ctx.game.economy.charge(ctx.player.userId, "cash", fine);
  const y = ctx.world.groundHeightAt(VCPD_POS[0], VCPD_POS[2]);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [VCPD_POS[0], y, VCPD_POS[2]] });
  handroll.clearWanted(ctx);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "BUSTED", kind: "warn" });
  ctx.game.feed.push("vice.log", { text: `Busted. VCPD released you for $${fine}.` });
}

/** Death restages the active boss fight so m8 restarts clean instead of resuming half-dead guards. */
function restageAfterWasted(ctx: GameContext): void {
  const m8 = ctx.game.quest!.list(ctx.player.userId).find((q) => q.questId === "m8_kingpin" && q.status === "active");
  if (m8 === undefined) return;
  for (const entity of ctx.scene.entity.list()) {
    if (entity.id === "kingpin_sal" || entity.id.startsWith("sal_guard_")) ctx.scene.entity.despawn(entity.id);
  }
  kingpinSpawned = false;
}

function tickWasted(ctx: GameContext): void {
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health === null || health.current > 0) return;
  handroll.exitVehicle(ctx);
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: health.max });
  ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 0 });
  const home = safehouseStore.read(ctx) === true ? SAFEHOUSE_POS : PLAYER_SPAWN;
  const y = ctx.world.groundHeightAt(home[0], home[2]);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [home[0], y, home[2]] });
  const fee = clinicFee(ctx.game.economy.balance(ctx.player.userId, "cash"));
  if (fee > 0) ctx.game.economy.charge(ctx.player.userId, "cash", fee);
  handroll.clearWanted(ctx);
  restageAfterWasted(ctx);
  ctx.game.feed.push("vice.log", {
    text: fee > 0 ? `Wasted. The clinic took $${fee}.` : "Wasted. The clinic took pity.",
  });
}

/**
 * Transient session state (menus, wanted HUD, drive/race handles, the started gate) rides along in
 * the whole-world save because it lives in stores — reset it so a restored boot starts clean on foot
 * at the title screen, with everything durable (cash, cred, quests, inventory, world) kept.
 */
function normalizeAfterRestore(ctx: GameContext): void {
  startedStore.clear(ctx);
  shopStore.clear(ctx);
  garageStore.clear(ctx);
  raceStore.clear(ctx);
  drivingStore.clear(ctx);
  handroll.clearWanted(ctx);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null) {
    ctx.scene.entity.update(ctx.player.userId, { movement: { ...(player.movement ?? {}), frozen: false } });
  }
  ctx.camera.follow(ctx.player.userId);
  continueStore.write(ctx, true);
}

async function resumeFromSave(ctx: GameContext): Promise<void> {
  const save = ctx.game.save;
  if (save === undefined) return;
  if (!(await save.load())) return;
  normalizeAfterRestore(ctx);
}

function onInit(ctx: GameContext): void {
  resetHandroll();
  resetWeaponState();
  resetMissionState();
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest!.register(QUESTS);
  ctx.game.quest!.bind("entity.died");
  ctx.game.quest!.bind("inventory.added");
  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("quest.completed", (event) => {
    const questId = (event as { questId?: string }).questId ?? "";
    const cred = CRED_BY_QUEST[questId];
    if (cred !== undefined) grantCred(ctx, cred);
  });

  ctx.game.events.on("entity.died", (event) => {
    const dead = event as { instanceId?: string; catalogId?: string; at?: readonly [number, number, number] };
    const catalogId = dead.catalogId ?? "";
    const enemy = enemyById(catalogId);
    if (enemy !== undefined && enemy.bounty > 0) {
      ctx.game.economy.grant(ctx.player.userId, "cash", enemy.bounty);
    }
    if (dead.instanceId !== undefined) onBountyKilled(ctx, dead.instanceId);
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
    ctx.game.quest!.grant(ctx.player.userId, "m1_welcome");
  }
  void resumeFromSave(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  handroll.tick(ctx, dt);
  tickGangers(ctx, dt);
  tickMissions(ctx);
  tickMissionSpawns(ctx, dt);
  tickBounties(ctx);
  tickRaceEconomy(ctx);
  tickBusted(ctx, dt);
  tickPedPanic(ctx, dt);
  tickWasted(ctx);
}

export const loop = { onInit, onNewPlayer, onTick };
