import { createGameSave, type GameSave, type GameSaveSystem } from "@jgengine/core/game/gameSave";
import { localSaveBackend } from "@jgengine/core/game/saveStore";
import { createSaveSlots, type SaveSlots } from "@jgengine/core/game/saveSlots";
import { gameSaveSlotSource, refreshSaveSlots, type SaveSlotsRefresh } from "@jgengine/core/game/saveSlotIndex";
import type { PathFollowState } from "@jgengine/core/nav/pathFollow";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import type { WorldFactValue, WorldModelState } from "@jgengine/core/worldModel/worldModel";

import { BASE_CATALOG_ID, BASE_ENTITY_ID } from "./entities/base/catalog";
import { creepDef } from "./entities/enemies/catalog";
import { resetProjectiles } from "./combat/pendingProjectiles";
import { keep, resetKeep, spawnStandingTowers } from "./keep";
import { newShield, newSpeedStats, resetSession, session, type BossRuntime } from "./session";
import { freshLegacy, openingKeep, readLegacy, relicLoop, upgradeLegacy, writeLegacy } from "./waves/legacy";
import { campaign, freshCampaign, readCampaign } from "./campaign";
import type { AbilityKitState } from "@jgengine/core/combat/abilityKit";
import type { WaveCountdownState } from "@jgengine/core/ai/director/waveCountdown";
import { WARDEN_ID } from "./waves/manifest";
import type { EncounterState } from "@jgengine/core/ai/director/encounter";
import type { PressurePlan } from "@jgengine/core/ai/director/pressure";
import { KEEP_POINT, ROUTES, SPAWN_POINT_KEY } from "./world/path";
import { captureKeepThumb, keepProfile } from "./thumbs";

/** The keeps a player can hold. One document per keep, all inside the shared save document. */
export const KEEP_SLOTS = ["keep", "ward", "beacon"] as const;
export const KEEP_LABEL: Record<string, string> = { keep: "The Keep", ward: "The Ward", beacon: "The Beacon" };

/** A document written before the keep was a world: its purse, walls and wave flags sat in this section. */
interface PreWorldFields {
  gold?: number;
  lives?: number;
  waveReady?: boolean;
  waveStarted?: boolean;
  lastWaveBonus?: number;
  bountyEarned?: number;
  banked?: boolean;
  gameOver?: boolean;
  victory?: boolean;
}

/**
 * The real-time half of a run as the save document stores it: the clock, the wave director, the
 * Warden and every raider mid-route. Gold, lives, plots, towers and builds are the `world` section.
 */
export interface DefenseSave extends PreWorldFields {
  clock: ClockSnapshot;
  encounter: EncounterState;
  pressure: PressurePlan;
  boss: BossRuntime | null;
  openingComposition: string[];
  creepSeq: number;
  creeps: { instanceId: string; catalogId: string; path: PathFollowState; route?: string; shield?: number; healIn?: number }[];
  /** The clock to the next wave and what an early call would pay. */
  countdown?: WaveCountdownState;
  /** Ability cooldowns. */
  abilities?: AbilityKitState;
}

export function captureDefense(ctx: GameContext): DefenseSave {
  return {
    clock: ctx.time.snapshot(),
    encounter: session.encounter.snapshot(),
    pressure: { ...session.pressure },
    boss: session.boss === null ? null : { instanceId: session.boss.instanceId, unitId: session.boss.unitId, state: { ...session.boss.state }, stance: session.boss.stance },
    openingComposition: [...session.openingComposition],
    creepSeq: session.creepSeq,
    creeps: [...session.creeps.values()].map((creep) => ({
      instanceId: creep.instanceId,
      catalogId: creep.catalogId,
      path: creep.path,
      route: creep.route,
      shield: creep.shield?.current() ?? 0,
      healIn: creep.healIn,
    })),
    countdown: session.countdown.snapshot(),
    abilities: session.abilities.state(),
  };
}

