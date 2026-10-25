import { createKeyValueStore, defaultKeyValueStorage, type KeyValueStorage } from "@jgengine/core/game/keyValueStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { StatValueMap } from "@jgengine/core/scene/entityStats";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { createSimClock, type ClockSnapshot } from "@jgengine/core/time/simClock";
import { DAY_LENGTH, WORLD_SEED } from "../../world";
import { BODY_SHAPES } from "../creatures/bodyPlan";
import { ALIEN_KIND, JOBS } from "../entities/aliens/catalog";
import { NEEDS } from "../needs/needs";
import { FURNITURE_BY_ID, objectEntries } from "../objects/catalog";
import { INCIDENTS } from "../sim/events";
import { TERMS } from "../sim/charter";
import { TRAIT_IDS, TRAITS, rollTraits } from "../traits";
import { createCharter, createHazards } from "./types";
import { createHouseholdEconomy, PANTRY_CAP } from "../sim/economy";
import { householdStore } from "./store";
import { resetAgents, resetBook } from "../agents";
import { alignLegacyPosts, CAREER_NODE_IDS, STANDING_TRACKS } from "../careers";
import { pairKey, BLOOM_CROPS, LIFESTYLES, type HouseholdState } from "./types";

export const ORBIT_SAVE_KEY = "odd-orbit.household-save.v1";
const SAVE_LIMIT = 256 * 1024;
const MAX_TIME = DAY_LENGTH * 1_000_000;
/** A wall-clock stamp (ms) is far larger than simulated time; JavaScript dates top out here. */
const MAX_WALL_CLOCK = 8.64e15;
/** The households the save-select pane offers: the original key plus two more on the same path. */
export const ORBIT_SLOTS = ["household", "household-2", "household-3"] as const;
/** A household's own name for its slot ("Household I"), never a raw storage key. */
export const ORBIT_SLOT_LABEL: Record<string, string> = {
  household: "Household I",
  "household-2": "Household II",
  "household-3": "Household III",
};
/** Slot one keeps the original key, so a household saved by an older build still continues. */
export function orbitSlotKey(slot: string): string {
  return slot === ORBIT_SLOTS[0] ? ORBIT_SAVE_KEY : `${ORBIT_SAVE_KEY}:${slot}`;
}
/** What the screen leaves behind for the save card: the household's name and a captured frame. */
export const orbitProfile: OrbitSaveProfile = { name: "", thumbnail: null, savedAt: 0 };
export interface OrbitSaveProfile {
  name: string;
  thumbnail: string | null;
  /** Wall clock (ms) of the write, so Continue resumes the newest household. */
  savedAt: number;
}
export interface OrbitSave {
  version: 1;
  household: HouseholdState;
  entities: SceneEntity[];
  objects: SceneObject[];
  stats: Record<string, StatValueMap>;
  clock: ClockSnapshot;
  /** Absent in saves written before the menu: the card then falls back to the household's own members. */
  profile?: OrbitSaveProfile;
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown, min = 0, max = 1_000_000): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min = 0, max = 1_000_000): value is number => number(value, min, max) && Number.isSafeInteger(value);
const text = (value: unknown, max = 120): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const vector = (value: unknown): value is number[] => Array.isArray(value) && value.length === 3 && value.every(v => number(v, -1000, 1000));
const keys = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
function json(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 240;
  if (typeof value === "number") return number(value, -MAX_TIME, MAX_TIME);
  if (Array.isArray(value)) return value.length <= 512 && value.every(item => json(item, depth + 1));
  return object(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, item]) => text(key) && !["__proto__", "constructor", "prototype"].includes(key) && json(item, depth + 1));
}
function body(value: unknown): boolean {
  return object(value) && BODY_SHAPES.includes(value.shape) && number(value.size, 0.7, 1.55) && integer(value.limbCount, 2, 8) && number(value.limbLength, 0.35, 1.15) && integer(value.eyeCount, 1, 4) && integer(value.hue, 0, 359) && number(value.metabolism, 0.75, 1.35);
}
function validClock(value: unknown): value is ClockSnapshot {
  if (!object(value) || !number(value.now, 0, MAX_TIME) || typeof value.paused !== "boolean" || ![1, 2, 4].includes(value.playSpeed) || !number(value.timescale, 0, 4) || value.scale !== 1 || JSON.stringify(value.speeds) !== "[1,2,4]" || value.speed !== (value.paused ? 0 : value.playSpeed)) return false;
  const clock = createSimClock({ config: { dayLength: DAY_LENGTH, scale: 1, speeds: [1, 2, 4] } });
  clock.hydrate(value as ClockSnapshot);
  return object(value.calendar) && JSON.stringify(value.calendar) === JSON.stringify(clock.calendar());
}
function validEconomy(value: unknown, now: number): boolean {
  if (!object(value) || !number(value.nowSeconds, 0, now) || !object(value.accounts) || (Object.keys(value.accounts).length > 0 && (!keys(value.accounts, ["household"]) || !object(value.accounts.household) || !keys(value.accounts.household, ["credits"]) || !number(value.accounts.household.credits, -1_000_000, 1_000_000)))) return false;
  if (!object(value.rules) || !keys(value.rules, ["upkeep"]) || !object(value.cursors) || !keys(value.cursors, ["upkeep"])) return false;
  const rule = value.rules.upkeep;
  const cursor = value.cursors.upkeep;
  if (!object(rule) || !number(rule.startSeconds, DAY_LENGTH, now + DAY_LENGTH) || rule.startSeconds % DAY_LENGTH !== 0) return false;
  const canonical = createHouseholdEconomy(rule.startSeconds - DAY_LENGTH).rules.upkeep!;
  if (!keys(rule, Object.keys(canonical)) || Object.entries(canonical).some(([key, expected]) => rule[key] !== expected)) return false;
  return object(cursor) && keys(cursor, ["nextDueSeconds", "fired", "paused", "done"]) && number(cursor.nextDueSeconds, value.nowSeconds, now + DAY_LENGTH) && integer(cursor.fired) && cursor.nextDueSeconds % DAY_LENGTH === 0 && cursor.fired <= (cursor.nextDueSeconds - rule.startSeconds) / DAY_LENGTH && cursor.paused === false && cursor.done === false;
}
function validHousehold(h: unknown, clock: ClockSnapshot): h is HouseholdState {
  if (!object(h) || h.seed !== WORLD_SEED || !Array.isArray(h.order) || h.order.length !== 4 || new Set(h.order).size !== 4 || h.order.some(id => !/^alien:[0-3]$/.test(id))) return false;
  if (!object(h.members) || !keys(h.members, h.order) || !number(h.credits) || !number(h.pantry, 0, PANTRY_CAP) || !number(h.debt) || !integer(h.day, Math.max(0, clock.calendar.day - 1), clock.calendar.day) || !integer(h.reliefDay, -1, h.day)) return false;
  if ((h.nextLifeEventAt !== undefined && !number(h.nextLifeEventAt, 0, MAX_TIME)) || !number(h.dayIncome) || !number(h.dayHarvest) || !validEconomy(h.economy, clock.now)) return false;
  if (h.lastDay !== null && (!object(h.lastDay) || !integer(h.lastDay.day, 0, h.day) || !["income", "harvest", "bill"].every(key => number(h.lastDay[key])) || !integer(h.lastDay.missed, 0, 4))) return false;
  if (h.selectedMemberId !== null && !h.order.includes(h.selectedMemberId)) return false;
  if (h.buildTool !== null && (typeof h.buildTool !== "string" || !Object.hasOwn(FURNITURE_BY_ID, h.buildTool))) return false;
  for (const id of h.order) {
    const m = h.members[id];
    if (!object(m) || m.id !== id || !text(m.name, 80) || !JOBS.includes(m.job) || !body(m.bodyPlan) || !object(m.needs) || !keys(m.needs, NEEDS) || !NEEDS.every(need => number(m.needs[need], 0, 100))) return false;
    if (!(LIFESTYLES as readonly string[]).includes(m.lifestyle) || !number(m.stress, 0, 100) || typeof m.recovering !== "boolean" || !number(m.workToday, 0, 20) || !number(m.harvestToday, 0, 5) || !number(m.shiftProgress, 0, 20) || !integer(m.shiftDay, -1, h.day) || !integer(m.completedShifts) || !integer(m.missedShifts) || (m.concern !== null && !text(m.concern, 240))) return false;
    if (m.bloomCrop !== undefined && !(BLOOM_CROPS as readonly string[]).includes(m.bloomCrop)) return false;
    if (m.traits !== undefined && (!Array.isArray(m.traits) || m.traits.length !== 2 || new Set(m.traits).size !== 2 || !m.traits.every((t: unknown) => (TRAIT_IDS as readonly unknown[]).includes(t)) || (TRAITS[m.traits[0] as keyof typeof TRAITS].excludes ?? []).includes(m.traits[1]))) return false;
    if (m.illUntil !== undefined && !number(m.illUntil, 0, clock.now + DAY_LENGTH)) return false;
    if (typeof m.assignedByPlayer !== "boolean" || !number(m.actionUntil, 0, clock.now + DAY_LENGTH) || !object(m.action)) return false;
    const a = m.action;
    if (a.kind === "idle") { if (!keys(a, ["kind"])) return false; }
    else if (a.kind === "wander") { if (Object.keys(a).some(key => !["kind", "x", "z", "company"].includes(key)) || !number(a.x, -120, 120) || !number(a.z, -120, 120)) return false; if (a.company !== undefined && (typeof a.company !== "string" || !h.order.includes(a.company))) return false; }
    else if (a.kind === "seek" || a.kind === "use") { if (!keys(a, ["kind", "goal", "objId"]) || ![...NEEDS, "work"].includes(a.goal) || !text(a.objId)) return false; }
    else if (a.kind === "social") { if (!keys(a, ["kind", "withId"]) || a.withId === id || !h.order.includes(a.withId)) return false; }
    else return false;
  }
  const pairs = h.order.flatMap((a, i) => h.order.slice(i + 1).map((b: string) => pairKey(a, b)));
  if (!object(h.relationships) || !keys(h.relationships, pairs) || !Object.values(h.relationships).every(value => number(value, -100, 100))) return false;
  if (h.familiarity !== undefined && (!object(h.familiarity) || !keys(h.familiarity, pairs) || !Object.values(h.familiarity).every(value => number(value, 0, 1)))) return false;
  if (h.milestones !== undefined) return false;
  if (h.standing !== undefined && !validStanding(h)) return false;
  if (h.careers !== undefined && !validCareers(h.careers)) return false;
  if (h.charter !== undefined && !validCharter(h.charter)) return false;
  if (h.story !== undefined && !validStory(h.story, clock.now)) return false;
  if (h.incident !== undefined && h.incident !== null && !validIncident(h.incident, h.order, clock.now)) return false;
  if (h.hazards !== undefined && !validHazards(h.hazards, clock.now)) return false;
  return integer(h.eventSeq);
}

