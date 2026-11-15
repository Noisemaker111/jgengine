import type { NoticeFeed } from "@jgengine/core/notifications/notices";

import { householdBook, syncBook } from "../agents";
import { clampNeed } from "../needs/needs";
import { noteEvent, type HouseholdState } from "../session/types";
import { boardingOf, roomOf, tenantComfort } from "./boarding";
import { neighbourSlots } from "./rooms";

/**
 * Tenants' lives move on over the weeks, whatever the landlord does: one lands a job on the docks and
 * pays more, two neighbours who have grown close fall for each other, one has a hard week and either
 * pulls through (if their room is made lovely in time) or starts packing. Each arc is a few beats a
 * couple of nights apart, checked on rent night; the house's numbers carry the consequences.
 */
export type ArcId = "career" | "romance" | "crisis";

export interface StoryState {
  arc: ArcId;
  /** 0 when the arc opens; each later night moves it on once its wait is over. */
  beat: number;
  /** Day the next beat lands on. */
  nextDay: number;
  /** The other tenant in a romance. */
  partner?: string;
}

/** A tenant who landed the dock job pays this much more a night. */
export const CAREER_RAISE = 1.25;
/** Comfort a tenant in crisis needs by the next beat to pull through. */
export const CRISIS_RESCUE = 70;
/** A crisis opens after two nights below this comfort. */
export const CRISIS_COMFORT = 45;

export function storiesOf(state: HouseholdState): Record<string, StoryState> {
  const boarding = boardingOf(state);
  boarding.stories ??= {};
  return boarding.stories;
}

/** Whether a tenant has the dock job (their cheque is bigger). */
export function hasDockJob(state: HouseholdState, tenantId: string): boolean {
  const story = state.boarding?.stories?.[tenantId];
  return story?.arc === "career" && story.beat >= 2;
}

function adjacent(state: HouseholdState, a: string, b: string): boolean {
  const ra = roomOf(state, a);
  const rb = roomOf(state, b);
  return ra !== null && rb !== null && neighbourSlots(ra.slot).includes(rb.slot);
}

/** Move every tenant's story on by one rent night. Returns the lines it said, for tests. */
export function advanceStories(state: HouseholdState, now: number, notices: Pick<NoticeFeed, "push">): string[] {
  const said: string[] = [];
  const say = (text: string, tone: "info" | "success" | "warn" = "info") => { said.push(text); noteEvent(state, notices, text, tone); };
  const stories = storiesOf(state);
  const book = householdBook(state);
  const day = state.day;
  const name = (id: string) => state.members[id]?.name ?? "Someone";
  for (const id of Object.keys(stories)) if (state.members[id] === undefined) delete stories[id];
  // Beats due tonight.
  for (const [id, story] of Object.entries(stories)) {
    if (day < story.nextDay) continue;
    const member = state.members[id]!;
    if (story.arc === "career" && story.beat === 0) {
      story.beat = 1; story.nextDay = day + 2;
      say(`${name(id)} had an interview on the docks today and won't stop talking about it.`);
    } else if (story.arc === "career" && story.beat === 1) {
      story.beat = 2; story.nextDay = Number.MAX_SAFE_INTEGER;
      member.stress = clampNeed(member.stress - 20);
      say(`${name(id)} got the dock job! Their cheque goes up by a quarter from tonight.`, "success");
    } else if (story.arc === "romance" && story.partner !== undefined && story.beat === 0) {
      if (!adjacent(state, id, story.partner)) { delete stories[id]; continue; }
      story.beat = 1; story.nextDay = day + 1;
      const partner = state.members[story.partner];
      if (partner === undefined) { delete stories[id]; continue; }
      book.socialise(id, story.partner, { opinion: 12 });
      member.stress = clampNeed(member.stress - 20);
      partner.stress = clampNeed(partner.stress - 20);
      boardingOf(state).reputation = Math.min(100, boardingOf(state).reputation + 3);
      say(`${name(id)} and ${name(story.partner)} are officially an item. The whole corridor is insufferable about it. Keep them next door to each other.`, "success");
    } else if (story.arc === "romance" && story.partner !== undefined && story.beat === 1) {
      // A couple split up by the landlord is a heartbreak; together, they are checked again tomorrow.
      story.nextDay = day + 1;
      if (!adjacent(state, id, story.partner)) {
        member.stress = clampNeed(member.stress + 25);
        const partner = state.members[story.partner];
        if (partner !== undefined) partner.stress = clampNeed(partner.stress + 25);
        book.socialise(id, story.partner, { opinion: -20 });
        delete stories[id];
        say(`${name(id)} and ${name(story.partner)} were moved apart and it broke their hearts. They're not speaking.`, "warn");
      }
    } else if (story.arc === "crisis" && story.beat === 0) {
      const comfort = tenantComfort(state, id, now).score;
      delete stories[id];
      if (comfort >= CRISIS_RESCUE) {
        member.stress = clampNeed(member.stress - 30);
        boardingOf(state).reputation = Math.min(100, boardingOf(state).reputation + 2);
        say(`${name(id)} pulled through their hard week. "This room saved me," they said, and meant it.`, "success");
      } else {
        const grumbles = boardingOf(state).grumbles;
        grumbles[id] = (grumbles[id] ?? 0) + 1;
        say(`${name(id)}'s hard week got harder. They've started looking at other stations.`, "warn");
      }
    }
  }
  // New arcs.
  const open = Object.entries(stories).filter(([, s]) => !(s.arc === "career" && s.beat >= 2));
  const busy = new Set(open.map(([id]) => id));
  for (const [, s] of open) if (s.partner !== undefined) busy.add(s.partner);
  for (const id of state.order) {
    if (busy.has(id) || roomOf(state, id) === null) continue;
    const comfort = tenantComfort(state, id, now).score;
    const grumbles = boardingOf(state).grumbles[id] ?? 0;
    if (comfort < CRISIS_COMFORT && grumbles >= 1) {
      stories[id] = { arc: "crisis", beat: 0, nextDay: day + 1 };
      busy.add(id);
      say(`${state.members[id]!.name} is having a hard week. Make their room lovely (comfort ${CRISIS_RESCUE}+) by tomorrow night.`, "warn");
      continue;
    }
    const lover = state.order.find((other) => other !== id && !busy.has(other) && adjacent(state, id, other) && book.opinion(id, other) >= 70);
    if (lover !== undefined) {
      stories[id] = { arc: "romance", beat: 0, nextDay: day + 2, partner: lover };
      busy.add(id); busy.add(lover);
      say(`${name(id)} has been leaving little notes under ${name(lover)}'s door.`);
      continue;
    }
    const jobHunting = Object.values(stories).some((s) => s.arc === "career" && s.beat < 2);
    if (!jobHunting && day >= 2 && comfort >= 55 && state.members[id]!.completedShifts >= 2 && stories[id] === undefined) {
      stories[id] = { arc: "career", beat: 0, nextDay: day + 1 };
      busy.add(id);
      say(`${name(id)} has been reading the dock job board over breakfast.`);
    }
  }
  syncBook(state, book);
  return said;
}
