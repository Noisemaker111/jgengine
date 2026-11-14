import { createStoryteller, type StoryIncident, type StorytellerConfig } from "@jgengine/core/ai/director/storyteller";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/notifications/notices";
import { seededRng } from "@jgengine/core/random/rng";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { bumpNeed, householdBook, syncBook } from "../agents";
import { clampNeed, type NeedId } from "../needs/needs";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { createHazards, noteEvent, type HabitatHazards, type HouseholdState, type MemberState, type PendingIncident } from "../session/types";
import { hasTrait, stressFactor } from "../traits";
import { DAY_LENGTH } from "../../world";
import { charterOf } from "./charter";
import { creditAmount, PANTRY_CAP } from "./economy";
import { boardingOf, roomOf, tenantComfort } from "../boarding/boarding";
import { SHUTTER_COST } from "../boarding/rooms";

/** Game seconds a transmission waits for an answer before the household takes its default. */
export const ANSWER_SECONDS = 45;
const HOUR = DAY_LENGTH / 24;

export interface IncidentReading {
  state: HouseholdState;
  objects: readonly SceneObject[];
}

export interface IncidentChoice {
  id: string;
  label: string;
  /** What it costs or does, in numbers. */
  detail: (state: HouseholdState, incident: PendingIncident) => string;
  /** Null when the choice can be taken, else why not. */
  blocked?: (state: HouseholdState, incident: PendingIncident) => string | null;
  apply: (state: HouseholdState, incident: PendingIncident, now: number) => string;
}

export interface IncidentDef extends StoryIncident<IncidentReading> {
  title: string;
  tone: NoticeTone;
  /** Who or what the incident lands on, chosen when it fires; null when nothing fits. */
  pick?: (state: HouseholdState, objects: readonly SceneObject[], rng: () => number) => Omit<PendingIncident, "id" | "deadline"> | null;
  /** The transmission's body text. */
  text: (state: HouseholdState, incident: PendingIncident) => string;
  /** No choices: applied the moment it fires. */
  auto?: (state: HouseholdState, incident: PendingIncident, now: number) => void;
  choices?: readonly IncidentChoice[];
  /** The choice the household takes when the deadline passes. */
  fallback?: string;
}

function hazards(state: HouseholdState): HabitatHazards {
  state.hazards ??= createHazards();
  return state.hazards;
}

function members(state: HouseholdState): MemberState[] {
  return state.order.map((id) => state.members[id]).filter((m): m is MemberState => m !== undefined);
}

function named(state: HouseholdState, id: string | null): string {
  return (id !== null ? state.members[id]?.name : undefined) ?? "Someone";
}

function stress(member: MemberState, amount: number): void {
  member.stress = clampNeed(member.stress + (amount > 0 ? amount * stressFactor(member) : amount));
}

function spend(state: HouseholdState, credits: number): void {
  state.credits = creditAmount(state.credits - credits);
}

function afford(credits: number) {
  return (state: HouseholdState) => (state.credits >= credits ? null : `Needs ${credits} credits`);
}

function needTrait(trait: Parameters<typeof hasTrait>[1], word: string) {
  return (state: HouseholdState) => (members(state).some((m) => hasTrait(m, trait)) ? null : `Needs a ${word} tenant`);
}

function traitHolder(state: HouseholdState, trait: Parameters<typeof hasTrait>[1]): MemberState | null {
  return members(state).find((m) => hasTrait(m, trait)) ?? null;
}

function randomMember(state: HouseholdState, rng: () => number, ok: (m: MemberState) => boolean = () => true): string | null {
  const pool = members(state).filter(ok);
  return pool.length === 0 ? null : pool[Math.floor(rng() * pool.length) % pool.length]!.id;
}


/** Mark a furnishing out of service and send everyone using it on their way. */
function breakObject(state: HouseholdState, objId: string): void {
  const h = hazards(state);
  if (!h.broken.includes(objId)) h.broken = [...h.broken, objId];
  for (const m of members(state)) {
    if ((m.action.kind === "use" || m.action.kind === "seek") && m.action.objId === objId) {
      m.action = { kind: "idle" };
      m.assignedByPlayer = false;
      m.actionUntil = 0;
    }
  }
}

