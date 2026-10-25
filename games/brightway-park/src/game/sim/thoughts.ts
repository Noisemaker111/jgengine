import type { GuestState } from "../session";

/**
 * What a guest is thinking, in words a player reads: each thought is an id the park counts and a
 * line the guest window shows. A guest keeps its last few; the park tallies the fresh ones into the
 * dashboard's "guests are saying" list and the rating's complaint share.
 */
export type ThoughtId =
  | "too_expensive"
  | "queue_long"
  | "lost"
  | "hungry"
  | "thirsty"
  | "toilet"
  | "sick"
  | "tired"
  | "dirty"
  | "broken"
  | "no_money"
  | "great_ride"
  | "good_value"
  | "entertained"
  | "lovely_park";

export interface Thought {
  id: ThoughtId;
  text: string;
  /** Game-second it was had. */
  at: number;
}

/** Thoughts that are complaints: their share of the crowd pulls the rating down. */
export const COMPLAINTS: ReadonlySet<ThoughtId> = new Set<ThoughtId>([
  "too_expensive",
  "queue_long",
  "lost",
  "hungry",
  "thirsty",
  "toilet",
  "sick",
  "tired",
  "dirty",
  "broken",
  "no_money",
]);

export const THOUGHT_LABEL: Record<ThoughtId, string> = {
  too_expensive: "Too expensive",
  queue_long: "Queue too long",
  lost: "Lost",
  hungry: "Hungry",
  thirsty: "Thirsty",
  toilet: "Needs the toilet",
  sick: "Feeling sick",
  tired: "Tired",
  dirty: "Park is dirty",
  broken: "Ride broken down",
  no_money: "Out of money",
  great_ride: "Loved a ride",
  good_value: "Good value",
  entertained: "Enjoyed the entertainer",
  lovely_park: "Lovely park",
};

/** How long a thought counts toward the park's tally. */
export const THOUGHT_FRESH_SECONDS = 45;
/** A guest does not repeat the same thought more often than this. */
const REPEAT_SECONDS = 20;
const KEEP = 4;

/** Give a guest a thought, unless it had the same one just now. Newest first. */
export function think(guest: GuestState, id: ThoughtId, text: string, now: number): void {
  const list = guest.thoughts ?? (guest.thoughts = []);
  const last = list.find((thought) => thought.id === id);
  if (last !== undefined && now - last.at < REPEAT_SECONDS) return;
  // The same thought again moves to the top rather than filling the window with copies.
  const same = list.findIndex((thought) => thought.id === id && thought.text === text);
  if (same >= 0) list.splice(same, 1);
  list.unshift({ id, text, at: now });
  if (list.length > KEEP) list.length = KEEP;
}

export interface ThoughtTally {
  /** Fresh thoughts by id, most common first. */
  top: { id: ThoughtId; label: string; count: number; complaint: boolean }[];
  /** Share of guests (0-1) whose freshest thought is a complaint. */
  complaintShare: number;
}

/** The crowd's fresh thoughts, counted. */
export function tallyThoughts(guests: Iterable<GuestState>, now: number): ThoughtTally {
  const counts = new Map<ThoughtId, number>();
  let people = 0;
  let complaining = 0;
  for (const guest of guests) {
    people += 1;
    const fresh = (guest.thoughts ?? []).filter((thought) => now - thought.at <= THOUGHT_FRESH_SECONDS);
    for (const thought of fresh) counts.set(thought.id, (counts.get(thought.id) ?? 0) + 1);
    if (fresh[0] !== undefined && COMPLAINTS.has(fresh[0].id)) complaining += 1;
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, label: THOUGHT_LABEL[id], count, complaint: COMPLAINTS.has(id) }));
  return { top, complaintShare: people === 0 ? 0 : complaining / people };
}
