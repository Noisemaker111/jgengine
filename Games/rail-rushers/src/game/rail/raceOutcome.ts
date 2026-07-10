import type { EdgeId } from "./network";
import { nextForwardArrival, trainById } from "./schedule";

export const PARDON_PENALTY_SECONDS = 10;

export function expressDeadlineSeconds(): number {
  return nextForwardArrival(trainById("express"), 0);
}

export interface WreckState {
  pardonUsed: boolean;
  penaltySeconds: number;
  wrecked: boolean;
  wreckReason: string | null;
  wreckEdgeId: EdgeId | null;
}

export function createWreckState(): WreckState {
  return { pardonUsed: false, penaltySeconds: 0, wrecked: false, wreckReason: null, wreckEdgeId: null };
}

export function applyWreck(state: WreckState, reason: string, edgeId: EdgeId): WreckState {
  if (state.wrecked) return state;
  if (!state.pardonUsed) {
    return { ...state, pardonUsed: true, penaltySeconds: state.penaltySeconds + PARDON_PENALTY_SECONDS };
  }
  return { ...state, wrecked: true, wreckReason: reason, wreckEdgeId: edgeId };
}

export type RunOutcome =
  | { status: "racing" }
  | { status: "won"; marginSeconds: number; pardonUsed: boolean }
  | { status: "wrecked"; reason: string; edgeId: EdgeId | null }
  | { status: "lost-to-express" };

export interface OutcomeInput {
  finished: boolean;
  finishTime: number | null;
  elapsed: number;
  wreck: WreckState;
  deadlineSeconds: number;
}

export function evaluateOutcome(input: OutcomeInput): RunOutcome {
  if (input.wreck.wrecked) {
    return { status: "wrecked", reason: input.wreck.wreckReason ?? "collision", edgeId: input.wreck.wreckEdgeId };
  }
  if (input.finished && input.finishTime !== null) {
    const effectiveFinish = input.finishTime + input.wreck.penaltySeconds;
    if (effectiveFinish <= input.deadlineSeconds) {
      return { status: "won", marginSeconds: input.deadlineSeconds - effectiveFinish, pardonUsed: input.wreck.pardonUsed };
    }
    return { status: "lost-to-express" };
  }
  if (input.elapsed > input.deadlineSeconds) return { status: "lost-to-express" };
  return { status: "racing" };
}
