import { loadSavedProgress } from "./game/saveCompatibility";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
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
import { landHit } from "./game/combat/hitModel";
import { earn, openBooks, recordWalletChange, spend } from "./game/cash";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { drivingStore, raceStore, handrollOf } from "./game/handroll";
import { vehicleById } from "./game/entities/vehicles/catalog";
import { advanceBustedHold, BUSTED_HOLD_SEC, BUSTED_RADIUS, bustedFine, clinicFee } from "./game/failStates";
import { itemUseHandlers, resetWeaponState } from "./game/items/use-handlers";
import { ensureNightMarket } from "./game/items/nightMarket";
import { onBountyKilled, tickBounties } from "./game/jobs/bounties";
import { resetStashRuntime, tickStashes } from "./game/jobs/stashes";
import { loadouts } from "./game/loadouts";
import { registerCaptureCommands } from "./game/capture";
import { grantCred, RACE_WIN_CRED } from "./game/progression/cred";
import { crewHostile, gangOf } from "./game/city/street";
import { cityEvent, gangAggroRadius, failActiveJob, fearAt, PANIC_FEAR, registerCity, startCareer, tickCity } from "./game/cityRuntime";
import {
  CICADA_STAGE_POS,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  OCEAN_LOOP_ID,
  KINGPIN_POS,
  MARCO_POS,
  PLAYER_SPAWN,
  PLAYER_SPAWN_YAW,
  SAFEHOUSE_POS,
  HHPD_POS,
} from "./game/world/districts";
import { disposeWorld, setupWorld } from "./game/world/setup";
import { disposeTraffic, setupTraffic, tickTraffic } from "./game/world/traffic";
import { disposeResidents, setupResidents, tickResidents } from "./game/world/residents";
import { courierLoop, courierStore, finishCourier, registerCourier, restoreCourier, setupCourierLandmarks, tickCourier } from "./game/jobs/courier";
import { failGigs, tickGigs } from "./game/jobs/gigs";
import { sessionStore, startedThisBoot, syncSession } from "./game/session";
import {
  convoyRunners,
  mission,
  patchMission,
  resetMissionState,
} from "./game/runState";
import { harborSave, holdSavesUntil, loadHarborSave, saveHarborState } from "./game/save";
import { createWaveRunner } from "@jgengine/core/ai/waveRunner";
import { attachWaveFeedback } from "@jgengine/shell/audio/eventFeedback";
import { perContext } from "@jgengine/core/runtime/perContext";
import { registerRadio, tickRadio } from "./game/radio/runtime";

const AGGRO_RADIUS = 18;
const GANGER_SHOT_RANGE = 14;
const CICADA_STAGE_ID = "cicada_stage_car";
const RACE_BANNER_SEC = 6;

const convoyFeedback = perContext((ctx: GameContext) => ({
  detach: attachWaveFeedback(convoyRunners(ctx), ctx.game.feedback),
}));

/**
 * Keep simulation and touch controls behind the title, pause, settings and result gates.
 */
function syncPhase(ctx: GameContext): void {
  syncSession(ctx, startedStore.read(ctx) === true);
}

export { resetMissionState };

function tickGangers(ctx: GameContext, dt: number): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  const now = ctx.time.now();
  for (const entity of ctx.scene.entity.list()) {
    const gang = gangOf(entity.name);
    const hostile = gang !== null || entity.name === "bounty_mark";
    if (!hostile || !crewHostile(ctx, entity)) continue;
    const aggro = gangAggroRadius(ctx, gang ?? "carmine", AGGRO_RADIUS);
    const dist = Math.hypot(entity.position[0] - player.position[0], entity.position[2] - player.position[2]);
    if (dist > aggro) continue;
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
        // Crew fire resolves through the same chart as the player's: the target presents a profile.
        landHit(ctx, {
          from: entity.id,
          to: ctx.player.userId,
          type: "ballistic",
          base: entity.name === "kingpin_sal" ? 16 : entity.name === "ganger_enforcer" || entity.name === "bounty_mark" ? 12 : 6,
        });
      }
    }
  }
}