/** The charter: a term inside the four, strikes and stars inside their bounds, an outcome word. */
function validCharter(c: unknown): boolean {
  if (!object(c) || !integer(c.term, 0, TERMS.length) || !integer(c.strikes, 0, TERMS.length) || !Array.isArray(c.stars) || c.stars.length > TERMS.length || !c.stars.every((n: unknown) => integer(n, 0, 3))) return false;
  if (!number(c.termIncome) || !integer(c.answered, 0, 1000) || !["active", "evicted", "kept"].includes(c.outcome) || typeof c.warned !== "boolean") return false;
  if (c.review === null) return true;
  const r = c.review;
  return object(r) && integer(r.term, 0, TERMS.length) && Array.isArray(r.met) && Array.isArray(r.missed) && [...r.met, ...r.missed].every((t: unknown) => text(t, 120)) && number(r.grant, 0, 10_000) && typeof r.strike === "boolean" && ["active", "evicted", "kept"].includes(r.outcome) && (r.reason === undefined || text(r.reason, 240));
}

const INCIDENT_IDS = new Set(INCIDENTS.map((def) => def.id));

/** The storyteller's clock, points and history, naming only incidents the book has. */
function validStory(s: unknown, now: number): boolean {
  if (!object(s) || !number(s.elapsed, 0, MAX_TIME) || s.elapsed > now + 1 || !number(s.points, 0, 1000) || !number(s.nextAt, 0, MAX_TIME) || !integer(s.fired, 0, 1_000_000)) return false;
  if (!object(s.lastFiredAt) || !Object.entries(s.lastFiredAt).every(([id, at]) => INCIDENT_IDS.has(id) && number(at, 0, MAX_TIME))) return false;
  return Array.isArray(s.recent) && s.recent.length <= 8 && s.recent.every((id: unknown) => typeof id === "string" && INCIDENT_IDS.has(id));
}

