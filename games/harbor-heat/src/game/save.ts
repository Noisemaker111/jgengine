import { createGameSave, type GameSave, type GameSaveDocument, type GameSaveSystem } from "@jgengine/core/game/gameSave";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { StoreHandle } from "@jgengine/core/store/defineStore";
import type { SpawnDirectorState } from "@jgengine/core/ai/spawnDirector";
import type { SessionLoopState } from "@jgengine/core/run/sessionLoop";

import { handrollOf } from "./handroll";
import { harborProfileSystem } from "./menuProfile";
import { catchUpAway, noteSavedAt } from "./away";
import type { PursuitSave } from "./handroll/pursuit";
import { ledgerState, restoreLedger, resetLedger, type CashReason } from "./cash";
import { cargoStore } from "./items/cargoHaul";
import { courierLoopState, courierMissionStore, courierObjectiveStore, courierStore, restoreCourierLoop, type CourierState } from "./jobs/courier";
import { gigSave, resetGigs, restoreGigs } from "./jobs/gigs";
import {
  convoySnapshot,
  mission,
  missionStore,
  patchMission,
  restoreConvoy,
  type MissionState,
} from "./runState";

/** The document's own format version; bump it with {@link migrateHarborSave} when a section changes shape. */
export const HARBOR_SAVE_VERSION = 1;

/**
 * Where every stateful system Harbor Heat mounts keeps its state across a reload. The document holds
 * what the shell's whole-world snapshot cannot see - a primitive's own state (the heat curve and its
 * search area, the convoy director), the cash journal - and the run's own sections. A store that is
 * durable profile data stays in the world snapshot; a store that is a menu, a handle or a HUD mirror
 * is transient and says why. `save.test.ts` fails when a store the game defines is in none of them,
 * which is the invariant engine #2243 asks for.
 */
export type SystemPolicy = "document" | "world-snapshot" | "transient";

export const STORE_POLICY: Readonly<Record<string, { kind: SystemPolicy; reason: string }>> = {
  "harbor.wanted": {
    kind: "document",
    reason: "HUD mirror of the pursuit primitive; the wanted section is the authority and republishes it.",
  },
  "harbor.mission": {
    kind: "document",
    reason: "Run clocks (busted hold, race settlement) ride the run section.",
  },
  "harbor.world": {
    kind: "world-snapshot",
    reason: "The city's world model: every person, place and faction fact, job status and the live job mission.",
  },
  "harbor.courier": {
    kind: "document",
    reason: "The parcel's phase, route, deadline and condition are the run's contract state.",
  },
  "harbor.courier.mission": {
    kind: "document",
    reason: "The engine mission's own snapshot for the parcel mission is restored with the run.",
  },
  "harbor.courier.objective": {
    kind: "document",
    reason: "The objective line the parcel's mission machine last published rides with it.",
  },
  "harbor.gigs": {
    kind: "document",
    reason: "HUD mirror of the side-job board; the run section carries the board and the taxi light.",
  },
  "harbor.cargo": {
    kind: "document",
    reason: "Contraband loaded in the parcel is carried by the run section, not the profile.",
  },
  "harbor.safehouse": { kind: "world-snapshot", reason: "Durable ownership the shell's world snapshot already keeps." },
  "harbor.stored": { kind: "world-snapshot", reason: "Cars parked in Sunset Motors' bay are durable profile progress." },
  "harbor.bestRace": { kind: "world-snapshot", reason: "A durable lap record the world snapshot already keeps." },
  "harbor.stashes": { kind: "world-snapshot", reason: "Which stashes are claimed is durable profile progress." },
  "harbor.bounty": { kind: "world-snapshot", reason: "The bounty board's progress is durable profile progress." },
  "harbor.residentAgents": {
    kind: "world-snapshot",
    reason: "Each resident's needs, mood and held action are durable profile progress the world snapshot keeps.",
  },
  "harbor.residentBoard": { kind: "transient", reason: "The resident card is a HUD mirror rebuilt from the agents each tick." },
  "harbor.phone": { kind: "transient", reason: "Whether the phone is out is a menu, not run state." },
  "harbor.shop": { kind: "transient", reason: "Which shop panel is open is a menu, not run state." },
  "harbor.garage": { kind: "transient", reason: "Which garage panel is open is a menu, not run state." },
  "harbor.market": { kind: "transient", reason: "The night market's stock re-rolls from a daily seed each boot." },
  "harbor.race": { kind: "transient", reason: "A lap in progress does not survive; the start line runs it again." },
  "harbor.driving": { kind: "transient", reason: "Which car is piloted is a live handle, not saved state." },
  "harbor.started": { kind: "transient", reason: "The title gate resets each boot so a reload lands on the menu." },
  "harbor.slot": { kind: "transient", reason: "The selected hotbar slot resets to the first slot each boot." },
  "harbor.radio": { kind: "transient", reason: "The in-car display is a HUD mirror the radio rebuilds every tick." },
  "harbor.continue": { kind: "transient", reason: "Whether Continue shows is derived from the loaded save itself." },
  "harbor.upgrades": { kind: "world-snapshot", reason: "Car mods, gun work and bungalow rooms bought are durable profile progress." },
  "harbor.house": { kind: "transient", reason: "Whether the bungalow board is open is a menu, not run state." },
  "harbor.away": { kind: "transient", reason: "The morning paper on screen is a menu; the catch-up already landed in the world." },
};

