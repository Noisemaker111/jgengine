import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import { isFiniteNumber, isRecord, typedRecord } from "@jgengine/core/data/untyped";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import type { RideSystemSnapshot } from "@jgengine/core/sim/rides";
import type { WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { rngStateOf, restoreRng } from "@jgengine/core/random/rng";
import { defaultKeyValueStorage } from "@jgengine/core/game/keyValueStore";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createGameSave, type GameSave, type GameSaveSystem } from "@jgengine/core/save/saveDocument";
import { localSaveBackend, type SaveBackend } from "@jgengine/core/save/saveStore";

import { syncAgentStates } from "./agents";
import { findBuildable } from "./objects/catalog";
import { GUEST_KINDS } from "./entities/guests/catalog";
import { LOT, park, sizeOf } from "./park";
import { spawnAll } from "./parkScene";
import { resetPark } from "./parkReset";
import { restoreRides, rideSnapshot } from "./rides";
import { GUEST_PHASES, session, type GuestPhase, type GuestState, type StaffState } from "./session";
import { restoreStaff } from "./staff";
import { guestFlowState, restoreGuestFlow } from "./sim/guests";
import { parkProfile } from "./parkProfile";
import { readScenariosWon } from "./scenarios";

/** The park's save document namespace. Brightway keeps one park, the `park` slot. */
export const SAVE_KEY = "brightway-park.save";
export const PARK_SLOT = "park";
/** The backend key the park's document is written to. */
export const PARK_ENTRY = `${SAVE_KEY}:${PARK_SLOT}`;
/** Where the park was written before the shared document; read once and rewritten as a document. */
export const LEGACY_SAVE_KEY = "brightway-park.save.v1";

/**
 * Where each store the park writes is kept. The engine's own save is off (`save: "none"`): the park
 * writes one shared save document to browser storage, and the world store goes into its `park`
 * section whole.
 */
export const STORE_POLICY: Readonly<Record<string, { kept: "park-save" | "session"; reason: string }>> = {
  // `park.store.key`; spelled out because this module loads inside park.ts's own import graph.
  "brightway.world": { kept: "park-save", reason: "the whole park - money, rating, structures, loan, scenario, crew orders - saved as `world`" },
  "park.reduced-motion": { kept: "session", reason: "a viewer setting read from browser storage at boot" },
};

/**
 * A park save: the `park` section of the park's save document. Version 4 is the world-model park:
 * every number the park keeps lives in `world`; the rest is what walks (guests, janitors), the ride
 * cycles, the clock and the random stream. The section keeps the shape an older build wrote at
 * {@link LEGACY_SAVE_KEY}, so those bytes lift into the document as-is. Saves from before v4 held a
 * hand-rolled ledger and placement map and are not read: such a park starts fresh, and the old save
 * is archived the next time this one is written.
 */
export interface ParkSave {
  version: 4;
  world: WorldModelState;
  guests: { state: GuestState; position: [number, number, number] }[];
  staff: StaffState[];
  clock: ClockSnapshot;
  rng?: number | null;
  /** Every ride's cycle, wear and line. */
  rides: RideSystemSnapshot | null;
  sim: { guestSeq: number; spawnAcc: number };
  /** The park name the menu card shows. */
  parkName?: string;
  /** A captured frame of the park, for the menu card. */
  thumbnail?: string;
  /** Seconds of play when the park was saved. */
  playtime?: number;
}

const finite = isFiniteNumber;
const record = isRecord;

function validAgent(value: unknown): value is AgentSnapshot {
  if (!record(value) || !record(value["mood"]) || !record(value["brain"]) || !record(value["action"])) return false;
  const needs = value["needs"];
  if (!record(needs)) return false;
  if (typedRecord(needs["values"], finite) === null) return false;
  if (typedRecord(needs["rates"], finite) === null) return false;
  if (typedRecord(needs["modifiers"], finite) === null) return false;
  if (typeof value["far"] !== "boolean") return false;
  const mark = value["scheduleMark"];
  if (mark !== null && typeof mark !== "string") return false;
  return true;
}