/** Peds near the player scatter while the block is scared, whatever the stars say. */
function tickPedPanic(ctx: GameContext, dt: number): void {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return;
  if (fearAt(ctx, player.position[0], player.position[2]) < PANIC_FEAR) return;
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
    patchMission(ctx, { raceSettled: false });
    return;
  }
  if (!mission(ctx).raceSettled) {
    patchMission(ctx, { raceSettled: true, raceClearAt: ctx.time.now() + RACE_BANNER_SEC });
    if (snapshot.won) {
      earn(ctx, RACE_WIN_PAYOUT, "race-purse", snapshot.routeId);
      grantCred(ctx, RACE_WIN_CRED);
      // The persisted best time (and its bonus) stays an Ocean Loop record — other circuits pay the flat purse.
      const best = snapshot.routeId === OCEAN_LOOP_ID ? bestRaceStore.read(ctx) : undefined;
      if (snapshot.routeId === OCEAN_LOOP_ID && (best === undefined || snapshot.timeSec < best)) {
        bestRaceStore.write(ctx, snapshot.timeSec);
        if (best !== undefined) {
          earn(ctx, RACE_BEST_BONUS, "race-record", snapshot.routeId);
          ctx.game.notices.push({
            text: `New ${snapshot.label} record ${snapshot.timeSec.toFixed(1)}s — $${RACE_WIN_PAYOUT + RACE_BEST_BONUS}.`,
            tone: "success",
          });
        } else {
          ctx.game.notices.push({ text: `Won ${snapshot.label} — $${RACE_WIN_PAYOUT}.`, tone: "success" });
        }
      } else {
        ctx.game.notices.push({ text: `Won ${snapshot.label} — $${RACE_WIN_PAYOUT}.`, tone: "success" });
      }
    } else {
      ctx.game.notices.push({ text: `Lost ${snapshot.label}. The start line runs it again anytime.`, tone: "warn" });
    }
  }
  if (ctx.time.now() >= mission(ctx).raceClearAt) raceStore.clear(ctx);
}

/** A cop on top of an on-foot wanted player for a sustained beat makes the arrest. */
function tickBusted(ctx: GameContext, dt: number): void {
  const stars = handrollOf(ctx).wanted().stars;
  if (stars === 0 || handrollOf(ctx).drivingVehicleId() !== null) {
    patchMission(ctx, { bustedHold: 0 });
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
  const held = advanceBustedHold(mission(ctx).bustedHold, copInReach, dt);
  patchMission(ctx, { bustedHold: held });
  if (held < BUSTED_HOLD_SEC) return;
  patchMission(ctx, { bustedHold: 0 });
  const fine = bustedFine(ctx.game.economy.balance(ctx.player.userId, "cash"), stars);
  if (fine > 0) spend(ctx, fine, "busted-fine");
  const y = ctx.world.groundHeightAt(HHPD_POS[0], HHPD_POS[2]);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [HHPD_POS[0], y, HHPD_POS[2]] });
  handrollOf(ctx).clearWanted(ctx);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "BUSTED", kind: "warn" });
  finishCourier(ctx, false);
  failGigs(ctx, "busted");
  failActiveJob(ctx);
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: `Busted · $${fine} fine. You are free to go at HHPD.` });
  syncPhase(ctx);
}

function tickWasted(ctx: GameContext): void {
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (health === null || health.current > 0) return;
  handrollOf(ctx).exitVehicle(ctx, true);
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: health.max });
  ctx.scene.entity.stats.set(ctx.player.userId, "armor", { current: 0 });
  const home = safehouseStore.read(ctx) === true ? SAFEHOUSE_POS : PLAYER_SPAWN;
  const y = ctx.world.groundHeightAt(home[0], home[2]);
  ctx.scene.entity.setPose(ctx.player.userId, { position: [home[0], y, home[2]] });
  const fee = clinicFee(ctx.game.economy.balance(ctx.player.userId, "cash"));
  if (fee > 0) spend(ctx, fee, "clinic-fee");
  handrollOf(ctx).clearWanted(ctx);
  failActiveJob(ctx);
  finishCourier(ctx, false);
  failGigs(ctx, "wasted");
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: `Clinic discharge · $${fee} fee. Health restored; your campaign progress is safe.` });
  syncPhase(ctx);
}

/**
 * Transient session state (menus, wanted HUD, drive/race handles, the started gate) rides along in
 * the whole-world save because it lives in stores — reset it so a restored boot starts clean on foot
 * at the title screen, with everything durable (cash, cred, quests, inventory, world) kept.
 *
 * `resumeFromSave` runs async out of `onNewPlayer`, so it resolves *after* the shell has already
 * fired `onContextReady` and dispatched any `capture.play` command. If the session already went live
 * that way (a `shoot --mode play` boot dispatches `game.start` before this restore lands), keep it
 * live instead of bouncing back to the title — otherwise capture re-shows the menu it just dismissed.
 */