/** True for a store key this game defines, for the test that keeps the policy table honest. */
export function isKnownStore(key: string): boolean {
  return STORE_POLICY[key] !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPursuitSave(value: unknown): value is PursuitSave {
  return isRecord(value) && isRecord(value.police) && typeof (value.police as { heat?: unknown }).heat === "object";
}

function isMissionSave(value: unknown): value is MissionState {
  return isRecord(value) && typeof value.bustedHold === "number";
}

function isCourierSave(value: unknown): value is CourierState {
  return isRecord(value) && typeof value.phase === "string" && typeof value.route === "number";
}

function isLedgerShape(value: unknown): boolean {
  return isRecord(value) && isRecord(value.accounts) && Array.isArray(value.entries);
}

/** Heat and the pursuit's own clocks - what the world snapshot could never see. */
function wantedSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "wanted",
    snapshot: () => handrollOf(ctx).pursuitSave(),
    restore(section) {
      if (!isPursuitSave(section)) return;
      handrollOf(ctx).restorePursuit(ctx, section);
    },
    reset() {
      handrollOf(ctx).clearWanted(ctx);
    },
  };
}

/** The convoy director: wave, alert, budget and the spawn counters it escalates on. */
function convoySystem(ctx: GameContext): GameSaveSystem<SpawnDirectorState | null> {
  return {
    name: "convoy",
    snapshot: () => convoySnapshot(ctx),
    restore(section) {
      if (!isRecord(section) || typeof section.wave !== "number") return;
      restoreConvoy(ctx, section as unknown as SpawnDirectorState);
    },
  };
}

/** The run: mission flags, the parcel, the mission machine behind it and what it is carrying. */
function runSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "run",
    snapshot: () => ({
      mission: mission(ctx),
      courier: courierStore.peek(ctx) ?? null,
      // The mission session's own state: which contract is open and how many have closed.
      courierSession: courierLoopState(ctx),
      courierMission: courierMissionStore.peek(ctx) ?? null,
      courierObjective: courierObjectiveStore.peek(ctx) ?? null,
      cargo: cargoStore.peek(ctx) ?? null,
      gigs: gigSave(ctx),
    }),
    restore(section) {
      if (!isRecord(section)) return;
      if (isMissionSave(section.mission)) patchMission(ctx, section.mission);
      if (isCourierSave(section.courier)) courierStore.write(ctx, section.courier);
      if (isRecord(section.courierSession)) restoreCourierLoop(ctx, section.courierSession as unknown as SessionLoopState);
      restoreNullable(courierMissionStore, ctx, section.courierMission);
      restoreNullable(courierObjectiveStore, ctx, section.courierObjective);
      restoreNullable(cargoStore, ctx, section.cargo);
      restoreGigs(ctx, section.gigs);
    },
    reset() {
      patchMission(ctx, { bustedHold: 0, raceSettled: false, raceClearAt: 0 });
      restoreCourierLoop(ctx, { session: 0, closed: 0, carried: 0, optionId: null });
      courierStore.clear(ctx);
      courierMissionStore.clear(ctx);
      courierObjectiveStore.clear(ctx);
      cargoStore.clear(ctx);
      resetGigs(ctx);
    },
  };
}

/** Write a section value back, or clear the slot when the document holds nothing for it. */
function restoreNullable<T>(store: StoreHandle<T | null>, ctx: GameContext, value: unknown): void {
  if (value === null || value === undefined) store.clear(ctx);
  else store.write(ctx, value as T | null);
}

/** Crash bodywork on the cars a reload still has: zone stages, and the handling they cost. */
function vehiclesSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "vehicles",
    snapshot: () => handrollOf(ctx).vehicleDamageSave(ctx),
    restore(section) {
      if (!isRecord(section)) return;
      handrollOf(ctx).restoreVehicleDamage(ctx, section as never);
    },
  };
}

/** The cash journal: the wallet is the balance, this section is the reason behind it. */
function cashSystem(ctx: GameContext): GameSaveSystem {
  return {
    name: "cash",
    snapshot: () => ledgerState(ctx),
    restore(section) {
      if (!isLedgerShape(section)) return;
      restoreLedger(ctx, section as never);
    },
    reset() {
      resetLedger(ctx);
    },
  };
}

/**
 * Upgrade a stored document to the current shape. Version 0 is a document written before the version
 * field existed (a bare system bag), and a pre-document save has no game section at all - that boot
 * falls back to the heat the world snapshot's `harbor.wanted` store already restored.
 */
