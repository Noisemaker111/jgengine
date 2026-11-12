import { createAgent, type Agent } from "@jgengine/core/agents/agent";
import { readMood, type Mood, type MoodTier } from "@jgengine/core/agents/mood";
import {
  createRelationshipBook,
  type RelationshipBook,
  type RelationshipMilestone,
} from "@jgengine/core/agents/relationships";
import type { UtilityOption } from "@jgengine/core/ai/utilityBrain";
import type { NeedDefinition } from "@jgengine/core/sim/needs";

import { DAY_LENGTH } from "../world";
import { NEEDS, NEED_DEFS, emptyNeeds, type NeedId } from "./needs/needs";
import type { AlienBodyPlan } from "./creatures/bodyPlan";
import { decayFactor } from "./traits";
import { pairKey, type HouseholdState, type MemberState } from "./session/types";

/** The household's tone on the shared mood scale; the face is the game's own art. */
/** Pair levels the crew reaches, by opinion of each other. */
export const PAIR_MILESTONES: readonly RelationshipMilestone[] = [
  { id: "friends", label: "Friends", at: 35 },
  { id: "close", label: "Close", at: 70 },
  { id: "bonded", label: "Bonded", at: 95, requiresFamiliarity: 0.5 },
];

export const MOOD_TIERS: readonly MoodTier[] = [
  { at: 82, id: "radiant", label: "Radiant" },
  { at: 64, id: "content", label: "Content" },
  { at: 45, id: "fine", label: "Fine" },
  { at: 26, id: "glum", label: "Glum" },
  { at: 0, id: "low", label: "Low" },
];

export const MOOD_FACE: Record<string, string> = {
  radiant: "✦ᴗ✦",
  content: "◕‿◕",
  fine: "•‿•",
  glum: "•︵•",
  low: "×﹏×",
};

const MOOD_WEIGHTS = [
  { need: "hunger", weight: 3 },
  { need: "energy", weight: 2.8 },
  { need: "social", weight: 2.1 },
  { need: "fun", weight: 2.1 },
];

/** Mood read straight off a being's need record - no agent needed, safe for a HUD frame. */
export function moodOfNeeds(needs: Readonly<Record<NeedId, number>>): Mood & { face: string } {
  const mood = readMood(
    { ids: () => NEEDS, fraction: (id) => (needs[id as NeedId] ?? 0) / 100 },
    MOOD_WEIGHTS,
    MOOD_TIERS,
  );
  return { ...mood, face: MOOD_FACE[mood.tier] ?? "•‿•" };
}

/**
 * When a being wants something, as need fills (0-1): it heads for the station of its emptiest need
 * below `seek`, and below `browse` once nothing else calls; it wants company below `socialWant`; and
 * it is fit for a paid shift once both energy and hunger are above `workReady`.
 */
export const DESIRE = { seek: 0.48, browse: 0.62, socialWant: 0.6, workReady: 0.58 } as const;

const below = (at: number, value: number) => ({ kind: "threshold" as const, at, value });

/**
 * What a being can choose to do, scored by the shared utility brain as a ladder: every rung's appeal
 * clears every rung below it, so a being does the highest rung the habitat offers it.
 *
 * 30 talk to an idle companion when bonding is its emptiest need; 20 seek the emptiest need's station
 * below `seek`; 10 take a paid shift when fit for one; 5 talk to an idle companion when lonely; 3 seek
 * the emptiest need's station below `browse`; 1 wander. The station, companion and shift rules that
 * decide which of these are offered stay in `sim/ai`.
 */
export const MEMBER_OPTIONS: readonly UtilityOption[] = [
  ...NEEDS.map((need) => ({
    id: need,
    terms: [
      { need, curve: below(DESIRE.seek, 17), onlyWhenMostUrgent: true },
      { need, curve: below(DESIRE.browse, 3), onlyWhenMostUrgent: true },
    ],
  })),
  {
    id: "socialize",
    terms: [
      { need: "social", curve: below(DESIRE.socialWant, 25), onlyWhenMostUrgent: true },
      { need: "social", curve: below(DESIRE.socialWant, 5) },
    ],
  },
  // Fit for a shift takes both meters: one alone scores 0, under wandering.
  {
    id: "work",
    base: -10,
    terms: [
      { need: "energy", invert: true, curve: below(1 - DESIRE.workReady, 10) },
      { need: "hunger", invert: true, curve: below(1 - DESIRE.workReady, 10) },
    ],
  },
  { id: "wander", base: 1 },
];

/** Needs as the shared meter wants them: a per-day figure over the household's own day length. */
export function memberNeeds(plan: AlienBodyPlan, traits: Pick<MemberState, "traits"> = {}): NeedDefinition[] {
  const start = emptyNeeds();
  return NEEDS.map((need) => ({
    id: need,
    max: 100,
    min: 0,
    rate: (NEED_DEFS[need].decayPerDay / DAY_LENGTH) * plan.metabolism * decayFactor(traits, need),
    start: start[need],
  }));
}

