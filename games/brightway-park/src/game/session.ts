import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import type { Thought, ThoughtTally } from "./sim/thoughts";
import type { UndoStep } from "./build/undo";

/**
 * What the haunt keeps outside its world: the walking living and the spooks on patrol (agents with
 * bodies), what the player has picked in the UI, and the save banner. Ectoplasm, rumor, mood,
 * structures, ghosts, the Ferryman's debt and the scenario are facts in the `brightway.world` store
 * (`park.ts`).
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
  /** Nerve left: every scare spends some, and at the bottom the visitor flees screaming. */
  courage: number;
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
  /** The group it came through the gate with: when one flees screaming the rest lose their nerve. */
  group?: string;
  /** Scares in a row without a long breather, and when the last one landed: the chain's multiplier. */
  combo?: number;
  lastScareAt?: number;
  /** What a hunter or TV crew has filmed so far; it goes on the record only if they leave calmly. */
  footage?: number;
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
  undo: UndoStep[];
  guests: Map<string, GuestState>;
  staff: Map<string, StaffState>;
  /** Guests heading for or at each stall this tick - a crowd the next guest prices in. Rebuilt every tick. */
  occupants: Map<string, number>;
  /** The crowd's fresh thoughts, counted every tick. */
  thoughts: ThoughtTally;
  spawnAcc: number;
  guestSeq: number;
  groupSeq: number;
  /** When each scare prop is ready to jolt again (game seconds), by structure id. */
  propReady: Map<string, number>;
  /** Seconds each ghost has found everything it wants, toward moving in. */
  ghostPending: Map<string, number>;
  /** Seconds each resident has gone without what it wants, toward leaving. */
  ghostRestless: Map<string, number>;
  /** Where each resident haunts (x, z). */
  ghostHaunts: Map<string, [number, number]>;
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
    groupSeq: 0,
    propReady: new Map(),
    ghostPending: new Map(),
    ghostRestless: new Map(),
    ghostHaunts: new Map(),
    started: false,
    hasSave: false,
    saveStatus: "Saved on builds, toll changes, pause and each noon",
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

export function nextGroupId(): string {
  session.groupSeq += 1;
  return `group#${session.groupSeq}`;
}