export function migrateHarborSave(document: unknown, fromVersion: number): GameSaveDocument {
  const base = isRecord(document) ? document : {};
  if (fromVersion >= HARBOR_SAVE_VERSION) return base as unknown as GameSaveDocument;
  return {
    version: HARBOR_SAVE_VERSION,
    game: "harbor-heat",
    savedAt: typeof base.savedAt === "number" ? base.savedAt : 0,
    time: typeof base.time === "number" ? base.time : 0,
    playtime: typeof base.playtime === "number" ? base.playtime : 0,
    rng: (base.rng as GameSaveDocument["rng"]) ?? null,
    systems: isRecord(base.systems) ? (base.systems as Record<string, unknown>) : {},
  };
}

/** The game's document, one per context, writing beside the world snapshot. */
export function createHarborSave(ctx: GameContext, options: { backend?: SaveBackend; slot?: string } = {}): GameSave {
  return createGameSave({
    backend: options.backend ?? localSaveBackend(),
    game: "harbor-heat",
    slot: options.slot ?? ctx.game.save?.slot() ?? "default",
    version: HARBOR_SAVE_VERSION,
    migrate: migrateHarborSave,
    clock: () => ctx.time.now(),
    playtime: () => ctx.time.now(),
    // Play touches the document every few seconds; with autosave off, a touch only marked the
    // in-memory copy dirty and the file was never written, so a reload mid-pursuit lost heat and the
    // convoy's wave while the world snapshot kept cash and quests. A zero debounce flushes each touch.
    autosave: { debounceMs: 0 },
    systems: [wantedSystem(ctx), convoySystem(ctx), runSystem(ctx), vehiclesSystem(ctx), cashSystem(ctx), harborProfileSystem()],
    devtoolsName: "harbor.save",
  });
}

const boundSave = perContext(() => ({ save: null as GameSave | null }));

/** This context's document; play writes it to local storage beside the world snapshot. */
export function harborSave(ctx: GameContext): GameSave {
  const slot = boundSave(ctx);
  if (slot.save === null) slot.save = createHarborSave(ctx);
  return slot.save;
}

/**
 * Point this context's document at another save - a test's memory backend, a cloud one. The world
 * snapshot takes its backend from the shell, which does not expose it, so the document names its own.
 */
export function bindHarborSave(ctx: GameContext, save: GameSave): void {
  boundSave(ctx).save = save;
}

/**
 * Apply the document only when it holds a wanted section. A save written before this document existed
 * still boots through the world snapshot, and its heat is adopted from the `harbor.wanted` store once
 * so the player does not lose a pursuit to the upgrade. Returns whether live state was applied.
 */
export async function loadHarborSave(ctx: GameContext): Promise<boolean> {
  const save = harborSave(ctx);
  const document = await save.peek(save.slot());
  if (document === null) return adoptLegacyWanted(ctx);
  if (document.systems.wanted === undefined) return adoptLegacyWanted(ctx);
  await save.load();
  noteSavedAt(ctx, document.savedAt);
  catchUpAway(ctx);
  return true;
}

/** Seed the wanted section from the world snapshot's HUD mirror, once, then keep it as the authority. */
function adoptLegacyWanted(ctx: GameContext): boolean {
  const stored = wantedStoreValue(ctx);
  if (stored === null || stored.heat <= 0) return false;
  const handroll = handrollOf(ctx);
  const delta = stored.heat - handroll.wanted().heat;
  if (delta > 0) handroll.addHeat(ctx, delta);
  void harborSave(ctx).save();
  return true;
}

function wantedStoreValue(ctx: GameContext): { heat: number } | null {
  const raw = ctx.game.store.get("harbor.wanted") as unknown;
  if (!isRecord(raw) || typeof raw.heat !== "number") return null;
  return { heat: raw.heat };
}

/**
 * A save point can be reached on the same tick as the boot restore (a capture boot, a resumed
 * checkpoint). The engine's `load()` writes the store's current value while it reads, so a save that
 * overtakes it persists an empty snapshot; every save waits for the boot restore to settle first.
 */
const bootGate = perContext(() => ({ settled: Promise.resolve() as Promise<void> }));

export function holdSavesUntil(ctx: GameContext, settled: Promise<void>): void {
  bootGate(ctx).settled = settled;
}

/** Write both halves of a checkpoint: the world snapshot is the engine's, this document is the run's. */
export async function saveHarborState(ctx: GameContext): Promise<void> {
  await bootGate(ctx).settled;
  await ctx.game.save?.save();
  await harborSave(ctx).save();
}

/** A digest over the systems this document owns, for a determinism test or a diff between builds. */
export function harborSaveDigest(ctx: GameContext, backend?: SaveBackend): string {
  return backend === undefined ? harborSave(ctx).digest() : createHarborSave(ctx, { backend }).digest();
}

/** Reason a run system's section exists, for the PR and the doc comment above. */
export const RUN_SECTION_REASON: Record<string, CashReason | string> = {
  wanted: "engine #2243 tracks the general gap: a mounted primitive's state had no saved section",
};

