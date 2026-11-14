import type { NoticeFeed } from "@jgengine/core/notifications/notices";

import { householdBook, syncBook } from "../agents";
import { clampNeed, emptyNeeds } from "../needs/needs";
import { noteEvent, pairKey, type HouseholdState, type MemberState } from "../session/types";
import { DAY_LENGTH } from "../../world";
import {
  comfortIn, createRoom, effectiveRoom, idealSettings, MODULE_PRICE, MODULE_REPUTATION, neighboursOf, rentShare,
  ROOM_SLOTS, SEAL_COST, SETTING_COST, SHUTTER_COST, STARTING_ROOMS, starsFor, wallFriction,
  type Comfort, type HouseView, type RoomFactor, type RoomSettings, type RoomState,
} from "./rooms";
import { APPLICANT_ORDER, SPECIES, SPECIES_IDS, type SpeciesId } from "./species";

/**
 * The house's own ledger beside the household's: which modules are bolted on, who lives in each,
 * the station's opinion of the place, the airlock queue and the deed on the station section.
 */
export interface ApplicantState {
  species: SpeciesId;
  /** Game seconds when they give up and float off. */
  deadline: number;
  /** Interview questions already asked (indexes into INTERVIEW_QUESTIONS). */
  asked: number[];
}

export interface Review {
  day: number;
  tenantId: string;
  name: string;
  stars: number;
  text: string;
}

export interface BoardingState {
  rooms: RoomState[];
  /** 0–100: what the station thinks of the house. Gates new modules; the lease reads it. */
  reputation: number;
  /** Nights in a row each tenant has been miserable. Three and they pack. */
  grumbles: Record<string, number>;
  /** Newest first, at most six. */
  reviews: Review[];
  applicant: ApplicantState | null;
  nextApplicantAt: number;
  /** Credits still owed on the station section's deed; at zero the section is the house's own. */
  deedOwed: number;
  /** Extra noise in a room until a time: feud sabotage and fresh egg clutches. */
  noisyUntil: Record<string, number>;
  /** A solar flare beats on every unshuttered room until this time. */
  flareUntil: number;
  /** Species who have moved out, with the day they left; they do not reapply. */
  departed: SpeciesId[];
  /** Tenants who have moved in since the house opened (for the lease). */
  admitted: number;
  /** When the next tenant says something out loud; absent in saves from before tenants spoke up. */
  nextBarkAt?: number;
  /** The day Old Basalt last spoke: one sentence a day, no more. */
  basaltSpokeDay?: number;
}

export const STARTING_REPUTATION = 50;
export const DEED_PRICE = 6000;
export const APPLICANT_WAIT = 90;
/** Game seconds between applicants while a room stands empty. */
export const APPLICANT_GAP = DAY_LENGTH * 0.9;
export const GRUMBLES_TO_LEAVE = 3;
/** Opinion at or below which neighbours sabotage each other. */
export const FEUD_AT = -35;
/** Opinion at or above which a friend covers a short cheque. */
export const FRIEND_AT = 35;
export const MAX_REVIEWS = 6;

export function createBoarding(now = 0): BoardingState {
  const rooms: RoomState[] = [];
  for (let slot = 0; slot < STARTING_ROOMS; slot++) rooms.push(createRoom(slot));
  return {
    rooms, reputation: STARTING_REPUTATION, grumbles: {}, reviews: [], applicant: null,
    nextApplicantAt: now + DAY_LENGTH * 0.45, deedOwed: DEED_PRICE, noisyUntil: {}, flareUntil: 0, departed: [], admitted: 0,
  };
}

export function boardingOf(state: HouseholdState): BoardingState {
  state.boarding ??= createBoarding();
  return state.boarding;
}

export function speciesOfMember(member: Pick<MemberState, "species">): SpeciesId {
  return member.species ?? "glorp";
}

export function houseView(state: HouseholdState, now = 0): HouseView {
  const boarding = boardingOf(state);
  return {
    rooms: boarding.rooms,
    speciesOf: (id) => { const m = state.members[id]; return m === undefined ? null : speciesOfMember(m); },
    flare: boarding.flareUntil > now,
    extraNoise: (roomId) => ((boarding.noisyUntil[roomId] ?? 0) > now ? 1 : 0),
  };
}

export function roomOf(state: HouseholdState, tenantId: string): RoomState | null {
  return boardingOf(state).rooms.find((room) => room.tenantId === tenantId) ?? null;
}