/**
 * One agent per saved being. The WeakMap is keyed by the member object, so a second world in the
 * same process gets its own agents and an abandoned world's entries go with its objects.
 */
const agents = new WeakMap<MemberState, Agent>();

/** A new world brings new member objects, so there is nothing to clear; kept for the call sites. */
export function resetAgents(): void {}

/** The live agent for a being, built from its saved need record and kept for the session. */
export function memberAgent(member: MemberState, rng: () => number): Agent {
  const existing = agents.get(member);
  if (existing !== undefined) return existing;
  const agent = createAgent({
    id: member.id,
    needs: memberNeeds(member.bodyPlan, member),
    options: MEMBER_OPTIONS,
    mood: { tiers: MOOD_TIERS, weights: MOOD_WEIGHTS },
    // The ladder's rungs are whole points apart, so the pick is the top rung with no stickiness.
    switchMargin: 0,
    rng,
  });
  for (const need of NEEDS) {
    const saved = member.needs[need];
    if (Number.isFinite(saved)) agent.needs.refill(need, saved - agent.needs.value(need));
  }
  agents.set(member, agent);
  return agent;
}

/** Copy a being's live need values back into the plain record a save, HUD and tests read. */
export function syncMember(member: MemberState, rng: () => number): void {
  const agent = memberAgent(member, rng);
  for (const need of NEEDS) member.needs[need] = agent.needs.value(need);
}

/** A being's need value, from the live agent (or its record before the first tick). */
export function needValue(member: MemberState, need: NeedId): number {
  const agent = agents.get(member);
  return agent === undefined ? member.needs[need] ?? 0 : agent.needs.value(need);
}

/** Fill or drain one need through the loop, so the record and the agent stay one set of numbers. */
export function bumpNeed(member: MemberState, need: NeedId, delta: number, cap = 100): void {
  const agent = memberAgent(member, () => 0.5);
  const current = agent.needs.value(need);
  const target = Math.max(0, Math.min(cap, current + delta));
  agent.needs.refill(need, target - current);
  member.needs[need] = agent.needs.value(need);
}

/** The household's relationship book, built from the saved records so no state hides in a module. */
export function householdBook(state: HouseholdState): RelationshipBook {
  const book = createRelationshipBook({ milestones: PAIR_MILESTONES });
  for (const id of state.order) {
    for (const other of state.order) {
      if (id >= other) continue;
      const key = pairKey(id, other);
      const opinion = state.relationships[key] ?? 0;
      const familiarity = state.familiarity?.[key] ?? 0.3;
      book.socialise(id, other, { opinion, familiarity });
    }
  }
  return book;
}

/** Write the book back into the household's plain records. */
export function syncBook(state: HouseholdState, book: RelationshipBook): void {
  for (const id of state.order) {
    for (const other of book.partnersOf(id)) {
      if (id >= other) continue;
      const key = pairKey(id, other);
      state.relationships[key] = book.opinion(id, other);
      state.familiarity[key] = book.familiarity(id, other);
    }
  }
}

/** Kept for callers that reset a world; the book keeps no hidden state to clear. */
export function resetBook(): void {}

/** The household's words for an opinion score, from rival to lifelong bond. */
export function relationLabel(opinion: number): string {
  if (opinion >= 95) return "Bonded";
  if (opinion >= 70) return "Close";
  if (opinion >= 35) return "Friends";
  if (opinion >= 10) return "Warm";
  if (opinion > -10) return "Neutral";
  if (opinion > -40) return "Tense";
  return "Rivals";
}

/** The one relationship that shapes a being's day: its bonded partner, else its warmest. */
export function partnerOf(state: HouseholdState, id: string): string | null {
  return bondLine(state, id)?.id ?? null;
}

/**
 * The being a member keeps closest, with the book's own word for the pair. A milestone ("Friends",
 * "Bonded") comes from the book, so the panel cannot claim a bond the rules have not reached; below
 * the first milestone the household uses its standing words.
 */
export function bondLine(state: HouseholdState, id: string): { id: string; name: string; word: string } | null {
  const book = householdBook(state);
  let partner: string | null = book.bondedWith(id);
  if (partner === null) {
    let bestOpinion = -Infinity;
    for (const other of state.order) {
      if (other === id) continue;
      const opinion = book.opinion(id, other);
      if (opinion > bestOpinion) { bestOpinion = opinion; partner = other; }
    }
  }
  if (partner === null) return null;
  const name = state.members[partner]?.name;
  if (name === undefined) return null;
  return { id: partner, name, word: bondWord(book, id, partner) };
}

/** The book's word for one pair: its milestone when reached, else the household's standing words. */
export function bondWord(book: RelationshipBook, a: string, b: string): string {
  return book.milestone(a, b)?.label ?? relationLabel(book.opinion(a, b));
}