/** Every instance is a known kind on the lot, inside it, and on cells nothing else covers. */
function validWorld(world: unknown): world is WorldModelState {
  if (!record(world) || !finite(world["time"]) || !Array.isArray(world["log"])) return false;
  const facts = world["facts"];
  if (!record(facts)) return false;
  for (const value of Object.values(facts)) {
    if (typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string" && typeof value !== "boolean") return false;
  }
  const instances = world["instances"];
  if (instances === undefined) return true;
  if (!record(instances)) return false;
  const cells = new Set<string>();
  for (const instance of Object.values(instances)) {
    if (!record(instance)) return false;
    const kind = instance["kind"];
    const buildable = typeof kind === "string" ? findBuildable(kind) : undefined;
    if (buildable === undefined) return false;
    const cell = instance["cell"];
    if (!Array.isArray(cell) || cell.length !== 2) return false;
    const [cellCol, cellRow]: unknown[] = cell;
    if (!Number.isInteger(cellCol) || !Number.isInteger(cellRow) || !finite(cellCol) || !finite(cellRow)) return false;
    const n = sizeOf(buildable);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const col = cellCol + i;
        const row = cellRow + j;
        if (col < 0 || row < 0 || col >= LOT.cols || row >= LOT.rows || cells.has(`${col},${row}`)) return false;
        cells.add(`${col},${row}`);
      }
    }
  }
  return true;
}

function validClock(value: unknown): value is ClockSnapshot {
  if (!record(value)) return false;
  const now = value["now"];
  const speed = value["playSpeed"];
  return finite(now) && now >= 0 && typeof value["paused"] === "boolean" && (speed === 1 || speed === 2 || speed === 4) && value["timescale"] === 1;
}

const isPoint = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every(finite);

function isGuestPhase(value: unknown): value is GuestPhase {
  return GUEST_PHASES.some((phase) => phase === value);
}

/** A saved guest whose target, if any, is a structure the saved park still has. */
function validGuest(value: unknown, structures: ReadonlySet<string>): value is GuestState {
  if (!record(value)) return false;
  const { id, kind, money, visits, busy, phase, targetId, target, agent } = value;
  if (typeof id !== "string" || !GUEST_KINDS.some((known) => known === kind)) return false;
  if (!finite(money) || !finite(visits) || !finite(busy) || !isGuestPhase(phase)) return false;
  if (targetId !== null && (typeof targetId !== "string" || !structures.has(targetId))) return false;
  if (target !== null && !isPoint(target)) return false;
  return validAgent(agent);
}

/** A saved janitor posted at a structure the saved park still has. */
function validStaff(value: unknown, structures: ReadonlySet<string>): value is StaffState {
  if (!record(value)) return false;
  const { id, postId, agent } = value;
  return typeof id === "string" && typeof postId === "string" && structures.has(postId) && validAgent(agent);
}

function validRides(value: unknown): value is RideSystemSnapshot {
  return record(value) && Array.isArray(value["rides"]);
}

/** The random stream's saved seed: a 32-bit integer, or null when the save kept none. */
function readSeed(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff ? value : undefined;
}

/** Validate before touching the live scene. Unreadable saves stay intact; a pre-v4 park is unreadable. */
export function decodeSave(raw: string): ParkSave | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return readParkSave(parsed);
}

/** A stored `park` section, checked field by field; `null` for anything this build cannot open. */
export function readParkSave(s: unknown): ParkSave | null {
  try {
    if (!record(s) || s["version"] !== 4) return null;
    const world = s["world"];
    if (!validWorld(world)) return null;
    const ids = new Set(Object.keys(world.instances ?? {}));
    const clock = s["clock"];
    if (!validClock(clock)) return null;
    const rng = readSeed(s["rng"]);
    if (rng === undefined) return null;
    const sim = s["sim"];
    if (!record(sim)) return null;
    const { guestSeq, spawnAcc } = sim;
    if (!finite(guestSeq) || !finite(spawnAcc)) return null;
    const savedGuests = s["guests"];
    const savedStaff = s["staff"];
    if (!Array.isArray(savedGuests) || !Array.isArray(savedStaff)) return null;
    const guests: ParkSave["guests"] = [];
    const guestIds = new Set<string>();
    for (const entry of savedGuests) {
      if (!record(entry)) return null;
      const state = entry["state"];
      const position = entry["position"];
      if (!validGuest(state, ids) || guestIds.has(state.id) || !isPoint(position)) return null;
      guestIds.add(state.id);
      guests.push({ state: { ...state, targetUntil: finite(state.targetUntil) ? state.targetUntil : 0 }, position });
    }
    const staff: StaffState[] = [];
    for (const entry of savedStaff) {
      if (!validStaff(entry, ids)) return null;
      staff.push(entry);
    }
    const rides = s["rides"];
    const parkName = s["parkName"];
    const thumbnail = s["thumbnail"];
    const playtime = s["playtime"];
    return {
      version: 4,
      world,
      guests,
      staff,
      clock,
      rng,
      rides: validRides(rides) ? rides : null,
      sim: { guestSeq, spawnAcc },
      ...(typeof parkName === "string" ? { parkName } : {}),
      ...(typeof thumbnail === "string" ? { thumbnail } : {}),
      ...(finite(playtime) ? { playtime } : {}),
    };
  } catch {
    return null;
  }
}