/** Whether this load restored a keep world, or a pre-world document left the keep fresh. */
const worldLoaded = perContext(() => ({ restored: false }));

/**
 * Put a stored run back on the live world: the same raiders on the same stretch of route. Active frost
 * slows ride on a 1.6 s stat modifier, so they restart from clean. A pre-world document carries its
 * purse, walls and wave flags here; they move into the fresh keep, and its towers are not kept.
 */
export function restoreDefense(ctx: GameContext, save: DefenseSave): void {
  ctx.time.hydrate(save.clock);
  for (const id of [...session.creeps.keys(), BASE_ENTITY_ID]) ctx.scene.entity.despawn(id);
  resetSession();
  resetProjectiles();

  session.encounter.restore(save.encounter);
  session.pressure = { ...save.pressure };
  session.boss = save.boss === null ? null : {
    instanceId: save.boss.instanceId,
    unitId: save.boss.unitId ?? WARDEN_ID,
    state: { ...save.boss.state },
    stance: save.boss.stance,
  };
  session.openingComposition = [...save.openingComposition];
  session.creepSeq = save.creepSeq;

  ctx.scene.entity.spawn(BASE_CATALOG_ID, { id: BASE_ENTITY_ID, position: KEEP_POINT, role: "prop" });
  if (!worldLoaded(ctx).restored) migratePreWorld(ctx, save);

  if (save.countdown !== undefined) session.countdown.restore(save.countdown);
  if (save.abilities !== undefined) session.abilities.restore(save.abilities);
  for (const creep of save.creeps) {
    const def = creepDef(creep.catalogId);
    ctx.scene.entity.spawn(creep.catalogId, { id: creep.instanceId, position: creep.path.position, role: "npc" });
    ctx.scene.entity.setPose(creep.instanceId, { position: creep.path.position, rotationY: creep.path.heading });
    const route = typeof creep.route === "string" && ROUTES[creep.route] !== undefined ? creep.route : SPAWN_POINT_KEY;
    const shield = def.shield === undefined ? null : newShield(ctx, creep.instanceId, def.shield);
    if (shield !== null) ctx.scene.entity.stats.set(creep.instanceId, "shield", { current: Math.max(0, Math.min(def.shield!.max, creep.shield ?? def.shield!.max)) });
    session.creeps.set(creep.instanceId, {
      instanceId: creep.instanceId,
      catalogId: creep.catalogId,
      route,
      path: { ...creep.path },
      speedStats: newSpeedStats(def.speed),
      shield,
      healIn: creep.healIn ?? def.heals?.everySeconds ?? 0,
    });
  }
}

function migratePreWorld(ctx: GameContext, save: PreWorldFields): void {
  const world = keep.of(ctx);
  const facts: [string, WorldFactValue | undefined][] = [
    ["keep.gold", save.gold],
    ["keep.lives", save.lives],
    ["keep.wave_ready", save.waveReady],
    ["keep.wave_started", save.waveStarted],
    ["keep.last_bonus", save.lastWaveBonus],
    ["keep.bounty_earned", save.bountyEarned],
    ["keep.banked", save.banked],
    ["keep.fallen", save.gameOver],
    ["keep.held", save.victory],
  ];
  for (const [key, value] of facts) if (value !== undefined && typeof value === typeof world.fact(key)) world.set(key, value);
  world.set("keep.wave", session.encounter.view().wave);
}

const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const waypoint = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(number);

/** A document this build can actually restore, rather than a half-applied world. */
export function validDefenseSave(value: unknown): value is DefenseSave {
  if (typeof value !== "object" || value === null) return false;
  const save = value as DefenseSave;
  return (
    typeof save.clock === "object" && save.clock !== null && number(save.clock.now) &&
    typeof save.encounter === "object" && save.encounter !== null && Number.isSafeInteger(save.encounter.wave) &&
    typeof save.pressure === "object" && save.pressure !== null && Number.isSafeInteger(save.pressure.tier) &&
    Array.isArray(save.openingComposition) && Number.isSafeInteger(save.creepSeq) &&
    Array.isArray(save.creeps) && save.creeps.every((creep) =>
      typeof creep?.instanceId === "string" && typeof creep.catalogId === "string" &&
      typeof creep.path === "object" && creep.path !== null && waypoint(creep.path.position) && number(creep.path.target) &&
      number(creep.path.heading) && typeof creep.path.done === "boolean" && number(creep.path.distanceTravelled))
  );
}

