import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import type { Thought, ThoughtTally } from "./sim/thoughts";
import type { BuildStep } from "./build/undo";

/**
 * What the park keeps outside its world: the walking guests and janitors (agents with bodies), what
 * the player has picked in the UI, and the save banner. Money, rating, mood, structures, the loan
 * and the scenario are facts in the `brightway.world` store (`park.ts`).
 */

/**
 * Every phase a guest can be in, and the one list the type and the save decoder both read: a guest
 * saved while queued or riding is a legal state, so a decoder that knew only three of these refused
 * the save it had just written.
 */
export const GUEST_PHASES = ["seeking", "busy", "queued", "riding", "leaving"] as const;
export type GuestPhase = (typeof GUEST_PHASES)[number];

export interface GuestState {
  id: string;
  kind: string;
  money: number;
  visits: number;
  phase: GuestPhase;
  targetId: string | null;
  target: readonly [number, number, number] | null;
  /** Absolute game-second the guest gives up on a target it cannot reach. */
  targetUntil: number;
  busy: number;
  /** Everything the shared agent loop owns: needs, mood, held action and the far flag. */
  agent: AgentSnapshot;
  /** What it has been thinking, newest first. */
  thoughts?: Thought[];
  /** Game-second it next checks how it feels. */
  nextThink?: number;
}

/** One staffed post's janitor: an agent walking the beat its post authored. */
export interface StaffState {
  id: string;
  postId: string;
  agent: AgentSnapshot;
}

export interface Session {
  selectedTool: string | null;
  /** Quarter turns the next build faces (Z turns it). */
  rotation: number;
  selectedObject: string | null;
  /** Where the current left-button drag started (a world x/z), set by the overlay on pointer-down. */
  dragFrom: [number, number] | null;
  /** The builder's undo list, newest last (`build/undo.ts`). */
  undo: BuildStep[];
  guests: Map<string, GuestState>;
  staff: Map<string, StaffState>;
  /** Guests heading for or at each stall this tick - a crowd the next guest prices in. Rebuilt every tick. */
  occupants: Map<string, number>;
  /** The crowd's fresh thoughts, counted every tick. */
  thoughts: ThoughtTally;
  spawnAcc: number;
  guestSeq: number;
  started: boolean;
  hasSave: boolean;
  saveStatus: string;
}

function freshSession(): Session {
  return {
    selectedTool: null,
    rotation: 0,
    selectedObject: null,
    dragFrom: null,
    undo: [],
    guests: new Map(),
    staff: new Map(),
    occupants: new Map(),
    thoughts: { top: [], complaintShare: 0 },
    spawnAcc: 0,
    guestSeq: 0,
    started: false,
    hasSave: false,
    saveStatus: "Saved on builds, ticket changes, pause and day close",
  };
}

export const session: Session = freshSession();

export function resetSession(): void {
  Object.assign(session, freshSession());
}

export function nextGuestId(): string {
  session.guestSeq += 1;
  return `guest#${session.guestSeq}`;
}
