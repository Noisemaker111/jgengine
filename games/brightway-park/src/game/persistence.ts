import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import { isFiniteNumber, isRecord, typedRecord } from "@jgengine/core/data/untyped";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import type { RideSystemSnapshot } from "@jgengine/core/sim/rides";
import type { WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { rngStateOf, restoreRng } from "@jgengine/core/random/rng";

import { syncAgentStates } from "./agents";
import { findBuildable } from "./objects/catalog";
import { GUEST_KINDS } from "./entities/guests/catalog";
import { LOT, park, sizeOf } from "./park";
import { spawnAll } from "./parkScene";
import { restoreRides, rideSnapshot } from "./rides";
import { GUEST_PHASES, session, type GuestPhase, type GuestState, type StaffState } from "./session";
import { restoreStaff } from "./staff";
import { parkProfile } from "./parkProfile";

export const SAVE_KEY = "brightway-park.save.v1";

/**
 * Where each store the park writes is kept. The engine's own save is off (`save: "none"`): the park
 * writes one document to browser storage, and the world store goes into it whole.
 */
export const STORE_POLICY: Readonly<Record<string, { kept: "park-save" | "session"; reason: string }>> = {
  // `park.store.key`; spelled out because this module loads inside park.ts's own import graph.
  "brightway.world": { kept: "park-save", reason: "the whole park - money, rating, structures, loan, scenario, crew orders - saved as `world`" },
  "park.reduced-motion": { kept: "session", reason: "a viewer setting read from browser storage at boot" },
};

/**
 * A park save. Version 4 is the world-model park: every number the park keeps lives in `world`; the
 * rest is what walks (guests, janitors), the ride cycles, the clock and the random stream. Older
 * saves held a hand-rolled ledger and placement map and are not read: a park from before v4 starts
 * fresh, and the old save is archived the next time this one is written.
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
  try {
    const s: unknown = JSON.parse(raw);
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
    sim: { guestSeq: session.guestSeq, spawnAcc: session.spawnAcc },
    ...(parkProfile.name === null ? {} : { parkName: parkProfile.name }),
    ...(parkProfile.thumbnail === null ? {} : { thumbnail: parkProfile.thumbnail }),
    playtime: Math.round(ctx.time.now()),
  };
}

function savedLine(ctx: GameContext, prefix: string): string {
  const w = park.of(ctx);
  return `${prefix} - day ${w.num("park.day")}, $${Math.round(w.num("park.cash")).toLocaleString()}`;
}

export function savePark(ctx: GameContext): void {
  if (!session.started || typeof localStorage === "undefined") return;
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous && !decodeSave(previous)) archiveSave();
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshotPark(ctx)));
    session.hasSave = true;
    session.saveStatus = savedLine(ctx, "Saved");
  } catch {
    session.saveStatus = "Save unavailable - browser storage is full or disabled";
  }
}

/** Put a decoded save into a park that `resetPark(ctx, { layout: "blank" })` just emptied. */
export function applySave(ctx: GameContext, s: ParkSave): void {
  parkProfile.name = s.parkName ?? null;
  parkProfile.thumbnail = s.thumbnail ?? null;
  park.of(ctx).restore(s.world);
  spawnAll(ctx);
  session.guestSeq = s.sim.guestSeq;
  session.spawnAcc = s.sim.spawnAcc;
  session.hasSave = true;
  for (const { state, position } of s.guests) {
    session.guests.set(state.id, state);
    ctx.scene.entity.spawn(state.kind, { id: state.id, position, role: "npc" });
  }
  restoreStaff(ctx, s.staff);
  restoreRides(ctx, s.rides);
  ctx.time.hydrate({ ...s.clock, paused: true });
  if (s.rng !== undefined && s.rng !== null) restoreRng(ctx.rng, s.rng);
  session.saveStatus = savedLine(ctx, "Saved park");
}

/** Load the park's save; false (and a fresh park for the caller to seed) when there is none or it is unreadable. */
export function restorePark(ctx: GameContext): boolean {
  if (typeof localStorage === "undefined") return false;
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  const s = decodeSave(raw);
  if (s === null) {
    session.saveStatus = "The saved park is from an older build or unreadable - starting a new park; the old save is kept as a backup";
    return false;
  }
  applySave(ctx, s);
  return true;
}

/** Explicit fresh-park action archives the previous save before replacing it. */
export function archiveSave(): void {
  if (typeof localStorage === "undefined") return;
  const previous = localStorage.getItem(SAVE_KEY);
  if (previous) localStorage.setItem(`${SAVE_KEY}.backup.${Date.now()}`, previous);
  localStorage.removeItem(SAVE_KEY);
}