export function roomBySlot(state: HouseholdState, slot: number): RoomState | null {
  return boardingOf(state).rooms.find((room) => room.slot === slot) ?? null;
}

/** A fixture lives in the broom cupboard: Pip-9 until somebody gives it a door. */
export const FIXTURE_COMFORT = 35;

export function tenantComfort(state: HouseholdState, tenantId: string, now = 0): Comfort {
  const member = state.members[tenantId];
  if (member === undefined) return { score: 0, reasons: [] };
  const species = SPECIES[speciesOfMember(member)];
  const room = roomOf(state, tenantId);
  if (room === null) return { score: FIXTURE_COMFORT, reasons: [{ factor: "atmosphere", penalty: 100 - FIXTURE_COMFORT, text: species.lines.unhappy[0]! }] };
  return comfortIn(species, effectiveRoom(houseView(state, now), room));
}

export function vacantRooms(state: HouseholdState): RoomState[] {
  return boardingOf(state).rooms.filter((room) => room.tenantId === null).sort((a, b) => a.slot - b.slot);
}

/** True when every built room is let: the sign at the airlock lights up. */
export function noVacancy(state: HouseholdState): boolean {
  return vacantRooms(state).length === 0;
}

/** A being as the household sim keeps them, built from their species card. */
export function createTenantMember(id: string, speciesId: SpeciesId): MemberState {
  const def = SPECIES[speciesId];
  return {
    id, name: def.name, species: speciesId, bodyPlan: { ...def.bodyPlan }, job: def.post, needs: emptyNeeds(),
    action: { kind: "idle" }, assignedByPlayer: false, actionUntil: 0, lifestyle: def.lifestyle, stress: 0, recovering: false,
    workToday: 0, harvestToday: 0, shiftProgress: 0, shiftDay: -1, completedShifts: 0, missedShifts: 0, concern: null,
    traits: [...def.traits],
  };
}

/** The next free `alien:<n>` id. */
export function nextTenantId(state: HouseholdState): string {
  let n = 0;
  for (const id of state.order) {
    const k = Number(id.slice(id.indexOf(":") + 1));
    if (Number.isSafeInteger(k)) n = Math.max(n, k + 1);
  }
  return `alien:${n}`;
}

/** Add a tenant to the roster, the relationship book and (when given) a room. */
export function addTenant(state: HouseholdState, speciesId: SpeciesId, slot: number | null): MemberState {
  const id = nextTenantId(state);
  const member = createTenantMember(id, speciesId);
  for (const other of state.order) {
    state.relationships[pairKey(id, other)] = 0;
    state.familiarity[pairKey(id, other)] = 0.3;
  }
  state.members[id] = member;
  state.order.push(id);
  if (slot !== null) {
    const room = roomBySlot(state, slot);
    if (room !== null && room.tenantId === null) room.tenantId = id;
  }
  return member;
}

/** Take a tenant off every list the house keeps. The caller removes their body from the scene. */
export function removeTenant(state: HouseholdState, tenantId: string): void {
  const boarding = boardingOf(state);
  for (const room of boarding.rooms) if (room.tenantId === tenantId) room.tenantId = null;
  delete boarding.grumbles[tenantId];
  delete state.members[tenantId];
  state.order = state.order.filter((id) => id !== tenantId);
  const live = new Set<string>();
  for (const a of state.order) for (const b of state.order) if (a < b) live.add(pairKey(a, b));
  for (const key of Object.keys(state.relationships)) if (!live.has(key)) delete state.relationships[key];
  for (const key of Object.keys(state.familiarity)) if (!live.has(key)) delete state.familiarity[key];
  if (state.selectedMemberId === tenantId) state.selectedMemberId = null;
  if (state.standing !== undefined) delete state.standing.records[tenantId];
  for (const id of state.order) {
    const m = state.members[id]!;
    if (m.action.kind === "social" && m.action.withId === tenantId) m.action = { kind: "idle" };
    if (m.action.kind === "wander" && m.action.company === tenantId) m.action = { kind: "idle" };
  }
  if (state.incident != null && (state.incident.memberId === tenantId || state.incident.otherId === tenantId)) state.incident = null;
}

export type BoardingRefusal = string;