export function repairObject(state: HouseholdState, objId: string): void {
  const h = hazards(state);
  h.broken = h.broken.filter((id) => id !== objId);
}

/** Patching a hull leak after the transmission has passed. */
export const HULL_PATCH_COST = 70;

/** Price to mend a broken furnishing: 40% of what it cost. */
export function repairCost(catalogId: string): number {
  return Math.round((FURNITURE_BY_ID[catalogId]?.cost ?? 100) * 0.4);
}

const quarrelPair = (state: HouseholdState): [string, string] | null => {
  const book = householdBook(state);
  let pair: [string, string] | null = null;
  let low = 30;
  for (const a of state.order) for (const b of state.order) {
    if (a >= b) continue;
    const o = book.opinion(a, b);
    if (o < low) { low = o; pair = [a, b]; }
  }
  return pair;
};

function shiftOpinion(state: HouseholdState, a: string, b: string, delta: number): void {
  const book = householdBook(state);
  book.socialise(a, b, { opinion: delta });
  syncBook(state, book);
}

/** Tenants of these species can lay a surprise clutch. */
const EGG_LAYERS = new Set(["glorp", "krrt", "velvet"]);

function speciesHolder(state: HouseholdState, species: string): MemberState | null {
  return members(state).find((m) => m.species === species) ?? null;
}