function validIncident(i: unknown, order: string[], now: number): boolean {
  if (!object(i) || typeof i.id !== "string" || !INCIDENT_IDS.has(i.id) || !number(i.deadline, 0, now + DAY_LENGTH)) return false;
  if (i.memberId !== null && !order.includes(i.memberId)) return false;
  if (i.otherId !== null && !order.includes(i.otherId)) return false;
  if (i.objId !== null && !text(i.objId)) return false;
  return i.objCatalog === null || (typeof i.objCatalog === "string" && Object.hasOwn(FURNITURE_BY_ID, i.objCatalog));
}

function validHazards(z: unknown, now: number): boolean {
  return object(z) && number(z.consolesOfflineUntil, 0, now + DAY_LENGTH) && number(z.dustUntil, 0, now + DAY_LENGTH * 2) && typeof z.hullLeak === "boolean" && Array.isArray(z.broken) && z.broken.length <= 64 && z.broken.every((id: unknown) => text(id));
}

/** Standing records: known beings on the three authored tracks, inside the ledger's bounds. */
function validStanding(h: Record<string, any>): boolean {
  if (!object(h.standing) || !keys(h.standing, ["records"]) || !object(h.standing.records)) return false;
  for (const [actor, row] of Object.entries(h.standing.records)) {
    if (!(h.order as string[]).includes(actor) || !object(row)) return false;
    for (const [track, score] of Object.entries(row)) {
      if (!(STANDING_TRACKS as readonly string[]).includes(track) || !number(score, -999, 999)) return false;
    }
  }
  return true;
}