export function snapshotPark(ctx: GameContext): ParkSave {
  syncAgentStates();
  return {
    version: 4,
    world: park.of(ctx).snapshot(),
    guests: [...session.guests.values()].map((g) => ({ state: { ...g }, position: [...(ctx.scene.entity.get(g.id)?.position ?? [0, 0, 58])] as [number, number, number] })),
    staff: [...session.staff.values()].map((state) => ({ ...state })),
    clock: ctx.time.snapshot(),
    rng: rngStateOf(ctx.rng),
    rides: rideSnapshot(),
    sim: guestFlowState(ctx),
    ...(parkProfile.name === null ? {} : { parkName: parkProfile.name }),
    ...(parkProfile.thumbnail === null ? {} : { thumbnail: parkProfile.thumbnail }),
    playtime: Math.round(ctx.time.now()),
  };
}

function savedLine(ctx: GameContext, prefix: string): string {
  const w = park.of(ctx);
  return `${prefix} - day ${w.num("park.day")}, $${Math.round(w.num("park.cash")).toLocaleString()}`;
}

const UNAVAILABLE = "Save unavailable - browser storage is full or disabled";

/** The park's one slot, as a section of the shared save document. Restoring empties the live park first. */
function parkSystem(ctx: GameContext): GameSaveSystem<ParkSave> {
  return {
    name: "park",
    snapshot: () => snapshotPark(ctx),
    restore(next) {
      const save = readParkSave(next);
      if (save === null) throw new Error("brightway-park: the saved park is unreadable");
      resetPark(ctx, { layout: "blank" });
      applySave(ctx, save);
    },
  };
}

interface ParkRecord {
  readonly backend: SaveBackend;
  readonly save: GameSave;
  /** Bytes the boot read found but could not open; archived before the first write replaces them. */
  unreadable: boolean;
}

/** A park save over a backend: one document, slot `park`, lifting a park an older build wrote at its own key. */
function createParkSave(ctx: GameContext, backend: SaveBackend): GameSave {
  return createGameSave({
    backend,
    game: "brightway-park",
    key: SAVE_KEY,
    slot: PARK_SLOT,
    systems: [parkSystem(ctx)],
    clock: () => ctx.time.now(),
    playtime: () => ctx.time.now(),
    legacy: {
      keys: () => [LEGACY_SAVE_KEY],
      lift(stored) {
        const save = decodeSave(stored[LEGACY_SAVE_KEY] ?? "");
        if (save === null) throw new Error("brightway-park: the park an older build saved is unreadable");
        return { park: save };
      },
    },
    devtoolsName: "brightway.save",
  });
}

const records = perContext((ctx: GameContext): ParkRecord => {
  const backend = localSaveBackend(undefined, { errorMode: "throw" });
  return { backend, save: createParkSave(ctx, backend), unreadable: false };
});

/**
 * The player's own slot beside the park: the scenarios they have won. A fresh park archives the
 * `park` slot, so what the player has unlocked lives in a slot of its own and survives it.
 */
export const PROFILE_SLOT = "profile";
/** Where an older build kept the won scenarios; read once and rewritten as the profile's section. */
export const LEGACY_WON_KEY = "brightway-park.scenarios-won";

interface ParkProfileRecord {
  readonly save: GameSave;
  won: string[];
  /** The boot read; a write waits for it, so it never replaces stored wins with none. */
  opened: Promise<unknown>;
}

const profiles = perContext((): ParkProfileRecord => {
  const state = { won: [] as string[], opened: Promise.resolve() as Promise<unknown> };
  const save = createGameSave({
    backend: localSaveBackend(undefined, { errorMode: "throw" }),
    game: "brightway-park",
    key: SAVE_KEY,
    slot: PROFILE_SLOT,
    systems: [{
      name: "scenarios",
      snapshot: () => state.won,
      // A win recorded before the boot read landed is kept alongside the stored ones.
      restore: (value) => { state.won = [...new Set([...readScenariosWon(value), ...state.won])]; },
    }],
    legacy: { keys: () => [LEGACY_WON_KEY], lift: (stored) => ({ scenarios: JSON.parse(stored[LEGACY_WON_KEY] ?? "null") as unknown }) },
  });
  return Object.assign(state, { save });
});