/** The front desk's book: boons, offers and the trouble a boarding house in orbit attracts. */
export const INCIDENTS: readonly IncidentDef[] = [
  {
    id: "comet", cost: 0, weight: 1, cooldownSeconds: DAY_LENGTH * 2, title: "Aurora over the station", tone: "success",
    text: () => "The station drifted through a magnetic aurora. Every porthole went pink and green; the whole house felt lighter.",
    auto: (state) => { for (const m of members(state)) bumpNeed(m, "fun", 14); },
  },
  {
    id: "cache", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH * 2, title: "Lost-and-found crate", tone: "success",
    pick: (state, _o, rng) => ({ memberId: randomMember(state, rng), otherId: null, objId: null, objCatalog: null }),
    text: (state, inc) => `${named(state, inc.memberId)} opened the lost-and-found crate and found three rations nobody claimed.`,
    auto: (state) => { state.pantry = Math.min(PANTRY_CAP, state.pantry + 3); },
  },
  {
    id: "signal", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH, title: "A postcard from home", tone: "success",
    pick: (state, _o, rng) => ({ memberId: randomMember(state, rng), otherId: null, objId: null, objCatalog: null }),
    text: (state, inc) => `A postcard from home came through the mail tube for ${named(state, inc.memberId)}. They read it six times.`,
    auto: (state, inc) => { const m = inc.memberId === null ? undefined : state.members[inc.memberId]; if (m) { bumpNeed(m, "social", 22); stress(m, -10); } },
  },
  {
    id: "flare", cost: 14, weight: 1.1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 0.4, title: "Solar flare warning", tone: "warn",
    when: (r) => r.state.incident == null && boardingOf(r.state).rooms.some((room) => !room.shuttered && room.tenantId !== null),
    text: () => "The station's star is throwing a tantrum. For six hours every unshuttered room goes bright and hot.",
    choices: [
      { id: "shutters", label: "Shutter every room", detail: (s) => `${unshuttered(s) * SHUTTER_COST} credits for ${unshuttered(s)} rooms, kept for good`, blocked: (s) => afford(unshuttered(s) * SHUTTER_COST)(s),
        apply: (s) => { const n = unshuttered(s); spend(s, n * SHUTTER_COST); for (const room of boardingOf(s).rooms) room.shuttered = true; return `Flare shutters went up on ${n} rooms.`; } },
      { id: "ride", label: "Ride it out", detail: () => "Rooms bright and a step hotter for 6 hours", apply: (s, _i, now) => { boardingOf(s).flareUntil = now + HOUR * 6; return "The flare washed through the portholes. Krrt is not amused."; } },
    ],
    fallback: "ride",
  },
  {
    id: "eggs", cost: 12, weight: 0.9, cooldownSeconds: DAY_LENGTH * 3, after: DAY_LENGTH * 1.2, title: "A surprise egg clutch", tone: "info",
    when: (r) => r.state.incident == null && members(r.state).some((m) => EGG_LAYERS.has(m.species ?? "") && roomOf(r.state, m.id) !== null),
    pick: (state, _o, rng) => { const id = randomMember(state, rng, (m) => EGG_LAYERS.has(m.species ?? "") && roomOf(state, m.id) !== null); return id === null ? null : { memberId: id, otherId: null, objId: null, objCatalog: null }; },
    text: (s, inc) => `${named(s, inc.memberId)} laid a clutch of eggs in their room overnight. They are humming. The eggs, that is.`,
    choices: [
      { id: "keep", label: "Let them keep the clutch", detail: () => "Parent delighted (-25 stress); their room a step louder for a day",
        apply: (s, inc, now) => { const m = inc.memberId ? s.members[inc.memberId] : undefined; const room = m ? roomOf(s, m.id) : null; if (m) { stress(m, -25); bumpNeed(m, "fun", 20); } if (room) boardingOf(s).noisyUntil[room.id] = now + DAY_LENGTH; boardingOf(s).reputation = Math.min(100, boardingOf(s).reputation + 3); return `${named(s, inc.memberId)} is nesting. The neighbours can hear the humming.`; } },
      { id: "creche", label: "Book the station crèche", detail: () => "40 credits; parent +10 stress", blocked: afford(40),
        apply: (s, inc) => { spend(s, 40); const m = inc.memberId ? s.members[inc.memberId] : undefined; if (m) stress(m, 10); return "The eggs went to the station crèche with a little hat each."; } },
    ],
    fallback: "keep",
  },
  {
    id: "molt", cost: 16, weight: 1, cooldownSeconds: DAY_LENGTH * 2.5, after: DAY_LENGTH * 0.8, title: "Krrt molted in the bathroom", tone: "warn",
    when: (r) => r.state.incident == null && speciesHolder(r.state, "krrt") !== null && r.objects.some((o) => o.catalogId === "sleep_pod" && !(r.state.hazards?.broken ?? []).includes(o.instanceId)),
    pick: (state, objects) => {
      const pod = objects.find((o) => o.catalogId === "sleep_pod" && !(state.hazards?.broken ?? []).includes(o.instanceId));
      const krrt = speciesHolder(state, "krrt");
      if (pod === undefined || krrt === null) return null;
      breakObject(state, pod.instanceId);
      return { memberId: krrt.id, otherId: null, objId: pod.instanceId, objCatalog: pod.catalogId };
    },
    text: (s, inc) => `${named(s, inc.memberId)} molted in the shared ${brokenName(s, inc)}. There is a whole second ${named(s, inc.memberId)} in there, empty and crunchy. Nobody can nap until it is cleared.`,
    choices: [
      { id: "clean", label: "Hire the station cleaners", detail: () => "25 credits", blocked: afford(25), apply: (s, inc) => { spend(s, 25); if (inc.objId) repairObject(s, inc.objId); return "The cleaners took the shed shell away in a very large bag."; } },
      { id: "handy", label: "Ask the handy tenant", detail: () => "The handy tenant loses 35 rest", blocked: needTrait("handy", "Handy"),
        apply: (s, inc) => { const m = traitHolder(s, "handy"); if (m) bumpNeed(m, "energy", -35); if (inc.objId) repairObject(s, inc.objId); return `${m?.name ?? "A handy tenant"} cleared the molt and kept a leg as a souvenir.`; } },
      { id: "leave", label: "Leave it for now", detail: () => "Clean it later from Pantry & bills", apply: (s, inc) => `The ${brokenName(s, inc)} stays crunchy for now.` },
    ],
    fallback: "leave",
  },
  {
    id: "trader", cost: 0, weight: 1.2, cooldownSeconds: DAY_LENGTH * 1.5, title: "A galley trader docks", tone: "info",
    when: (r) => r.state.incident == null,
    text: () => "A trader's skiff is at the airlock with crates of rations and an eye on your galley.",
    choices: [
      { id: "buy", label: "Buy 8 rations", detail: () => "40 credits", blocked: (s) => afford(40)(s) ?? (s.pantry + 8 > PANTRY_CAP ? "No pantry room" : null),
        apply: (s) => { spend(s, 40); s.pantry += 8; return "Bought 8 rations for 40 credits."; } },
      { id: "haggle", label: "Haggle (Thrifty)", detail: () => "8 rations for 28 credits", blocked: (s) => needTrait("thrifty", "Thrifty")(s) ?? afford(28)(s) ?? (s.pantry + 8 > PANTRY_CAP ? "No pantry room" : null),
        apply: (s) => { spend(s, 28); s.pantry += 8; return `${traitHolder(s, "thrifty")?.name ?? "A thrifty tenant"} haggled 8 rations down to 28 credits.`; } },
      { id: "sell", label: "Sell 5 rations", detail: () => "+40 credits", blocked: (s) => (s.pantry >= 5 ? null : "Needs 5 rations"),
        apply: (s) => { s.pantry -= 5; s.credits = creditAmount(s.credits + 40); return "Sold 5 rations for 40 credits."; } },
      { id: "decline", label: "Wave it off", detail: () => "Nothing changes", apply: () => "The skiff drifted on." },
    ],
    fallback: "decline",
  },
  {
    id: "overtime", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH, title: "Overtime on the docks", tone: "info",
    when: (r) => r.state.incident == null,
    text: () => "The docks will pay for an extra night of gig work. The gig-shift tenants would carry it.",
    choices: [
      { id: "accept", label: "Take the overtime", detail: (s) => `+110 credits; ${members(s).filter((m) => m.lifestyle === "yield").length} gig tenants +22 stress, -20 rest`,
        apply: (s) => { s.credits = creditAmount(s.credits + 110); s.dayIncome = creditAmount(s.dayIncome + 110); for (const m of members(s)) if (m.lifestyle === "yield") { stress(m, 22); bumpNeed(m, "energy", -20); } return "The gig tenants worked a night on the docks: +110 credits."; } },
      { id: "decline", label: "Turn it down", detail: () => "Nothing changes", apply: () => "The house kept its evening." },
    ],
    fallback: "decline",
  },
  {
    id: "dust", cost: 12, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 0.6, title: "Spore drift", tone: "warn",
    when: (r) => r.state.incident == null && r.objects.some((o) => o.catalogId === "bloom_planter"),
    text: () => "A cloud of wild spores is drifting down the station's air ducts. Open hydro trays will lose part of the next harvests.",
    choices: [
      { id: "seal", label: "Cover the trays", detail: () => "30 credits", blocked: afford(30), apply: (s) => { spend(s, 30); return "The hydro trays were covered in time."; } },
      { id: "endure", label: "Let it drift", detail: () => "Hydro harvests -1 ration for a day", apply: (s, _i, now) => { hazards(s).dustUntil = now + DAY_LENGTH; return "Spores settled in the trays: harvests are thinner for a day."; } },
    ],
    fallback: "endure",
  },
  {
    id: "brownout", cost: 18, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH, title: "Station brownout", tone: "warn",
    when: (r) => r.state.incident == null && r.objects.some((o) => o.catalogId === "work_console"),
    text: () => "The station grid is browning out. Without backup cells the Gig Terminals go dark for four hours.",
    choices: [
      { id: "cells", label: "Buy backup cells", detail: () => "45 credits", blocked: afford(45), apply: (s) => { spend(s, 45); return "Backup cells kept the terminals lit."; } },
      { id: "dark", label: "Wait it out", detail: () => "Terminals pay nothing for 4 hours", apply: (s, _i, now) => { hazards(s).consolesOfflineUntil = now + HOUR * 4; return "The Gig Terminals went dark for four hours."; } },
    ],
    fallback: "dark",
  },
  {
    id: "spoilage", cost: 15, weight: 1, cooldownSeconds: DAY_LENGTH * 2, title: "Galley mould", tone: "warn",
    when: (r) => r.state.incident == null && r.state.pantry >= 6,
    text: (s) => `Something fuzzy has moved into the galley. (Not Glorp.) Left alone it takes ${spoiled(s)} of ${s.pantry} rations.`,
    choices: [
      { id: "stasis", label: "Stasis treatment", detail: () => "30 credits", blocked: afford(30), apply: (s) => { spend(s, 30); return "Stasis treatment saved the pantry."; } },
      { id: "spot", label: "Sort it early (Thrifty)", detail: () => "Lose 1 ration", blocked: needTrait("thrifty", "Thrifty"), apply: (s) => { s.pantry = Math.max(0, s.pantry - 1); return `${traitHolder(s, "thrifty")?.name ?? "A thrifty tenant"} sorted the crates; one ration lost.`; } },
      { id: "toss", label: "Throw out the spoiled", detail: (s) => `Lose ${spoiled(s)} rations`, apply: (s) => { const n = spoiled(s); s.pantry = Math.max(0, s.pantry - n); return `${n} rations went to the recycler.`; } },
    ],
    fallback: "toss",
  },
  {
    id: "traveller", cost: 14, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 0.5, title: "A stranded traveller", tone: "info",
    when: (r) => r.state.incident == null && r.state.pantry >= 4,
    text: () => "A stranded traveller at the airlock asks for four rations to reach the next ring.",
    choices: [
      { id: "share", label: "Share 4 rations", detail: () => "Everyone +10 company; kind tenants glad", blocked: (s) => (s.pantry >= 4 ? null : "Needs 4 rations"),
        apply: (s) => { s.pantry -= 4; for (const m of members(s)) { bumpNeed(m, "social", 10); if (hasTrait(m, "kind")) { bumpNeed(m, "fun", 20); stress(m, -12); } } boardingOf(s).reputation = Math.min(100, boardingOf(s).reputation + 2); return "The traveller left with four rations and a story about this house."; } },
      { id: "refuse", label: "Refuse", detail: () => "Kind tenants +22 stress", apply: (s) => { for (const m of members(s)) if (hasTrait(m, "kind")) stress(m, 22); return "The airlock stayed shut."; } },
    ],
    fallback: "refuse",
  },
  {
    id: "quarrel", cost: 16, weight: 1.1, cooldownSeconds: DAY_LENGTH * 1.5, after: DAY_LENGTH, title: "A row in the hallway", tone: "warn",
    when: (r) => r.state.incident == null && quarrelPair(r.state) !== null,
    pick: (state) => { const pair = quarrelPair(state); return pair === null ? null : { memberId: pair[0], otherId: pair[1], objId: null, objCatalog: null }; },
    text: (s, inc) => `${named(s, inc.memberId)} and ${named(s, inc.otherId)} are rowing in the hallway over whose turn it is in the bathroom.`,
    choices: [
      { id: "meal", label: "Shared meal", detail: () => "2 rations; their opinion +14", blocked: (s) => (s.pantry >= 2 ? null : "Needs 2 rations"),
        apply: (s, inc) => { s.pantry -= 2; if (inc.memberId && inc.otherId) shiftOpinion(s, inc.memberId, inc.otherId, 14); return `${named(s, inc.memberId)} and ${named(s, inc.otherId)} made up over a shared meal.`; } },
      { id: "cool", label: "Let them cool off", detail: () => "Their opinion -15; both +12 stress",
        apply: (s, inc) => { if (inc.memberId && inc.otherId) shiftOpinion(s, inc.memberId, inc.otherId, -15); for (const id of [inc.memberId, inc.otherId]) { const m = id ? s.members[id] : undefined; if (m) stress(m, 12); } return `${named(s, inc.memberId)} and ${named(s, inc.otherId)} are not speaking.`; } },
    ],
    fallback: "cool",
  },
  {
    id: "fever", cost: 22, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 1.5, title: "Space flu", tone: "warn",
    when: (r) => r.state.incident == null,
    pick: (state, _o, rng) => { const id = randomMember(state, rng, (m) => (m.illUntil ?? 0) <= 0 && m.species !== "pip" && m.species !== "basalt"); return id === null ? null : { memberId: id, otherId: null, objId: null, objCatalog: null }; },
    text: (s, inc) => `${named(s, inc.memberId)} has space flu and is sneezing in three colours.`,
    choices: [
      { id: "medicine", label: "Buy medicine", detail: () => "45 credits", blocked: afford(45), apply: (s, inc) => { spend(s, 45); return `${named(s, inc.memberId)} took medicine and is on the mend.`; } },
      { id: "rest", label: "Rest it off", detail: () => "No paid work for a day; rest drains faster; +15 stress",
        apply: (s, inc, now) => { const m = inc.memberId ? s.members[inc.memberId] : undefined; if (m) { m.illUntil = now + DAY_LENGTH; stress(m, 15); } return `${named(s, inc.memberId)} is off sick for a day.`; } },
    ],
    fallback: "rest",
  },
  {
    id: "meteor", cost: 34, weight: 1, cooldownSeconds: DAY_LENGTH * 2.5, after: DAY_LENGTH * 3, title: "Micrometeor strike", tone: "deny",
    when: (r) => r.state.incident == null && r.objects.some((o) => FURNITURE_BY_ID[o.catalogId] !== undefined && !(r.state.hazards?.broken ?? []).includes(o.instanceId)),
    pick: (state, objects, rng) => {
      const pool = objects.filter((o) => FURNITURE_BY_ID[o.catalogId] !== undefined && !(state.hazards?.broken ?? []).includes(o.instanceId));
      if (pool.length === 0) return null;
      const target = pool[Math.floor(rng() * pool.length) % pool.length]!;
      breakObject(state, target.instanceId);
      return { memberId: null, otherId: null, objId: target.instanceId, objCatalog: target.catalogId };
    },
    text: (s, inc) => `A micrometeor punched through the commons and wrecked the ${brokenName(s, inc)}. It is out of service.`,
    choices: [
      { id: "repair", label: "Repair now", detail: (s, inc) => `${repairOf(inc)} credits`, blocked: (s, inc) => afford(repairOf(inc))(s),
        apply: (s, inc) => { spend(s, repairOf(inc)); if (inc.objId) repairObject(s, inc.objId); return `The ${brokenName(s, inc)} is mended.`; } },
      { id: "handy", label: "Mend it (Handy)", detail: () => "The handy tenant loses 35 rest", blocked: needTrait("handy", "Handy"),
        apply: (s, inc) => { const m = traitHolder(s, "handy"); if (m) bumpNeed(m, "energy", -35); if (inc.objId) repairObject(s, inc.objId); return `${m?.name ?? "A handy tenant"} patched the ${brokenName(s, inc)} by hand.`; } },
      { id: "leave", label: "Leave it broken", detail: () => "Repair later from Pantry & bills", apply: (s, inc) => `The ${brokenName(s, inc)} stays broken for now.` },
    ],
    fallback: "leave",
  },
  {
    id: "hullLeak", cost: 40, weight: 0.8, cooldownSeconds: DAY_LENGTH * 4, after: DAY_LENGTH * 6, title: "Hull leak", tone: "deny",
    when: (r) => r.state.incident == null && !(r.state.hazards?.hullLeak ?? false),
    text: () => "A seam by the nap pods is hissing. Pods rest tenants half as fast until it is patched.",
    choices: [
      { id: "patch", label: "Patch the seam", detail: () => "70 credits", blocked: afford(70), apply: (s) => { spend(s, 70); return "The seam is patched."; } },
      { id: "handy", label: "Patch it (Handy)", detail: () => "The handy tenant loses 35 rest", blocked: needTrait("handy", "Handy"),
        apply: (s) => { const m = traitHolder(s, "handy"); if (m) bumpNeed(m, "energy", -35); return `${m?.name ?? "A handy tenant"} sealed the seam.`; } },
      { id: "leave", label: "Live with it", detail: () => "Pods at half speed; patch later from Pantry & bills", apply: (s) => { hazards(s).hullLeak = true; return "The nap pods hiss on."; } },
    ],
    fallback: "leave",
  },
  {
    id: "inspection", cost: 26, weight: 0.9, cooldownSeconds: DAY_LENGTH * 3, after: DAY_LENGTH * 4, title: "Station inspector", tone: "info",
    when: (r) => r.state.incident == null,
    text: (s) => inspectionPasses(s) ? "A station inspector with a clipboard walked every corridor and found the house in order: +40 credits and a good word to the station." : "A station inspector found debt, broken fittings or a miserable tenant: a 50-credit fine and a sniff.",
    auto: (s) => {
      if (inspectionPasses(s)) { s.credits = creditAmount(s.credits + 40); boardingOf(s).reputation = Math.min(100, boardingOf(s).reputation + 5); }
      else {
        boardingOf(s).reputation = Math.max(0, boardingOf(s).reputation - 5);
        if (s.credits >= 50) spend(s, 50);
        else s.debt = creditAmount(s.debt + 50);
      }
    },
  },
];