/** Post rungs: authored node ids only, each owned at most once. */
function validCareers(value: unknown): boolean {
  if (!object(value) || !keys(value, ["ranks"]) || !object(value.ranks)) return false;
  return Object.entries(value.ranks).every(([node, rank]) => CAREER_NODE_IDS.has(node) && integer(rank, 0, 2));
}

/** A card's own fields: the household's name and the captured frame, both bounded. */
export function validOrbitProfile(value: unknown): value is OrbitSaveProfile {
  return object(value)
    && typeof value.name === "string" && value.name.length <= 40
    && (value.thumbnail === null || (typeof value.thumbnail === "string" && value.thumbnail.length <= SAVE_LIMIT))
    && number(value.savedAt, 0, MAX_WALL_CLOCK);
}

/** Reject the entire save before any subsystem can hydrate a partial damaged world. */
export function validOrbitSave(value: unknown): value is OrbitSave {
  if (!object(value) || value.version !== 1 || !validClock(value.clock) || !validHousehold(value.household, value.clock) || !json(value.household)) return false;
  if (value.profile !== undefined && !validOrbitProfile(value.profile)) return false;
  const ids = value.household.order;
  if (!Array.isArray(value.entities) || value.entities.length !== ids.length || !value.entities.every(object) || new Set(value.entities.map(entity => entity.id)).size !== ids.length) return false;
  for (const e of value.entities) {
    if (!object(e) || !ids.includes(e.id) || e.name !== ALIEN_KIND || e.role !== "npc" || !vector(e.position) || !vector(e.velocity) || ![e.rotationX, e.rotationY, e.rotationZ].every(rotation => number(rotation, -10000, 10000)) || !object(e.movement) || (e.movement.walkSpeed !== undefined && !number(e.movement.walkSpeed, 0, 50)) || (e.movement.frozen !== undefined && typeof e.movement.frozen !== "boolean") || !Array.isArray(e.behaviors) || e.behaviors.length !== 0 || !object(e.meta) || JSON.stringify(e.meta.bodyPlan) !== JSON.stringify(value.household.members[e.id]!.bodyPlan) || !json(e)) return false;
  }
  if (!object(value.stats) || !keys(value.stats, ids)) return false;
  for (const stats of Object.values(value.stats)) {
    if (!object(stats) || !keys(stats, ["health"]) || !object(stats.health) || stats.health.max !== 100 || stats.health.min !== 0 || !number(stats.health.current, 0, 100)) return false;
  }
  if (!Array.isArray(value.objects) || value.objects.length > 256 || !value.objects.every(object) || new Set(value.objects.map(item => item.instanceId)).size !== value.objects.length) return false;
  return value.objects.every(item => object(item) && text(item.instanceId) && typeof item.catalogId === "string" && Object.hasOwn(objectEntries, item.catalogId) && vector(item.position) && number(item.rotationY, -10000, 10000) && json(item));
}

