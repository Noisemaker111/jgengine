import { earn, openBooks, spend } from "./game/cash";
import { loadSavedProgress } from "./game/saveCompatibility";
import { armWorldSave, followWorldSave, loadScrapSave, saveScrapState, scrapSave } from "./game/save";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { registerRelay, relayEnemyDied, tickRelay } from "./game/relay";
import { noteMastKill, registerMastWatch, restoreMastWatch, tickMastWatch } from "./game/mast";
import { activeCharacter, talentTree } from "./game/characters";
import { perContext } from "@jgengine/core/runtime/perContext";
import { registerCommands, resumeBuild } from "./game/commands";
import { settleBootPhase } from "./game/bootPhase";
import { resetCombat, syncCombatTargets, tickCombat } from "./game/combat/hitModel";
import { registerPerks } from "./game/combat/gunPerks";
import { startAmbience, tickAudio } from "./game/audio/drive";
import { noteEquipped, noteGameNow, noteLevelUp, notePlayerHealth } from "./game/feel";
import { tickEnemies } from "./game/entities/enemies/ai";
import { tickFront } from "./game/encounters/front";
import { loseRift, registerRift, riftLootFor, riftShieldRegen, tickRift } from "./game/rift/rift";
import { enemyById, levelXpFor } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { playerDef } from "./game/entities/players/catalog";
import {
  enterDowned,
  gunById,
  reservePhase,
  markRespawned,
  respawnFee,
  rollGun,
  powerSurge,
  syncReserve,
  tickDots,
  tickDowned,
  tickReloads,
  tickShields,
} from "./game/handroll";
import { itemUseHandlers } from "./game/items/use-handlers";
import { ammoPackFor, ammoRollsFor } from "./game/items/ammoDrops";
import { grantXp } from "./game/progression/curves";
import { noteKill, noteZone } from "./game/progression/discovery";
import { grantLevelUnlocks, rarityCapFor, zoneOpen } from "./game/progression/unlocks";
import { NPCS, quests, zoneOpener } from "./game/quests/catalog";
import { creditObjective, npcDialogStore, reconcileQuestWorld, settleRadioQuests } from "./game/quests/givers";
import { session } from "./game/session";
import { SCRAP_SLOTS } from "./game/scrapSlots";
import {
  currentZoneStore,
  discoveredStationsStore,
  reactorOpenStore,
  selectedSlotStore,
  speechStore,
} from "./game/stores";
import { TRAVEL_STATIONS, zoneAt, zoneLevelAt } from "./game/world/sites";
import { PLAYER_SPAWN, PLAYER_SPAWN_YAW, respawnClusters, setupWorld } from "./game/world/setup";