/** Change one setting of a room; returns the reason when refused. */
export function setRoomSetting<F extends RoomFactor>(state: HouseholdState, slot: number, factor: F, value: RoomSettings[F]): BoardingRefusal | null {
  const room = roomBySlot(state, slot);
  if (room === null) return "No module there yet";
  if (room.settings[factor] === value) return "Already set";
  const cost = SETTING_COST[factor];
  if (state.credits < cost) return `Needs ${cost} credits`;
  state.credits -= cost;
  room.settings = { ...room.settings, [factor]: value };
  return null;
}

/** Retune a room to its tenant's own taste in one go; the cost is every change it takes. */
export function tuneCost(state: HouseholdState, slot: number): number {
  const room = roomBySlot(state, slot);
  if (room === null || room.tenantId === null) return 0;
  const member = state.members[room.tenantId];
  if (member === undefined) return 0;
  const ideal = idealSettings(SPECIES[speciesOfMember(member)]);
  return (Object.keys(ideal) as RoomFactor[]).reduce((sum, factor) => sum + (room.settings[factor] === ideal[factor] ? 0 : SETTING_COST[factor]), 0);
}

export function tuneRoom(state: HouseholdState, slot: number): BoardingRefusal | null {
  const room = roomBySlot(state, slot);
  if (room === null || room.tenantId === null) return "Nobody lives there";
  const member = state.members[room.tenantId];
  if (member === undefined) return "Nobody lives there";
  const cost = tuneCost(state, slot);
  if (cost === 0) return "Already to their taste";
  if (state.credits < cost) return `Needs ${cost} credits`;
  state.credits -= cost;
  room.settings = idealSettings(SPECIES[speciesOfMember(member)]);
  return null;
}

export function sealRoom(state: HouseholdState, slot: number): BoardingRefusal | null {
  const room = roomBySlot(state, slot);
  if (room === null) return "No module there yet";
  if (room.sealed) return "Already sealed";
  if (state.credits < SEAL_COST) return `Needs ${SEAL_COST} credits`;
  state.credits -= SEAL_COST;
  room.sealed = true;
  return null;
}

export function shutterRoom(state: HouseholdState, slot: number): BoardingRefusal | null {
  const room = roomBySlot(state, slot);
  if (room === null) return "No module there yet";
  if (room.shuttered) return "Already shuttered";
  if (state.credits < SHUTTER_COST) return `Needs ${SHUTTER_COST} credits`;
  state.credits -= SHUTTER_COST;
  room.shuttered = true;
  return null;
}

/** Why the module at a slot cannot be bought yet; null when it can. */
export function moduleBlocker(state: HouseholdState, slot: number): BoardingRefusal | null {
  if (slot < 0 || slot >= ROOM_SLOTS) return "No such berth";
  if (roomBySlot(state, slot) !== null) return "Already docked";
  const boarding = boardingOf(state);
  const next = boarding.rooms.length;
  const price = MODULE_PRICE[Math.min(next, MODULE_PRICE.length - 1)]!;
  const rep = MODULE_REPUTATION[Math.min(next, MODULE_REPUTATION.length - 1)]!;
  if (boarding.reputation < rep) return `The station wants ${rep} reputation`;
  if (state.credits < price) return `Needs ${price} credits`;
  return null;
}

export function nextModulePrice(state: HouseholdState): { price: number; reputation: number } {
  const next = boardingOf(state).rooms.length;
  return { price: MODULE_PRICE[Math.min(next, MODULE_PRICE.length - 1)]!, reputation: MODULE_REPUTATION[Math.min(next, MODULE_REPUTATION.length - 1)]! };
}

export function buyModule(state: HouseholdState, slot: number): BoardingRefusal | null {
  const blocked = moduleBlocker(state, slot);
  if (blocked !== null) return blocked;
  const { price } = nextModulePrice(state);
  state.credits -= price;
  const boarding = boardingOf(state);
  boarding.rooms = [...boarding.rooms, createRoom(slot)].sort((a, b) => a.slot - b.slot);
  return null;
}