/**
 * A stored keep world this build can run: facts, a clock and a log, with every tower a kind and plot
 * this declaration still has. Anything else falls back to a fresh keep instead of a half-built field.
 */
export function validWorldSave(value: unknown): value is WorldModelState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as WorldModelState;
  if (!number(state.time) || typeof state.facts !== "object" || state.facts === null || !Array.isArray(state.log)) return false;
  if (!number(state.facts["keep.gold"]) || !number(state.facts["keep.lives"])) return false;
  const plots = new Set(Object.keys(keep.def.slots?.plot ?? {}));
  return Object.values(state.instances ?? {}).every((tower) =>
    typeof tower === "object" && tower !== null && keep.def.kinds?.[tower.kind] !== undefined &&
    typeof tower.slot === "string" && plots.has(tower.slot) && typeof tower.ready === "boolean");
}

const boundSave = perContext(() => ({ save: null as GameSave | null }));

/** The keep's world as one save section: purse, walls, towers and their levels, builds under way. */
export function worldSystem(ctx: GameContext): GameSaveSystem {
  const freshKeep = () => {
    resetKeep(ctx, openingKeep(ctx));
    worldLoaded(ctx).restored = false;
  };
  return {
    name: "world",
    snapshot: () => keep.of(ctx).snapshot(),
    restore: (section) => {
      if (!validWorldSave(section)) return freshKeep();
      for (const tower of keep.of(ctx).instances()) ctx.scene.entity.despawn(tower.id);
      keep.of(ctx).restore(section);
      spawnStandingTowers(ctx);
      worldLoaded(ctx).restored = true;
    },
    reset: freshKeep,
  };
}

/** The run's real-time half, as one save section: the director, the raiders on the road and the Warden. */
export function defenseSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "defense",
    snapshot: () => captureDefense(ctx),
    restore: (section) => {
      if (validDefenseSave(section)) restoreDefense(ctx, section);
    },
    reset: () => {
      for (const id of session.creeps.keys()) ctx.scene.entity.despawn(id);
      resetSession();
      resetProjectiles();
    },
  };
}

/**
 * What the keep has banked, as its own section: a new defense clears the field but not what the last
 * one left behind, and an empty keep resets it to nothing banked.
 */
/** The frame the keep was left in - a save card shows it. */
export function profileSystem(): GameSaveSystem {
  return {
    name: "profile",
    snapshot: () => ({ commander: keepProfile.commander, thumbnail: keepProfile.thumbnail }),
    restore: (next) => {
      const value = next as { commander?: string | null; thumbnail?: string | null };
      keepProfile.commander = typeof value.commander === "string" ? value.commander : null;
      keepProfile.thumbnail = typeof value.thumbnail === "string" ? value.thumbnail : null;
    },
    reset: () => {
      keepProfile.commander = null;
      keepProfile.thumbnail = null;
    },
  };
}

/** The keep's campaign: its difficulty, best stars and the war council's seats. */
export function campaignSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "campaign",
    snapshot: () => campaign.read(ctx),
    restore: (section) => campaign.write(ctx, readCampaign(section) ?? freshCampaign()),
    reset: () => campaign.write(ctx, freshCampaign()),
  };
}

export function legacySystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "legacy",
    // The engine loop is the owner of the run in progress, so the section carries its own state.
    snapshot: () => ({ ...readLegacy(ctx), run: relicLoop(ctx).snapshot() }),
    restore: (section) => {
      const stored = upgradeLegacy(section);
      if (stored !== null) writeLegacy(ctx, stored);
    },
    reset: () => writeLegacy(ctx, freshLegacy()),
  };
}

