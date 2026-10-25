import { createStoryteller, type StoryIncident, type StorytellerConfig } from "@jgengine/core/ai/director/storyteller";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";
import { seededRng } from "@jgengine/core/random/rng";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { bumpNeed, householdBook, syncBook } from "../agents";
import { clamp, type NeedId } from "../needs/needs";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { createHazards, noteEvent, type HabitatHazards, type HouseholdState, type MemberState, type PendingIncident } from "../session/types";
import { hasTrait, stressFactor } from "../traits";
import { DAY_LENGTH } from "../../world";
import { charterOf } from "./charter";
import { creditAmount, PANTRY_CAP } from "./economy";

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
  member.stress = clamp(member.stress + (amount > 0 ? amount * stressFactor(member) : amount));
}

function spend(state: HouseholdState, credits: number): void {
  state.credits = creditAmount(state.credits - credits);
}

function afford(credits: number) {
  return (state: HouseholdState) => (state.credits >= credits ? null : `Needs ${credits} credits`);
}

function needTrait(trait: Parameters<typeof hasTrait>[1], word: string) {
  return (state: HouseholdState) => (members(state).some((m) => hasTrait(m, trait)) ? null : `Needs a ${word} being`);
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

/** The household's incident book: four boons, two offers and eight kinds of trouble. */
export const INCIDENTS: readonly IncidentDef[] = [
  {
    id: "comet", cost: 0, weight: 1, cooldownSeconds: DAY_LENGTH * 2, title: "A comet passes", tone: "success",
    text: () => "A comet lit the dome. The whole household felt lighter.",
    auto: (state) => { for (const m of members(state)) bumpNeed(m, "fun", 14); },
  },
  {
    id: "cache", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH * 2, title: "Ration crystals", tone: "success",
    pick: (state, _o, rng) => ({ memberId: randomMember(state, rng), otherId: null, objId: null, objCatalog: null }),
    text: (state, inc) => `${named(state, inc.memberId)} found a cache of ration crystals: +3 rations.`,
    auto: (state) => { state.pantry = Math.min(PANTRY_CAP, state.pantry + 3); },
  },
  {
    id: "signal", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH, title: "A friendly signal", tone: "success",
    pick: (state, _o, rng) => ({ memberId: randomMember(state, rng), otherId: null, objId: null, objCatalog: null }),
    text: (state, inc) => `${named(state, inc.memberId)} sent out a signal and got a warm reply.`,
    auto: (state, inc) => { const m = inc.memberId === null ? undefined : state.members[inc.memberId]; if (m) { bumpNeed(m, "social", 22); stress(m, -10); } },
  },
  {
    id: "trader", cost: 0, weight: 1.2, cooldownSeconds: DAY_LENGTH * 1.5, title: "A trader's skiff docks", tone: "info",
    when: (r) => r.state.incident == null,
    text: () => "A trader's skiff is at the airlock with crates of rations and an eye on the pantry.",
    choices: [
      { id: "buy", label: "Buy 8 rations", detail: () => "40 credits", blocked: (s) => afford(40)(s) ?? (s.pantry + 8 > PANTRY_CAP ? "No pantry room" : null),
        apply: (s) => { spend(s, 40); s.pantry += 8; return "Bought 8 rations for 40 credits."; } },
      { id: "haggle", label: "Haggle (Thrifty)", detail: () => "8 rations for 28 credits", blocked: (s) => needTrait("thrifty", "Thrifty")(s) ?? afford(28)(s) ?? (s.pantry + 8 > PANTRY_CAP ? "No pantry room" : null),
        apply: (s) => { spend(s, 28); s.pantry += 8; return `${traitHolder(s, "thrifty")?.name ?? "A thrifty being"} haggled 8 rations down to 28 credits.`; } },
      { id: "sell", label: "Sell 5 rations", detail: () => "+40 credits", blocked: (s) => (s.pantry >= 5 ? null : "Needs 5 rations"),
        apply: (s) => { s.pantry -= 5; s.credits = creditAmount(s.credits + 40); return "Sold 5 rations for 40 credits."; } },
      { id: "decline", label: "Wave it off", detail: () => "Nothing changes", apply: () => "The skiff drifted on." },
    ],
    fallback: "decline",
  },
  {
    id: "overtime", cost: 0, weight: 0.8, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH, title: "Overtime offered", tone: "info",
    when: (r) => r.state.incident == null,
    text: () => "The Authority will pay for an extra night of console work. The Yield rhythm would carry it.",
    choices: [
      { id: "accept", label: "Take the overtime", detail: (s) => `+110 credits; ${members(s).filter((m) => m.lifestyle === "yield").length} Yield beings +22 stress, -20 rest`,
        apply: (s) => { s.credits = creditAmount(s.credits + 110); s.dayIncome = creditAmount(s.dayIncome + 110); for (const m of members(s)) if (m.lifestyle === "yield") { stress(m, 22); bumpNeed(m, "energy", -20); } return "The Yield rhythm worked a night of overtime: +110 credits."; } },
      { id: "decline", label: "Turn it down", detail: () => "Nothing changes", apply: () => "The household kept its evening." },
    ],
    fallback: "decline",
  },
  {
    id: "dust", cost: 12, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 0.6, title: "Dust storm", tone: "warn",
    when: (r) => r.state.incident == null && r.objects.some((o) => o.catalogId === "bloom_planter"),
    text: () => "A dust front is rolling over the dome. Planters left open will lose part of the next harvests.",
    choices: [
      { id: "seal", label: "Seal the planters", detail: () => "30 credits", blocked: afford(30), apply: (s) => { spend(s, 30); return "The planters were sealed in time."; } },
      { id: "endure", label: "Let it blow", detail: () => "Bloom harvests -1 ration for a day", apply: (s, _i, now) => { hazards(s).dustUntil = now + DAY_LENGTH; return "Dust settled in the planters: harvests are thinner for a day."; } },
    ],
    fallback: "endure",
  },
  {
    id: "brownout", cost: 18, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH, title: "Brownout", tone: "warn",
    when: (r) => r.state.incident == null && r.objects.some((o) => o.catalogId === "work_console"),
    text: () => "The grid is browning out. Without backup cells the Yield Consoles go dark for four hours.",
    choices: [
      { id: "cells", label: "Buy backup cells", detail: () => "45 credits", blocked: afford(45), apply: (s) => { spend(s, 45); return "Backup cells kept the consoles lit."; } },
      { id: "dark", label: "Wait it out", detail: () => "Consoles pay nothing for 4 hours", apply: (s, _i, now) => { hazards(s).consolesOfflineUntil = now + HOUR * 4; return "The Yield Consoles went dark for four hours."; } },
    ],
    fallback: "dark",
  },
  {
    id: "spoilage", cost: 15, weight: 1, cooldownSeconds: DAY_LENGTH * 2, title: "Pantry mould", tone: "warn",
    when: (r) => r.state.incident == null && r.state.pantry >= 6,
    text: (s) => `Mould has crept into the pantry. Left alone it takes ${spoiled(s)} of ${s.pantry} rations.`,
    choices: [
      { id: "stasis", label: "Stasis treatment", detail: () => "30 credits", blocked: afford(30), apply: (s) => { spend(s, 30); return "Stasis treatment saved the pantry."; } },
      { id: "spot", label: "Sort it early (Thrifty)", detail: () => "Lose 1 ration", blocked: needTrait("thrifty", "Thrifty"), apply: (s) => { s.pantry = Math.max(0, s.pantry - 1); return `${traitHolder(s, "thrifty")?.name ?? "A thrifty being"} sorted the crates; one ration lost.`; } },
      { id: "toss", label: "Throw out the spoiled", detail: (s) => `Lose ${spoiled(s)} rations`, apply: (s) => { const n = spoiled(s); s.pantry = Math.max(0, s.pantry - n); return `${n} rations went to the recycler.`; } },
    ],
    fallback: "toss",
  },
  {
    id: "traveller", cost: 14, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 0.5, title: "A stranded traveller", tone: "info",
    when: (r) => r.state.incident == null && r.state.pantry >= 4,
    text: () => "A stranded traveller asks for four rations to reach the next ring.",
    choices: [
      { id: "share", label: "Share 4 rations", detail: () => "Everyone +10 bond; kind beings glad", blocked: (s) => (s.pantry >= 4 ? null : "Needs 4 rations"),
        apply: (s) => { s.pantry -= 4; for (const m of members(s)) { bumpNeed(m, "social", 10); if (hasTrait(m, "kind")) { bumpNeed(m, "fun", 20); stress(m, -12); } } return "The traveller left with four rations and a story about this household."; } },
      { id: "refuse", label: "Refuse", detail: () => "Kind beings +22 stress", apply: (s) => { for (const m of members(s)) if (hasTrait(m, "kind")) stress(m, 22); return "The airlock stayed shut."; } },
    ],
    fallback: "refuse",
  },
  {
    id: "quarrel", cost: 16, weight: 1.1, cooldownSeconds: DAY_LENGTH * 1.5, after: DAY_LENGTH, title: "A quarrel", tone: "warn",
    when: (r) => r.state.incident == null && quarrelPair(r.state) !== null,
    pick: (state) => { const pair = quarrelPair(state); return pair === null ? null : { memberId: pair[0], otherId: pair[1], objId: null, objCatalog: null }; },
    text: (s, inc) => `${named(s, inc.memberId)} and ${named(s, inc.otherId)} are quarrelling over whose turn it is.`,
    choices: [
      { id: "meal", label: "Shared meal", detail: () => "2 rations; their opinion +14", blocked: (s) => (s.pantry >= 2 ? null : "Needs 2 rations"),
        apply: (s, inc) => { s.pantry -= 2; if (inc.memberId && inc.otherId) shiftOpinion(s, inc.memberId, inc.otherId, 14); return `${named(s, inc.memberId)} and ${named(s, inc.otherId)} made up over a shared meal.`; } },
      { id: "cool", label: "Let them cool off", detail: () => "Their opinion -15; both +12 stress",
        apply: (s, inc) => { if (inc.memberId && inc.otherId) shiftOpinion(s, inc.memberId, inc.otherId, -15); for (const id of [inc.memberId, inc.otherId]) { const m = id ? s.members[id] : undefined; if (m) stress(m, 12); } return `${named(s, inc.memberId)} and ${named(s, inc.otherId)} are not speaking.`; } },
    ],
    fallback: "cool",
  },
  {
    id: "fever", cost: 22, weight: 1, cooldownSeconds: DAY_LENGTH * 2, after: DAY_LENGTH * 1.5, title: "A fever", tone: "warn",
    when: (r) => r.state.incident == null,
    pick: (state, _o, rng) => { const id = randomMember(state, rng, (m) => (m.illUntil ?? 0) <= 0); return id === null ? null : { memberId: id, otherId: null, objId: null, objCatalog: null }; },
    text: (s, inc) => `${named(s, inc.memberId)} is running a fever.`,
    choices: [
      { id: "medicine", label: "Buy medicine", detail: () => "45 credits", blocked: afford(45), apply: (s, inc) => { spend(s, 45); return `${named(s, inc.memberId)} took medicine and is on the mend.`; } },
      { id: "rest", label: "Rest it off", detail: () => "No paid work for a day; rest drains faster; +15 stress",
        apply: (s, inc, now) => { const m = inc.memberId ? s.members[inc.memberId] : undefined; if (m) { m.illUntil = now + DAY_LENGTH; stress(m, 15); } return `${named(s, inc.memberId)} is sick for a day.`; } },
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
    text: (s, inc) => `A micrometeor punched through the dome and wrecked the ${brokenName(s, inc)}. It is out of service.`,
    choices: [
      { id: "repair", label: "Repair now", detail: (s, inc) => `${repairOf(inc)} credits`, blocked: (s, inc) => afford(repairOf(inc))(s),
        apply: (s, inc) => { spend(s, repairOf(inc)); if (inc.objId) repairObject(s, inc.objId); return `The ${brokenName(s, inc)} is mended.`; } },
      { id: "handy", label: "Mend it (Handy)", detail: () => "The handy being loses 35 rest", blocked: needTrait("handy", "Handy"),
        apply: (s, inc) => { const m = traitHolder(s, "handy"); if (m) bumpNeed(m, "energy", -35); if (inc.objId) repairObject(s, inc.objId); return `${m?.name ?? "A handy being"} patched the ${brokenName(s, inc)} by hand.`; } },
      { id: "leave", label: "Leave it broken", detail: () => "Repair later from Pantry & bills", apply: (s, inc) => `The ${brokenName(s, inc)} stays broken for now.` },
    ],
    fallback: "leave",
  },
  {
    id: "hullLeak", cost: 40, weight: 0.8, cooldownSeconds: DAY_LENGTH * 4, after: DAY_LENGTH * 6, title: "Hull leak", tone: "deny",
    when: (r) => r.state.incident == null && !(r.state.hazards?.hullLeak ?? false),
    text: () => "A seam in the torpor wing is hissing. Pods rest beings half as fast until it is patched.",
    choices: [
      { id: "patch", label: "Patch the seam", detail: () => "70 credits", blocked: afford(70), apply: (s) => { spend(s, 70); return "The seam is patched."; } },
      { id: "handy", label: "Patch it (Handy)", detail: () => "The handy being loses 35 rest", blocked: needTrait("handy", "Handy"),
        apply: (s) => { const m = traitHolder(s, "handy"); if (m) bumpNeed(m, "energy", -35); return `${m?.name ?? "A handy being"} sealed the seam.`; } },
      { id: "leave", label: "Live with it", detail: () => "Pods at half speed; patch later from Pantry & bills", apply: (s) => { hazards(s).hullLeak = true; return "The torpor wing hisses on."; } },
    ],
    fallback: "leave",
  },
  {
    id: "inspection", cost: 26, weight: 0.9, cooldownSeconds: DAY_LENGTH * 3, after: DAY_LENGTH * 4, title: "Authority inspection", tone: "info",
    when: (r) => r.state.incident == null,
    text: (s) => inspectionPasses(s) ? "An Authority inspector walked the habitat and found it in order: +40 credits." : "An Authority inspector found debt or broken furnishings: a 50-credit fine.",
    auto: (s) => {
      if (inspectionPasses(s)) s.credits = creditAmount(s.credits + 40);
      else if (s.credits >= 50) spend(s, 50);
      else s.debt = creditAmount(s.debt + 50);
    },
  },
];

const INCIDENT_BY_ID: Record<string, IncidentDef> = Object.fromEntries(INCIDENTS.map((def) => [def.id, def]));

export function incidentDef(id: string): IncidentDef | undefined {
  return INCIDENT_BY_ID[id];
}

function inspectionPasses(state: HouseholdState): boolean {
  return state.debt <= 0 && (state.hazards?.broken.length ?? 0) === 0 && !(state.hazards?.hullLeak ?? false);
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
  noteEvent(state, notices, `Transmission: ${def.title}. ${def.text(state, pending)}`, def.tone);
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

export function isBroken(state: HouseholdState, objId: string): boolean {
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

/** How fast a Torpor Pod rests a being: half while the hull leaks. */
export function restFactor(state: HouseholdState): number {
  return state.hazards?.hullLeak === true ? 0.5 : 1;
}

export type { NeedId };