/** Move a tenant into a room; whoever lives there swaps into the tenant's old room (or the cupboard). */
export function moveTenant(state: HouseholdState, tenantId: string, slot: number): BoardingRefusal | null {
  const target = roomBySlot(state, slot);
  if (target === null) return "No module there yet";
  if (state.members[tenantId] === undefined) return "No such tenant";
  if (target.tenantId === tenantId) return "Already lives there";
  const from = roomOf(state, tenantId);
  const displaced = target.tenantId;
  if (displaced !== null && from === null) return "That room is let; free it first or swap two tenants";
  target.tenantId = tenantId;
  if (from !== null) from.tenantId = displaced;
  const moved = state.members[tenantId]!;
  moved.stress = clampNeed(moved.stress + 6);
  if (displaced !== null) { const other = state.members[displaced]; if (other !== undefined) other.stress = clampNeed(other.stress + 6); }
  return null;
}

/** Pay toward the station section's deed. */
export function payDeed(state: HouseholdState, amount: number): BoardingRefusal | null {
  const boarding = boardingOf(state);
  if (boarding.deedOwed <= 0) return "The section is already yours";
  const pay = Math.min(amount, boarding.deedOwed);
  if (!(pay > 0)) return "Nothing to pay";
  if (state.credits < pay) return `Needs ${pay} credits`;
  state.credits -= pay;
  boarding.deedOwed -= pay;
  return null;
}

export function deedPaid(state: HouseholdState): boolean {
  return boardingOf(state).deedOwed <= 0;
}

function pickLine(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length]!;
}

export interface NightReport {
  rent: number;
  covered: number;
  reviews: Review[];
  movedOut: string[];
  sabotage: number;
}

/**
 * Midnight at the house: every tenant writes a cheque scaled by comfort (a friend covers a short
 * one), leaves a star review the station reads, and a tenant miserable three nights running packs
 * up. Feuding neighbours make each other's next day louder. Returns ids that moved out so the
 * caller can take their bodies out of the scene.
 */
export function settleBoardingNight(state: HouseholdState, now: number, notices: Pick<NoticeFeed, "push">): NightReport {
  const boarding = boardingOf(state);
  const report: NightReport = { rent: 0, covered: 0, reviews: [], movedOut: [], sabotage: 0 };
  const book = householdBook(state);
  const comforts = new Map<string, Comfort>();
  for (const id of state.order) comforts.set(id, tenantComfort(state, id, now));
  let weighted = 0;
  let weights = 0;
  for (const id of state.order) {
    const member = state.members[id]!;
    const def = SPECIES[speciesOfMember(member)];
    const room = roomOf(state, id);
    if (room === null) continue;
    const comfort = comforts.get(id)!;
    // Cheques: one per head; Old Basalt paid the century already.
    const shares = def.checks === 2 ? [rentShare(comfort.score), rentShare(comfort.second ?? comfort.score)] : [rentShare(comfort.score)];
    let paid = shares.reduce((sum, share) => sum + Math.round(def.rent * share), 0);
    const full = def.rent * def.checks;
    if (paid < full && def.rent > 0) {
      const friend = state.order.find((other) => other !== id && book.opinion(id, other) >= FRIEND_AT && (comforts.get(other)?.score ?? 0) >= 55 && roomOf(state, other) !== null);
      if (friend !== undefined) {
        const cover = full - paid;
        paid = full;
        report.covered += cover;
        noteEvent(state, notices, `${state.members[friend]!.name} covered ${cover} of ${member.name}'s rent. Friends look after friends.`, "success");
      }
    }
    report.rent += paid;
    const stars = starsFor(comfort.score);
    const text = stars >= 4 ? pickLine(def.lines.happy, state.day + id.length) : comfort.reasons[0]?.text || pickLine(def.lines.unhappy, state.day);
    const review: Review = { day: state.day, tenantId: id, name: member.name, stars, text };
    report.reviews.push(review);
    weighted += stars * def.reviewWeight;
    weights += def.reviewWeight;
    boarding.grumbles[id] = comfort.score < 30 ? (boarding.grumbles[id] ?? 0) + 1 : 0;
  }
  if (weights > 0) {
    const tonight = ((weighted / weights) - 1) * 25;
    boarding.reputation = Math.round((boarding.reputation * 0.7 + tonight * 0.3) * 10) / 10;
  }
  boarding.reviews = [...report.reviews.sort((a, b) => a.stars - b.stars).slice(0, 2), ...boarding.reviews].slice(0, MAX_REVIEWS);
  state.credits += report.rent;
  state.dayIncome += report.rent;
  // Feuding neighbours: the unhappier one makes the other's tomorrow louder.
  for (const room of boarding.rooms) {
    if (room.tenantId === null) continue;
    for (const n of neighboursOf(boarding.rooms, room)) {
      if (n.tenantId === null || room.tenantId >= n.tenantId) continue;
      if (book.opinion(room.tenantId, n.tenantId) > FEUD_AT) continue;
      const aComfort = comforts.get(room.tenantId)?.score ?? 0;
      const bComfort = comforts.get(n.tenantId)?.score ?? 0;
      const [saboteur, victimRoom] = aComfort <= bComfort ? [room.tenantId, n] : [n.tenantId, room];
      boarding.noisyUntil[victimRoom.id] = now + DAY_LENGTH * 0.6;
      report.sabotage += 1;
      noteEvent(state, notices, `${state.members[saboteur]!.name} banged on the wall all night to annoy ${state.members[victimRoom.tenantId!]!.name}. Feuds get loud.`, "warn");
    }
  }
  for (const id of [...state.order]) {
    if ((boarding.grumbles[id] ?? 0) < GRUMBLES_TO_LEAVE) continue;
    const member = state.members[id]!;
    const def = SPECIES[speciesOfMember(member)];
    noteEvent(state, notices, `${member.name} moved out: "${def.lines.moveOut}" One star.`, "deny");
    boarding.reviews = [{ day: state.day, tenantId: id, name: member.name, stars: 1, text: def.lines.moveOut }, ...boarding.reviews].slice(0, MAX_REVIEWS);
    boarding.reputation = Math.max(0, boarding.reputation - 12);
    boarding.departed = [...boarding.departed, speciesOfMember(member)];
    removeTenant(state, id);
    report.movedOut.push(id);
  }
  syncBook(state, book);
  if (report.rent > 0) noteEvent(state, notices, `Rent night: ${report.rent} credits in the jar · reputation ${Math.round(boarding.reputation)}.`, "success");
  return report;
}

