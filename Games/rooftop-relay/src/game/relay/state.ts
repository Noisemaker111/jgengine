import { INITIAL_BATON_STATE, tickBaton, type BatonState, type HandoffQuality, handoffTimeDeltaSeconds } from "../baton";
import { LEG_SPECS } from "../route/legs";
import { FALL_PENALTY_SECONDS, TIME_CAP_SECONDS } from "../tuning";

export type RelayPhase = "menu" | "running" | "won" | "lost";

export interface LegSplit {
  legId: string;
  legName: string;
  timeSeconds: number;
  parSeconds: number;
  quality: HandoffQuality;
}

export interface Toast {
  id: number;
  text: string;
}

export interface RelayState {
  phase: RelayPhase;
  legIndex: number;
  elapsedSeconds: number;
  legElapsedSeconds: number;
  baton: BatonState;
  splits: readonly LegSplit[];
  fallCount: number;
  toast: Toast | null;
  toastSeq: number;
}

export const TOTAL_LEGS = LEG_SPECS.length;

export const INITIAL_RELAY_STATE: RelayState = {
  phase: "menu",
  legIndex: 0,
  elapsedSeconds: 0,
  legElapsedSeconds: 0,
  baton: INITIAL_BATON_STATE,
  splits: [],
  fallCount: 0,
  toast: null,
  toastSeq: 0,
};

function pushToast(state: RelayState, text: string): Pick<RelayState, "toast" | "toastSeq"> {
  const toastSeq = state.toastSeq + 1;
  return { toast: { id: toastSeq, text }, toastSeq };
}

export function startRelay(): RelayState {
  return { ...INITIAL_RELAY_STATE, phase: "running", ...pushToast(INITIAL_RELAY_STATE, "GO GO GO") };
}

export function tickRelayClock(state: RelayState, dt: number, speed: number): RelayState {
  if (state.phase !== "running" || dt <= 0) return state;
  const batonResult = tickBaton(state.baton, speed, dt);
  const elapsedSeconds = state.elapsedSeconds + dt + batonResult.timeDeltaSeconds;
  const legElapsedSeconds = state.legElapsedSeconds + dt + batonResult.timeDeltaSeconds;
  const timedOut = elapsedSeconds >= TIME_CAP_SECONDS;
  return {
    ...state,
    baton: batonResult.state,
    elapsedSeconds,
    legElapsedSeconds,
    phase: timedOut ? "lost" : state.phase,
    ...(timedOut ? pushToast(state, "Time's up — the relay clock ran out.") : {}),
  };
}

export function applyFallPenalty(state: RelayState, runnerName: string): RelayState {
  if (state.phase !== "running") return state;
  return {
    ...state,
    elapsedSeconds: state.elapsedSeconds + FALL_PENALTY_SECONDS,
    legElapsedSeconds: state.legElapsedSeconds + FALL_PENALTY_SECONDS,
    fallCount: state.fallCount + 1,
    baton: { ...state.baton, paceStreakSeconds: 0, coldSeconds: 0 },
    ...pushToast(state, `${runnerName} hit the street — +${FALL_PENALTY_SECONDS}s, baton back to the last checkpoint`),
  };
}

function qualityHeadline(quality: HandoffQuality): string {
  if (quality === "clean") return "CLEAN SNAP -2s";
  if (quality === "fumble") return "Fumble — +2s";
  return "Handoff steady";
}

export function applyHandoff(state: RelayState, quality: HandoffQuality, nextRunnerName: string | null): RelayState {
  if (state.phase !== "running") return state;
  const spec = LEG_SPECS[state.legIndex];
  if (spec === undefined) return state;

  const delta = handoffTimeDeltaSeconds(quality);
  const legTime = Math.max(0, state.legElapsedSeconds + delta);
  const elapsedSeconds = Math.max(0, state.elapsedSeconds + delta);
  const split: LegSplit = { legId: spec.id, legName: spec.name, timeSeconds: legTime, parSeconds: spec.parSeconds, quality };
  const splits = [...state.splits, split];
  const isFinalLeg = state.legIndex >= TOTAL_LEGS - 1;
  const headline = qualityHeadline(quality);

  if (isFinalLeg) {
    const won = elapsedSeconds <= TIME_CAP_SECONDS;
    return {
      ...state,
      splits,
      elapsedSeconds,
      legElapsedSeconds: legTime,
      phase: won ? "won" : "lost",
      ...pushToast(state, won ? `${headline} — the relay is home!` : `${headline} — but the clock beat you.`),
    };
  }

  return {
    ...state,
    splits,
    elapsedSeconds,
    legIndex: state.legIndex + 1,
    legElapsedSeconds: 0,
    baton: INITIAL_BATON_STATE,
    ...pushToast(state, nextRunnerName === null ? headline : `${headline} — Handoff clean — ${nextRunnerName}'s leg now`),
  };
}

export function currentLegSpec(state: RelayState) {
  return LEG_SPECS[Math.min(state.legIndex, LEG_SPECS.length - 1)]!;
}