function unshuttered(state: HouseholdState): number {
  return boardingOf(state).rooms.filter((room) => !room.shuttered).length;
}

const INCIDENT_BY_ID: Record<string, IncidentDef> = Object.fromEntries(INCIDENTS.map((def) => [def.id, def]));

export function incidentDef(id: string): IncidentDef | undefined {
  return INCIDENT_BY_ID[id];
}

function inspectionPasses(state: HouseholdState): boolean {
  const miserable = state.order.some((id) => roomOf(state, id) !== null && tenantComfort(state, id).score < 30);
  return state.debt <= 0 && (state.hazards?.broken.length ?? 0) === 0 && !(state.hazards?.hullLeak ?? false) && !miserable;
}

function spoiled(state: HouseholdState): number {
  return Math.max(2, Math.ceil(state.pantry * 0.35));
}

function repairOf(incident: PendingIncident): number {
  return repairCost(incident.objCatalog ?? "");
}

function brokenName(_state: HouseholdState, incident: PendingIncident): string {
  return (incident.objCatalog !== null ? FURNITURE_BY_ID[incident.objCatalog]?.name : undefined) ?? "furnishing";
}

/** Threat points build faster as the charter goes on and as the household grows richer. */
export const STORY_CONFIG: StorytellerConfig<IncidentReading> = {
  incidents: INCIDENTS,
  pointsPerSecond: (elapsed) => 0.05 + (elapsed / DAY_LENGTH) * 0.012,
  scale: (r) => Math.min(1.8, Math.max(0.7, 0.7 + r.state.credits / 1500)) * (1 + charterOf(r.state).term * 0.15),
  maxPoints: 120,
  gap: { min: DAY_LENGTH * 0.28, max: DAY_LENGTH * 0.48 },
  firstAfter: DAY_LENGTH * 0.2,
  restPerPoint: 0.8,
  repeatPenalty: 0.2,
  memory: 4,
  preferSpend: 0.8,
};