/** Neighbours drift apart when one's output hurts the other, and closer when the wall is kind. */
export function driftNeighbours(state: HouseholdState, now: number, dt: number): void {
  const boarding = boardingOf(state);
  const house = houseView(state, now);
  const book = householdBook(state);
  let changed = false;
  for (const room of boarding.rooms) {
    if (room.tenantId === null) continue;
    for (const n of neighboursOf(boarding.rooms, room)) {
      if (n.tenantId === null || room.tenantId >= n.tenantId) continue;
      const friction = wallFriction(house, room, n);
      const delta = friction > 0 ? -(14 * friction / DAY_LENGTH) * dt : (5 / DAY_LENGTH) * dt;
      book.socialise(room.tenantId, n.tenantId, { opinion: delta });
      changed = true;
    }
  }
  if (changed) syncBook(state, book);
}

/** Species who might knock: not living here, not departed. */
export function applicantPool(state: HouseholdState): SpeciesId[] {
  const housed = new Set(state.order.map((id) => speciesOfMember(state.members[id]!)));
  const boarding = boardingOf(state);
  return APPLICANT_ORDER.filter((id) => !housed.has(id) && !boarding.departed.includes(id));
}

/** Let the airlock queue move: a new face when a room stands empty, a shrug when they wait too long. */
export function advanceApplicants(state: HouseholdState, now: number, notices: Pick<NoticeFeed, "push">): void {
  const boarding = boardingOf(state);
  if (boarding.applicant !== null) {
    if (now < boarding.applicant.deadline) return;
    const def = SPECIES[boarding.applicant.species];
    noteEvent(state, notices, `${def.name} got tired of waiting at the airlock and drifted off.`, "info");
    boarding.applicant = null;
    boarding.nextApplicantAt = now + APPLICANT_GAP;
    return;
  }
  if (now < boarding.nextApplicantAt || noVacancy(state)) return;
  const pool = applicantPool(state);
  if (pool.length === 0) return;
  const species = pool[0]!;
  boarding.applicant = { species, deadline: now + APPLICANT_WAIT, asked: [] };
  noteEvent(state, notices, `Someone is buzzing at the airlock: ${SPECIES[species].name}, looking for a room.`, "info");
}

export function askApplicant(state: HouseholdState, question: number): BoardingRefusal | null {
  const applicant = boardingOf(state).applicant;
  if (applicant === null) return "Nobody at the airlock";
  if (question < 0 || question > 2) return "No such question";
  if (!applicant.asked.includes(question)) applicant.asked = [...applicant.asked, question].sort();
  return null;
}