export function normalizeAfterRestore(ctx: GameContext, alreadyLive = startedStore.read(ctx) === true): void {
  if (alreadyLive) startedStore.write(ctx, true);
  else startedStore.clear(ctx);
  shopStore.clear(ctx);
  garageStore.clear(ctx);
  raceStore.clear(ctx);
  drivingStore.clear(ctx);
  sessionStore.clear(ctx);
  restoreCourier(ctx);
  const courier = courierStore.read(ctx);
  if (courier.receipt != null) courierStore.write(ctx, { ...courier, receipt: null, phase: "idle" });
  setupCourierLandmarks(ctx);
  // Heat is not cleared here any more: the wanted section restored it and the HUD reads the primitive,
  // so a reload mid-pursuit keeps the tier and the search area (engine #2243).
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null) {
    // A save written mid-drive persists the seated rider state — restore on foot, rendered (#1299).
    ctx.scene.entity.update(ctx.player.userId, { movement: { ...(player.movement ?? {}), frozen: false }, hidden: false });
  }
  ctx.camera.follow(ctx.player.userId);
  ctx.camera.setChaseTuning(null);
  continueStore.write(ctx, true);
  syncPhase(ctx);
}

async function resumeFromSave(ctx: GameContext): Promise<void> {
  const world = await loadSavedProgress(ctx);
  // The document loads after the world snapshot so its sections are the run's authority.
  const run = await loadHarborSave(ctx);
  if (!world && !run) return;
  normalizeAfterRestore(ctx, startedThisBoot(ctx).value);
}

function onInit(ctx: GameContext): void {
  resetWeaponState();
  resetMissionState(ctx);
  // Build the mission session here so its probe is on the window from boot, not from the first parcel.
  courierLoop(ctx);
  resetStashRuntime();
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => {
    const dead = event as { instanceId?: string; catalogId?: string; at?: readonly [number, number, number] };
    const catalogId = dead.catalogId ?? "";
    const enemy = enemyById(catalogId);
    if (enemy !== undefined && enemy.bounty > 0) {
      earn(ctx, enemy.bounty, "bounty", catalogId);
    }
    if (dead.instanceId !== undefined) onBountyKilled(ctx, dead.instanceId);
    if (vehicleById(catalogId) !== undefined && dead.instanceId !== undefined) {
      const at = dead.at ?? ctx.scene.entity.get(dead.instanceId)?.position ?? [0, 0, 0];
      handrollOf(ctx).explodeVehicle(ctx, dead.instanceId, at);
      cityEvent(ctx, { kind: "wreck", at });
    }
  });

  registerCommands(ctx);
  registerCity(ctx);
  registerRadio(ctx);
  // The cash journal is live before the first movement, opened at the wallet's balance.
  openBooks(ctx);
  registerCaptureCommands(ctx);
  convoyFeedback(ctx);
  ensureNightMarket(ctx);
  const buildings = setupWorld(ctx);
  setupTraffic(ctx);
  setupResidents(ctx, buildings);
  setupCourierLandmarks(ctx);
}

function onNewPlayer(ctx: GameContext): void {
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn("street_runner", {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    rotationY: PLAYER_SPAWN_YAW,
    role: "player",
  });
  if (ctx.player.isNew) {
    ctx.player.applyLoadout(ctx.player.userId, "starterKit");
    startCareer(ctx);
  }
  // Boot at the title screen (menu phase) so the shell's touch dock stays hidden;
  // `game.start` and a restored session flip it to `playing`.
  syncPhase(ctx);
  holdSavesUntil(ctx, resumeFromSave(ctx));
}

/** World seconds between document autosaves; the write itself is the ledger's own debounce. */
const DOCUMENT_AUTOSAVE_SEC = 3;
const lastDocumentSave = perContext(() => ({ at: 0 }));

function onTick(ctx: GameContext, dt: number): void {
  tickRadio(ctx, dt);
  if (startedStore.read(ctx) !== true || gamePhase(ctx) !== "playing" || dt <= 0) return;
  const docClock = lastDocumentSave(ctx);
  if (ctx.time.now() - docClock.at >= DOCUMENT_AUTOSAVE_SEC) {
    docClock.at = ctx.time.now();
    harborSave(ctx).touch();
  }
  handrollOf(ctx).tick(ctx, dt);
  tickTraffic(ctx, dt);
  tickResidents(ctx, dt);
  tickGangers(ctx, dt);
  tickCity(ctx, dt);
  tickBounties(ctx);
  tickStashes(ctx);
  tickRaceEconomy(ctx);
  tickBusted(ctx, dt);
  tickPedPanic(ctx, dt);
  ensureNightMarket(ctx);
  tickWasted(ctx);
  tickCourier(ctx, dt);
  tickGigs(ctx, dt);
}

function onDispose(ctx: GameContext): void {
  convoyFeedback(ctx).detach();
  disposeTraffic(ctx);
  disposeResidents(ctx);
  disposeWorld(ctx);
}

export const loop = { onInit, onNewPlayer, onTick, onDispose };