/** One storyteller per household state; it carries no state of its own between steps. */
const teller = createStoryteller(STORY_CONFIG);

function incidentRng(state: HouseholdState, salt: number): () => number {
  return seededRng(`${state.seed}:story:${salt}`);
}

/** Advance the household's storyteller by `dt` and fire what it draws. */
export function advanceIncidents(state: HouseholdState, objects: readonly SceneObject[], now: number, dt: number, notices: Pick<NoticeFeed, "push">): void {
  if (state.order.length === 0 || charterOf(state).outcome === "evicted") return;
  expireHazards(state, now);
  // The term letter covers the slip, so a waiting transmission's answer clock holds until it is read.
  if (state.incident != null && charterOf(state).review !== null) state.incident.deadline += dt;
  if (state.incident != null && now >= state.incident.deadline) answerIncident(state, null, now, notices);
  if (state.story !== undefined) teller.restore(state.story);
  else teller.restore({ elapsed: 0, points: 0, nextAt: STORY_CONFIG.firstAfter ?? 0, lastFiredAt: {}, recent: [], fired: 0 });
  // The storyteller runs on whole game seconds, so a slow frame and a fast one draw the same incident
  // at the same moment.
  const ticks = Math.floor(now) - Math.floor(now - dt);
  let beat = null;
  for (let i = 0; i < ticks && beat === null; i++) beat = teller.advance(1, { state, objects }, incidentRng(state, teller.view().fired));
  state.story = teller.snapshot();
  if (beat === null) return;
  const rng = incidentRng(state, beat.incident.id.length + teller.view().fired * 31);
  const def = INCIDENT_BY_ID[beat.incident.id];
  if (def === undefined) return;
  const target = def.pick === undefined ? { memberId: null, otherId: null, objId: null, objCatalog: null } : def.pick(state, objects, rng);
  if (target === null) return;
  const pending: PendingIncident = { id: def.id, ...target, deadline: now + ANSWER_SECONDS };
  if (def.auto !== undefined || def.choices === undefined) {
    const text = def.text(state, pending);
    def.auto?.(state, pending, now);
    noteEvent(state, notices, text, def.tone);
    return;
  }
  state.incident = pending;
  noteEvent(state, notices, `Front desk: ${def.title}. ${def.text(state, pending)}`, def.tone);
}

