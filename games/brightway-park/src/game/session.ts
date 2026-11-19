import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { AgentSnapshot } from "@jgengine/core/agents/agent";
import type { Thought, ThoughtTally } from "./sim/thoughts";
import type { UndoStep } from "./build/undo";

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
  agent: AgentSnapshot;
  thoughts?: Thought[];
  /** Game-second it next checks how it feels. */
  nextThink?: number;
}

export interface StaffState {
  id: string;
  postId: string;
  agent: AgentSnapshot;
}

export interface Session {
  selectedTool: string | null;
  rotation: number;
  selectedObject: string | null;
  dragFrom: [number, number] | null;
  undo: UndoStep[];
  guests: Map<string, GuestState>;
  staff: Map<string, StaffState>;
  occupants: Map<string, number>;
  thoughts: ThoughtTally;
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
    started: false,
    hasSave: false,
    saveStatus: "Saved on builds, ticket changes, pause and day close",
  };
}

export const sessionOf = perContext((): Session => freshSession());

export function resetSession(ctx: GameContext): void {
  Object.assign(sessionOf(ctx), freshSession());
}