const dropRng = seededRng("scrap-gun-drops");
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
  // An Overdrive fighter drops at the run's loot level and luck, and its Foreman always pays out.
  const rift = riftLootFor(ctx, event.instanceId);
  const legendaries = guaranteed + (rift?.legendary === true ? 1 : 0);
  const rolls = legendaries + (rift?.boss === true && !rift.legendary ? 1 : 0) + (dropRng() < def.gunDropChance ? 1 : 0);
  if (rolls === 0) return;
  const baseLevel = rift?.lootLevel ?? zoneLevelAt(anchor[0], anchor[2]);
  const level = Math.max(1, baseLevel + Math.floor(dropRng() * 3) - 1);
  const maxRarity = rarityCapFor(ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1);
  for (let index = 0; index < rolls; index += 1) {
    const gun = rollGun(dropRng, level, {
      luck: def.gunLuck * (rift?.luck ?? 1),
      maxRarity,
      ...(index < legendaries ? { rarity: "legendary" as const } : {}),
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

function dropAmmoAt(ctx: GameContext, event: EntityDiedEvent, anchor: readonly [number, number, number]): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  const packs = ammoRollsFor(def, dropRng());
  for (let index = 0; index < packs; index += 1) {
    const itemId = ammoPackFor(ctx);
    if (itemId === null) return;
    ctx.scene.worldItem.spawn({
      itemId,
      position: [anchor[0] + (dropRng() - 0.5) * 2.4, anchor[1], anchor[2] + (dropRng() - 0.5) * 2.4],
      source: "kill",
    });
  }
}

function grantCores(ctx: GameContext, event: EntityDiedEvent): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  let amount = 0;
  if (def.id === "foundry_heart") amount = 20;
  else if (def.family === "boss") amount = 8;
  else if (def.elite) amount = 1 + Math.floor(dropRng() * 3);
  if (amount === 0) return;
  earn(ctx, "cores", amount, "kill-cores", def.id);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${amount} CORES`, kind: "pickup" });
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  relayEnemyDied(ctx, event);
  const userId = ctx.player.userId;
  if (event.instanceId === userId) return;
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  const deathAt = deathAnchor(ctx, event);
  ctx.game.audio.play("enemy_die", deathAt);
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === userId) {
    const anchor = deathAt;
    noteKill(ctx, event.catalogId);
    if (event.reason.via?.item !== undefined) {
      const family = gunById(event.reason.via.item)?.family;
      if (family !== undefined) noteMastKill(ctx, event.catalogId, userId, family);
    }
    grantXp(ctx, userId, levelXpFor(enemy.xp, riftLootFor(ctx, event.instanceId)?.level ?? zoneLevelAt(anchor[0], anchor[2])));
    grantCores(ctx, event);
    if (enemy.id === "foundry_heart") {
      reactorOpenStore.write(ctx, { atMs: ctx.time.now() * 1000 });
      dropGunAt(ctx, event, anchor, 3);
    } else {
      dropGunAt(ctx, event, anchor);
    }
    dropAmmoAt(ctx, event, anchor);
    if (reservePhase(ctx) === "downed") {
      powerSurge(ctx);
      ctx.scene.entity.update(userId, { movement: { walkSpeed: playerDef.walkSpeed } });
      ctx.scene.entity.floatText({ instanceId: userId, text: "POWER SURGE!", kind: "pickup" });
    }
  }
}

function onLevelUp(ctx: GameContext, userId: string): void {
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    ctx.scene.entity.stats.set(userId, "health", { max: health.max + 8 });
    ctx.scene.entity.stats.delta(userId, "health", health.max + 8);
  }
  const tree = talentTree();
  if (tree !== null) {
    tree.grantPoints(1);
    ctx.scene.entity.stats.set(userId, "skillPoints", { current: tree.pointsAvailable() });
  } else {
    ctx.scene.entity.stats.delta(userId, "skillPoints", 1);
  }
  noteLevelUp(ctx.time.now() * 1000);
  ctx.game.audio.play("levelup");
  ctx.scene.entity.floatText({ instanceId: userId, text: "LEVEL UP! +1 SKILL POINT", kind: "pickup" });
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  for (const opened of grantLevelUnlocks(ctx, level)) {
    ctx.game.notices.push({ text: `Unlocked: ${opened}`, tone: "success" });
  }
}

function nearestDiscoveredStation(ctx: GameContext): { x: number; z: number } {
  const discovered = discoveredStationsStore.read(ctx);
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
  const fee = respawnFee(cash);
  if (fee > 0) spend(ctx, "cash", fee, "respawn-fee");
  const station = nearestDiscoveredStation(ctx);
  const y = ctx.world.groundHeightAt(station.x, station.z);
  ctx.scene.entity.update(userId, {
    position: [station.x, y, station.z],
    movement: { walkSpeed: playerDef.walkSpeed },
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

function tickReserve(ctx: GameContext, dt: number): void {
  const userId = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health === null) return;
  if (reservePhase(ctx) === "alive" && health.current <= (health.min ?? 1)) {
    enterDowned(ctx);
    ctx.scene.entity.update(userId, { movement: { walkSpeed: DOWNED_WALK_SPEED } });
  }
  // The shared state owns the countdown; its `died` event is the game's cue to pay the fee.
  for (const event of tickDowned(ctx, dt)) {
    if (event.kind === "died") {
      loseRift(ctx, "the reserve ran dry");
      respawnAtNewU(ctx);
    }
  }
  syncReserve(ctx);
}

/** The last spot the player stood outside every closed zone: where a closed road turns them back to. */
const openGround = perContext((): { at: readonly [number, number, number] | null; warnedAtMs: number } => ({ at: null, warnedAtMs: -Infinity }));

/** Turn the player back at the edge of a zone the story has not opened. Returns whether they were turned. */
function holdAtClosedZone(ctx: GameContext, nowMs: number): boolean {
  const userId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(userId);
  if (playerEntity === null) return false;
  const ground = openGround(ctx);
  const zone = zoneAt(playerEntity.position[0], playerEntity.position[2]);
  if (zone === null || zoneOpen(ctx, zone.id)) {
    ground.at = playerEntity.position;
    return false;
  }
  if (ground.at !== null) ctx.scene.entity.update(userId, { position: ground.at });
  if (nowMs - ground.warnedAtMs > 3000) {
    ground.warnedAtMs = nowMs;
    const quest = zoneOpener(zone.id);
    ctx.scene.entity.floatText({
      instanceId: userId,
      text: `${zone.name.toUpperCase()} · LEVEL ${zone.level} · ${quest === undefined ? "CLOSED" : `OPENS WITH "${quest.title.toUpperCase()}"`}`,
      kind: "warn",
    });
  }
  return true;
}

function tickZoneAndStations(ctx: GameContext, nowMs: number): void {
  if (holdAtClosedZone(ctx, nowMs)) return;
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return;
  const [x, , z] = playerEntity.position;

  const zone = zoneAt(x, z);
  const currentZone = currentZoneStore.read(ctx);
  if (zone !== null && zone.id !== currentZone?.id) {
    currentZoneStore.write(ctx, { id: zone.id, name: zone.name, level: zone.level, atMs: nowMs });
    noteZone(ctx, zone.id);
    creditObjective(ctx, "reach", zone.id);
    void saveScrapState(ctx);
  }

  const discovered = discoveredStationsStore.read(ctx);
  for (const station of TRAVEL_STATIONS) {
    if (discovered.includes(station.zoneId)) continue;
    if (Math.hypot(x - station.x, z - station.z) <= STATION_DISCOVER_RADIUS) {
      discoveredStationsStore.write(ctx, [...discovered, station.zoneId]);
      ctx.scene.entity.floatText({
        instanceId: ctx.player.userId,
        text: `FAST TRAVEL DISCOVERED: ${station.name.toUpperCase()}`,
        kind: "pickup",
      });
      break;
    }
  }
}

/** A conversation ends when the player walks away from the one talking. */
function closeDistantDialog(ctx: GameContext): void {
  const open = npcDialogStore.read(ctx);
  if (open === null) return;
  const npc = ctx.scene.entity.get(NPCS[open.npc].entity);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (npc === null || player === null) return;
  if (Math.hypot(npc.position[0] - player.position[0], npc.position[2] - player.position[2]) > 6) npcDialogStore.clear(ctx);
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest!.register(quests);
  ctx.game.quest!.bind("entity.died");
  registerCommands(ctx);
  registerRelay(ctx, respawnAtNewU);
  registerMastWatch(ctx);
  registerPerks(ctx);
  registerRift(ctx);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("stat.levelUp", (event) => {
    if (event.stat === "level") onLevelUp(ctx, event.userId);
  });
  // A radio quest turns itself in the moment its last objective lands; the rest wait for their giver.
  ctx.game.events.on("quest.updated", () => settleRadioQuests(ctx));
  ctx.game.events.on("quest.completed", () => {
    void saveScrapState(ctx);
  });

  startAmbience(ctx);
  setupWorld(ctx);
  syncCombatTargets(ctx);
  // Mount the three boot-probed systems: the damage model (its devtools probe reports every hit), the
  // save document and the scrip journal. Each is per-context state that the world snapshot cannot see.
  // The document opens in the first kept-run bay, so a checkpoint is a slot the menu can list.
  void scrapSave(ctx, SCRAP_SLOTS[0].id);
  openBooks(ctx);
  // The world snapshot autosaves on the engine's trailing timer; this document mirrors each of those
  // writes, so a reload mid-run restores the loaded rounds, reserve and statuses from the same moment.
  followWorldSave(ctx);
  ctx.time.every(RESPAWN_SWEEP_SECONDS, () => respawnClusters(ctx));
}

function onNewPlayer(ctx: GameContext): void {
  setGamePhase(ctx, "menu");
  ctx.time.pause();
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn(playerDef.id, {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    rotationY: PLAYER_SPAWN_YAW,
    role: "player",
  });
  // Empty-handed: the start is declared in game.config's `newGame`, and Bolt hands out the first quest.
  resetCombat(ctx);
  syncCombatTargets(ctx);
  session.reset(ctx);
  noteEquipped(null);
  speechStore.write(ctx, { speaker: NPCS.bolt.name, line: "Hey! Over here, minion! You're alive! Come talk to me.", atMs: ctx.time.now() * 1000 });
  void resumeOrStart(ctx);
}

/**
 * The fresh spawn above is a baseline; the whole-world save decides what the boot *offers*. `load()`
 * restores every persisted subsystem (entities, stats, inventory, economy, quests, the character-id and
 * talent-rank stores) over that baseline, then `resumeBuild` re-derives the module-level character and
 * talent singletons so the restored run is ready to continue.
 *
 * A boot never resumes a run on its own: the saved phase is a fact about the document, not an
 * instruction to start, so the phase is `menu` whatever the snapshot said. Continue and New run are
 * the only ways out, and they are the player's (or a capture host's pick made while the save loaded).
 */
async function resumeOrStart(ctx: GameContext): Promise<void> {
  const worldLoaded = await loadSavedProgress(ctx);
  const systemsLoaded = worldLoaded ? await loadScrapSave(ctx) : false;
  // Both halves are on disk by now; from here the document follows every world autosave.
  armWorldSave(ctx);
  if (worldLoaded && (systemsLoaded || resumeBuild(ctx))) {
    if (!systemsLoaded) session.selectSlot(ctx, selectedSlotStore.read(ctx));
    noteEquipped(ctx.player.inventory.state("hotbar").slots[session.selectedSlot()]?.itemId ?? null);
    restoreMastWatch(ctx);
    reconcileQuestWorld(ctx);
    grantLevelUnlocks(ctx, ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1);
  }
  settleBootPhase(ctx);
}

/** One staged boot per session: the dev hook above must not re-wound a reconstructed chassis. */
const stagedReserve = perContext(() => ({ staged: false }));

/**
 * Dev-only staged boot: `?stage=downed` drops the chassis to its last point of health once a live
 * run exists, so the same proof of the Reserve window runs in a plain `bun run dev` app as in the
 * engine's `?state=downed` capture. Never shipped.
 */
function stageReserveForCapture(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  if (gamePhase(ctx) !== "playing") return;
  const staged = stagedReserve(ctx);
  if (staged.staged) return;
  if (new URLSearchParams(window.location.search).get("stage") !== "downed") return;
  if (ctx.scene.entity.stats.get(ctx.player.userId, "health") === null) return;
  staged.staged = true;
  // The same dev command the engine runner's `?state=downed` capture uses, so there is one stage.
  ctx.game.commands.run("reserve.capture", {});
}

function onTick(ctx: GameContext, dt: number): void {
  stageReserveForCapture(ctx);
  const nowMs = ctx.time.now() * 1000;
  noteGameNow(nowMs);
  if (activeCharacter() === null || gamePhase(ctx) !== "playing" || dt <= 0) return;
  tickAudio(ctx, nowMs);
  // The front runs first: it owns its fighters and writes the hearing map the zone AI reads.
  tickFront(ctx, dt);
  tickRift(ctx, dt);
  tickEnemies(ctx, dt);
  tickShields(ctx, nowMs, dt, riftShieldRegen(ctx));
  tickDots(ctx, dt);
  tickCombat(ctx, dt);
  tickReloads(ctx, dt);
  tickReserve(ctx, dt);
  tickRelay(ctx, dt);
  tickMastWatch(ctx, dt);
  tickZoneAndStations(ctx, nowMs);
  closeDistantDialog(ctx);
  notePlayerHealth(nowMs, ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? null);
}

export const loop = { onInit, onNewPlayer, onTick };