export function captureOrbitSave(ctx: GameContext): OrbitSave {
  const snapshot = ctx.snapshot();
  return JSON.parse(JSON.stringify({
    version: 1, household: householdStore.read(ctx), entities: snapshot.entities, objects: snapshot.objects, stats: snapshot.stats,
    clock: ctx.time.snapshot(), profile: { ...orbitProfile },
  })) as OrbitSave;
}
export function restoreOrbitSave(ctx: GameContext, save: OrbitSave): void {
  if (!validOrbitSave(save)) throw new Error("Invalid Odd Orbit save");
  const detached = structuredClone(save);
  // A household restored without a name is named by its members until the player renames it.
  orbitProfile.name = detached.profile?.name ?? "";
  orbitProfile.thumbnail = detached.profile?.thumbnail ?? null;
  orbitProfile.savedAt = detached.profile?.savedAt ?? 0;
  // v1 saves written before the shell notice feed carried a household journal; it no longer exists.
  const legacy = detached.household as HouseholdState & { events?: unknown; milestones?: unknown };
  delete legacy.events;
  delete legacy.milestones;
  // Saves from before the storyteller kept a fixed life-event deadline; the storyteller replaces it.
  delete (legacy as { nextLifeEventAt?: unknown }).nextLifeEventAt;
  // Saves from before the charter, traits and incidents: a household starts term one with fresh hazards.
  legacy.charter ??= createCharter();
  legacy.incident ??= null;
  legacy.hazards ??= createHazards();
  for (const id of legacy.order) {
    const member = legacy.members[id];
    if (member !== undefined && member.traits === undefined) member.traits = rollTraits(`${legacy.seed}:${id.slice(id.indexOf(":") + 1)}`);
  }
  // A save from before posts existed: keep its standing empty and line each post up with its rhythm,
  // so nobody loses the station their household already ran.
  if (legacy.standing === undefined || legacy.careers === undefined) {
    legacy.standing = { records: {} };
    legacy.careers = { ranks: {} };
    alignLegacyPosts(legacy);
  }
  resetAgents();
  resetBook();
  ctx.time.hydrate(detached.clock);
  ctx.hydrate({ objects: detached.objects, entities: detached.entities, stats: detached.stats });
  householdStore.write(ctx, detached.household);
}
export function readOrbitSave(storage: KeyValueStorage | null = defaultKeyValueStorage(), slot: string = ORBIT_SLOTS[0]): { save: OrbitSave | null; damaged: boolean; unavailable: boolean } {
  if (storage === null) return { save: null, damaged: false, unavailable: true };
  let damaged = false;
  let unavailable = false;
  const cell = createKeyValueStore<OrbitSave | null>({
    key: orbitSlotKey(slot), initial: null,
    storage: { getItem(key) { try { return storage.getItem(key); } catch { unavailable = true; return null; } }, setItem: (key, raw) => storage.setItem(key, raw), removeItem: key => storage.removeItem(key) },
    deserialize(raw) {
      if (raw.length > SAVE_LIMIT) { damaged = true; return null; }
      try { const value: unknown = JSON.parse(raw); if (validOrbitSave(value)) return value; }
      catch {}
      damaged = true; return null;
    },
  });
  return { save: cell.get(), damaged, unavailable };
}
export function writeOrbitSave(ctx: GameContext, storage: KeyValueStorage | null = defaultKeyValueStorage(), slot: string = ORBIT_SLOTS[0]): boolean {
  if (storage === null) return false;
  let save: OrbitSave;
  try { save = captureOrbitSave(ctx); } catch { return false; }
  if (!validOrbitSave(save)) return false;
  let written = false;
  createKeyValueStore<OrbitSave | null>({ key: orbitSlotKey(slot), initial: null,
    storage: { getItem: () => null, removeItem: key => storage.removeItem(key), setItem(key, raw) { if (raw.length <= SAVE_LIMIT) { storage.setItem(key, raw); written = true; } } },
  }).set(save);
  return written;
}