/** Let the applicant in. Returns the new member, or the reason it could not happen. */
export function acceptApplicant(state: HouseholdState, slot: number | null, now: number, notices: Pick<NoticeFeed, "push">): MemberState | BoardingRefusal {
  const boarding = boardingOf(state);
  const applicant = boarding.applicant;
  if (applicant === null) return "Nobody at the airlock";
  const room = slot === null ? vacantRooms(state)[0] ?? null : roomBySlot(state, slot);
  if (room === null || room.tenantId !== null) return "No vacant room for them";
  const def = SPECIES[applicant.species];
  const member = addTenant(state, applicant.species, room.slot);
  boarding.applicant = null;
  boarding.nextApplicantAt = now + APPLICANT_GAP;
  boarding.admitted += 1;
  if (def.upfront !== undefined) {
    state.credits += def.upfront;
    state.dayIncome += def.upfront;
    noteEvent(state, notices, `${def.name} moved in and paid a century of rent up front: ${def.upfront} credits. "${def.lines.greet}"`, "success");
  } else {
    noteEvent(state, notices, `${def.name} moved into room ${room.slot + 1}. "${def.lines.greet}"`, "success");
  }
  return member;
}

export function rejectApplicant(state: HouseholdState, now: number, notices: Pick<NoticeFeed, "push">): BoardingRefusal | null {
  const boarding = boardingOf(state);
  const applicant = boarding.applicant;
  if (applicant === null) return "Nobody at the airlock";
  const def = SPECIES[applicant.species];
  noteEvent(state, notices, `You turned ${def.name} away. "${def.lines.rejected}"`, "info");
  boarding.applicant = null;
  boarding.nextApplicantAt = now + APPLICANT_GAP;
  return null;
}

/** Give the fixture (Pip-9) a door: it becomes a tenant on the spot. */
export function isFixture(state: HouseholdState, tenantId: string): boolean {
  return roomOf(state, tenantId) === null;
}

/** Game seconds between tenants speaking up in the notice feed. */
export const BARK_GAP = DAY_LENGTH * 0.22;

/**
 * Every so often one tenant says what is on their mind, in their own voice: a happy line when the
 * room suits them, their worst complaint when it does not, the cupboard line for a fixture. Old
 * Basalt says one sentence a day. Picks rotate through the roster so nobody hogs the feed.
 */
export function advanceBarks(state: HouseholdState, now: number, notices: Pick<NoticeFeed, "push">): string | null {
  const boarding = boardingOf(state);
  boarding.nextBarkAt ??= now + BARK_GAP * 0.5;
  if (now < boarding.nextBarkAt || state.order.length === 0) return null;
  boarding.nextBarkAt = now + BARK_GAP;
  const turn = Math.floor(now / BARK_GAP);
  for (let k = 0; k < state.order.length; k++) {
    const id = state.order[(turn + k) % state.order.length]!;
    const member = state.members[id]!;
    const species = speciesOfMember(member);
    if (species === "basalt" && boarding.basaltSpokeDay === state.day) continue;
    const def = SPECIES[species];
    const comfort = tenantComfort(state, id, now);
    const line = roomOf(state, id) === null
      ? pickLine(def.lines.unhappy, turn)
      : comfort.score >= 55 ? pickLine(def.lines.happy, turn) : (comfort.reasons[0]?.text || pickLine(def.lines.unhappy, turn));
    if (line.length === 0) continue;
    if (species === "basalt") boarding.basaltSpokeDay = state.day;
    const text = `${member.name}: “${line}”`;
    notices.push({ text, tone: comfort.score >= 55 ? "info" : "warn" });
    return text;
  }
  return null;
}

export function expireBoarding(state: HouseholdState, now: number): void {
  const boarding = boardingOf(state);
  for (const [room, until] of Object.entries(boarding.noisyUntil)) if (until <= now) delete boarding.noisyUntil[room];
  if (boarding.flareUntil > 0 && boarding.flareUntil <= now) boarding.flareUntil = 0;
}

export function averageComfort(state: HouseholdState, now = 0): number {
  const housed = state.order.filter((id) => roomOf(state, id) !== null);
  if (housed.length === 0) return 0;
  return housed.reduce((sum, id) => sum + tenantComfort(state, id, now).score, 0) / housed.length;
}

export { SPECIES_IDS };