/** The one save document for this run's world; the store keys it by context. */
export function beaconSave(ctx: GameContext): GameSave {
  const slot = boundSave(ctx);
  if (slot.save !== null) return slot.save;
  const save = createGameSave({
    backend: localSaveBackend(),
    game: "beacon-bastion",
    slot: KEEP_SLOTS[0],
    clock: () => ctx.time.now(),
    playtime: () => ctx.time.now(),
    // The bank first, so a keep with no stored world opens with the purse that bank allows.
    systems: [campaignSystem(ctx), legacySystem(ctx), worldSystem(ctx), defenseSystem(ctx), profileSystem()],
  });
  slot.save = save;
  return save;
}

/** The save-select index the menus render — filled from the documents, never from a flag. */
export const beaconSlots: SaveSlots = createSaveSlots({
  capacity: KEEP_SLOTS.length,
  slots: KEEP_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/** Re-read every keep's document into the menu index. `savedAt` and playtime come from the document. */
export function refreshBeaconSlots(ctx: GameContext): Promise<SaveSlotsRefresh> {
  return refreshSaveSlots(gameSaveSlotSource(beaconSave(ctx)), beaconSlots, {
    nameOf: (slot, document) => {
      const profile = (document.systems.profile ?? {}) as { commander?: string | null };
      if (typeof profile.commander === "string" && profile.commander.length > 0) return profile.commander;
      const defense = document.systems.defense;
      const wave = validDefenseSave(defense) ? defense.encounter.wave + 1 : 1;
      return `${KEEP_LABEL[slot] ?? slot} · wave ${wave}`;
    },
    metaOf: (_slot, document): Record<string, string | number> => {
      const defense = document.systems.defense;
      if (!validDefenseSave(defense)) return {};
      const thumb = (document.systems.profile ?? {}) as { commander?: string | null; thumbnail?: string | null };
      const world = document.systems.world;
      const facts = validWorldSave(world) ? world.facts : { "keep.gold": defense.gold ?? 0, "keep.lives": defense.lives ?? 0 };
      return {
        ...(typeof thumb.commander === "string" && thumb.commander.length > 0 ? { character: thumb.commander } : {}),
        gold: Number(facts["keep.gold"] ?? 0),
        lives: Number(facts["keep.lives"] ?? 0),
        wave: defense.encounter.wave + 1,
        ...(typeof thumb.thumbnail === "string" && thumb.thumbnail.length > 0 ? { thumbnail: thumb.thumbnail } : {}),
      };
    },
  });
}

/** Keep a run under a specific keep: switch the document to it, then write the live state. */
export async function saveToSlot(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  await captureKeepThumb();
  if (save.slot() !== slot) await save.switchSlot(slot);
  await save.save();
  await refreshBeaconSlots(ctx);
}

/** Read a keep back into the live world without saving over it first. */
export async function loadSlot(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  if (save.slot() === slot) {
    await save.load();
  } else {
    await save.switchSlot(slot);
  }
}

export function firstEmptyKeep(): string | null {
  const empty = beaconSlots.list().find((slot) => slot.empty);
  return empty?.id ?? null;
}

/** Where a new defense goes: an empty keep, or the oldest one when every keep is already held. */
export function keepForNewRun(): string | null {
  const empty = firstEmptyKeep();
  if (empty !== null) return empty;
  const held = beaconSlots.list()
    .filter((slot) => !slot.empty)
    .sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? null;
}

/** The keep `Continue` resumes — the newest document, not a remembered flag. */
export function newestKeep(): string | null {
  return beaconSlots.mostRecent()?.id ?? null;
}

/** Draft a fresh run into a keep: the run that follows is saved under that keep. */
export async function prepareKeep(ctx: GameContext, slot: string): Promise<void> {
  const save = beaconSave(ctx);
  // Switching only loads documents; a fresh run overwrites nothing until it saves.
  if (save.slot() !== slot) await save.switchSlot(slot);
}


