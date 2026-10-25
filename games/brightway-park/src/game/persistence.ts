import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";
import type { RideSystemSnapshot } from "@jgengine/core/sim/rides";
import type { WorldModelState } from "@jgengine/core/worldModel/worldModel";
import { rngStateOf, restoreRng } from "@jgengine/core/random/rng";

import { syncAgentStates } from "./agents";
import { BUILDABLES } from "./objects/catalog";
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

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const record = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function validAgent(value: unknown): value is AgentSnapshot {
  if (!record(value) || !record(value.needs) || !record(value.mood) || !record(value.brain) || !record(value.action)) return false;
  const needs = value.needs;
  if (!record(needs.values) || !Object.values(needs.values).every(finite)) return false;
  if (!record(needs.rates) || !Object.values(needs.rates).every(finite)) return false;
  if (!record(needs.modifiers) || !Object.values(needs.modifiers).every(finite)) return false;
  if (typeof value.far !== "boolean") return false;
  if (value.scheduleMark !== null && typeof value.scheduleMark !== "string") return false;
  return true;
}

/** Every instance is a known kind on the lot, inside it, and on cells nothing else covers. */
function validWorld(world: unknown): world is WorldModelState {
  if (!record(world) || !finite(world.time) || !record(world.facts) || !Array.isArray(world.log)) return false;
  for (const value of Object.values(world.facts)) {
    if (typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string" && typeof value !== "boolean") return false;
  }
  if (world.instances === undefined) return true;
  if (!record(world.instances)) return false;
  const cells = new Set<string>();
  for (const instance of Object.values(world.instances)) {
    if (!record(instance) || typeof instance.kind !== "string" || !Object.hasOwn(BUILDABLES, instance.kind)) return false;
    const cell = instance.cell;
    if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) return false;
    const n = sizeOf(BUILDABLES[instance.kind]!);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const col = (cell[0] as number) + i;
        const row = (cell[1] as number) + j;
        if (col < 0 || row < 0 || col >= LOT.cols || row >= LOT.rows || cells.has(`${col},${row}`)) return false;
        cells.add(`${col},${row}`);
      }
    }
  }
  return true;
}

/** Validate before touching the live scene. Unreadable saves stay intact; a pre-v4 park is unreadable. */
export function decodeSave(raw: string): ParkSave | null {
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (s.version !== 4 || !validWorld(s.world)) return null;
    const world = s.world;
    const ids = new Set(Object.keys(world.instances ?? {}));
    const clock = s.clock as ClockSnapshot | undefined;
    if (!record(clock) || !finite(clock.now) || clock.now < 0 || typeof clock.paused !== "boolean" || ![1, 2, 4].includes(clock.playSpeed) || clock.timescale !== 1) return null;
    if (s.rng !== undefined && s.rng !== null && (!Number.isInteger(s.rng) || (s.rng as number) < -0x80000000 || (s.rng as number) > 0x7fffffff)) return null;
    if (!record(s.sim) || !finite(s.sim.guestSeq) || !finite(s.sim.spawnAcc)) return null;
    if (!Array.isArray(s.guests) || !Array.isArray(s.staff)) return null;
    const guests: ParkSave["guests"] = [];
    const guestIds = new Set<string>();
    for (const entry of s.guests) {
      if (!record(entry) || !record(entry.state)) return null;
      const state = entry.state as unknown as GuestState;
      const position = entry.position;
      if (typeof state.id !== "string" || guestIds.has(state.id) || !GUEST_KINDS.includes(state.kind)) return null;
      if (![state.money, state.visits, state.busy].every(finite)) return null;
      if (!GUEST_PHASES.includes(state.phase as GuestPhase) || (state.targetId !== null && !ids.has(state.targetId))) return null;
      if (!validAgent(state.agent)) return null;
      if (!Array.isArray(position) || position.length !== 3 || !position.every(finite)) return null;
      if (state.target !== null && (!Array.isArray(state.target) || state.target.length !== 3 || !state.target.every(finite))) return null;
      guestIds.add(state.id);
      guests.push({ state: { ...state, targetUntil: finite(state.targetUntil) ? state.targetUntil : 0 }, position: position as [number, number, number] });
    }
    const staff: StaffState[] = [];
    for (const entry of s.staff as StaffState[]) {
      if (!record(entry) || typeof entry.id !== "string" || typeof entry.postId !== "string" || !validAgent(entry.agent)) return null;
      if (!ids.has(entry.postId)) return null;
      staff.push(entry);
    }
    const rides = record(s.rides) && Array.isArray(s.rides.rides) ? (s.rides as unknown as RideSystemSnapshot) : null;
    return {
      version: 4,
      world,
      guests,
      staff,
      clock,
      rng: (s.rng as number | null | undefined) ?? null,
      rides,
      sim: { guestSeq: s.sim.guestSeq, spawnAcc: s.sim.spawnAcc },
      ...(typeof s.parkName === "string" ? { parkName: s.parkName } : {}),
      ...(typeof s.thumbnail === "string" ? { thumbnail: s.thumbnail } : {}),
      ...(finite(s.playtime) ? { playtime: s.playtime } : {}),
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

/** Put a decoded save into a park that `resetPark(ctx, { seed: false })` just emptied. */
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