/** Read the player's profile (the scenarios they have won). Storage that is blocked leaves none won. */
export async function loadParkProfile(ctx: GameContext): Promise<void> {
  const profile = profiles(ctx);
  const opening = profile.save.load();
  profile.opened = opening.catch(() => undefined);
  await profile.opened;
}

/** The scenarios this player has won, kept apart from any one park's save. */
export function scenariosWon(ctx: GameContext): readonly string[] {
  return profiles(ctx).won;
}

/** Record a won scenario and write the profile; without storage the unlock lasts this session only. */
export async function recordScenarioWin(ctx: GameContext, id: string): Promise<void> {
  const profile = profiles(ctx);
  if (profile.won.includes(id)) return;
  profile.won = [...profile.won, id];
  await profile.opened;
  await profile.save.save();
}

/** The profile document's state digest, for a restore test. */
export function parkProfileDigest(ctx: GameContext): string {
  return profiles(ctx).save.digest();
}

/** This context's park document, for the menu card and a digest. */
export function parkSave(ctx: GameContext): GameSave {
  return records(ctx).save;
}

/** Browser storage is where the park lives; a host without it (headless, private mode) plays unsaved. */
const storageReady = (): boolean => defaultKeyValueStorage() !== null;

/**
 * Write the live park into its document. The park is captured when this is called; the status line
 * follows once the write settles. Bytes the boot read could not open are archived first.
 */
export async function savePark(ctx: GameContext): Promise<void> {
  if (!session.started || !storageReady()) return;
  const record = records(ctx);
  try {
    if (record.unreadable) {
      await archiveSave(ctx);
      record.unreadable = false;
    }
    await record.save.save();
  } catch {
    session.saveStatus = UNAVAILABLE;
    return;
  }
  if (record.save.status() === "error") {
    session.saveStatus = UNAVAILABLE;
    return;
  }
  session.hasSave = true;
  session.saveStatus = savedLine(ctx, "Saved");
}

/** Put a decoded save into a park that `resetPark(ctx, { layout: "blank" })` just emptied. */
export function applySave(ctx: GameContext, s: ParkSave): void {
  parkProfile.name = s.parkName ?? null;
  parkProfile.thumbnail = s.thumbnail ?? null;
  park.of(ctx).restore(s.world);
  spawnAll(ctx);
  session.hasSave = true;
  for (const { state, position } of s.guests) {
    session.guests.set(state.id, state);
    ctx.scene.entity.spawn(state.kind, { id: state.id, position, role: "npc" });
  }
  restoreGuestFlow(ctx, s.sim);
  restoreStaff(ctx, s.staff);
  restoreRides(ctx, s.rides);
  ctx.time.hydrate({ ...s.clock, paused: true });
  if (s.rng !== undefined && s.rng !== null) restoreRng(ctx.rng, s.rng);
  session.saveStatus = savedLine(ctx, "Saved park");
}

/** The bytes the park slot holds, document first, else what an older build left; `null` for none. */
async function heldBytes(record: ParkRecord): Promise<string | null> {
  return (await record.backend.read(PARK_ENTRY)) ?? (await record.backend.read(LEGACY_SAVE_KEY));
}

/**
 * Load the park's save into the live park; false when there is none, it is unreadable (kept, and
 * archived before the next write), or a park was started while it was being read.
 */
export async function restorePark(ctx: GameContext): Promise<boolean> {
  if (!storageReady()) return false;
  const record = records(ctx);
  try {
    const document = await record.save.peek(PARK_SLOT);
    if (session.started) return false;
    if (document === null || readParkSave(document.systems["park"]) === null) {
      if ((await heldBytes(record)) === null) return false;
      record.unreadable = true;
      session.saveStatus = "The saved park is from an older build or unreadable - starting a new park; the old save is kept as a backup";
      return false;
    }
    await record.save.load();
    return true;
  } catch {
    return false;
  }
}

/**
 * Explicit fresh-park action archives the previous save before replacing it: its bytes are kept at
 * a `backup-<ms>` slot of the same namespace, and the park slot (old-format key included) is emptied.
 */
export async function archiveSave(ctx: GameContext): Promise<void> {
  if (!storageReady()) return;
  const record = records(ctx);
  const previous = await heldBytes(record);
  if (previous !== null) await record.backend.write(`${SAVE_KEY}:backup-${Date.now()}`, previous);
  await record.save.deleteSlot(PARK_SLOT);
}