/** Answer the waiting transmission; `choiceId` null takes its default. Returns false when refused. */
export function answerIncident(state: HouseholdState, choiceId: string | null, now: number, notices: Pick<NoticeFeed, "push">): boolean {
  const pending = state.incident;
  if (pending == null) return false;
  const def = INCIDENT_BY_ID[pending.id];
  if (def === undefined || def.choices === undefined) { state.incident = null; return false; }
  const chosen = def.choices.find((c) => c.id === (choiceId ?? def.fallback));
  if (chosen === undefined) return false;
  if (choiceId !== null && chosen.blocked?.(state, pending) != null) return false;
  const result = chosen.apply(state, pending, now);
  state.incident = null;
  if (choiceId !== null) {
    const charter = charterOf(state);
    state.charter = { ...charter, answered: charter.answered + 1 };
  }
  noteEvent(state, notices, choiceId === null ? `No answer in time — ${result}` : result, choiceId === null ? "warn" : "info");
  return true;
}

function expireHazards(state: HouseholdState, now: number): void {
  const h = state.hazards;
  if (h === undefined) return;
  if (h.consolesOfflineUntil > 0 && now >= h.consolesOfflineUntil) h.consolesOfflineUntil = 0;
  if (h.dustUntil > 0 && now >= h.dustUntil) h.dustUntil = 0;
  for (const m of members(state)) if (m.illUntil !== undefined && m.illUntil > 0 && now >= m.illUntil) m.illUntil = 0;
}

export function isObjectBroken(state: HouseholdState, objId: string): boolean {
  return state.hazards?.broken.includes(objId) ?? false;
}

export function isIll(member: MemberState, now: number): boolean {
  return (member.illUntil ?? 0) > now;
}

export function consolesOffline(state: HouseholdState, now: number): boolean {
  return (state.hazards?.consolesOfflineUntil ?? 0) > now;
}

export function dusty(state: HouseholdState, now: number): boolean {
  return (state.hazards?.dustUntil ?? 0) > now;
}

/** How fast a Nap Pod rests a tenant: half while the hull leaks. */
export function restFactor(state: HouseholdState): number {
  return state.hazards?.hullLeak === true ? 0.5 : 1;
}

export type { NeedId };
