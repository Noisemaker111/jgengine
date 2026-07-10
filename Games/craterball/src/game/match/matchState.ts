import type { Team } from "../arena/geometry";

export type MatchPhase = "kickoff" | "play" | "goal" | "overtime" | "fulltime";

export const MATCH_DURATION_SECONDS = 180;
export const WIN_SCORE = 5;
export const KICKOFF_SECONDS = 3;
export const GOAL_CELEBRATION_SECONDS = 2.5;

export interface MatchState {
  phase: MatchPhase;
  scoreCyan: number;
  scoreMagenta: number;
  clockSeconds: number;
  overtimeSeconds: number;
  kickoffTimer: number;
  lastGoalTeam: Team | null;
  longestGoalBlastDistance: number;
  craterScars: number;
  kickoffCount: number;
}

export function createInitialMatchState(): MatchState {
  return {
    phase: "kickoff",
    scoreCyan: 0,
    scoreMagenta: 0,
    clockSeconds: MATCH_DURATION_SECONDS,
    overtimeSeconds: 0,
    kickoffTimer: KICKOFF_SECONDS,
    lastGoalTeam: null,
    longestGoalBlastDistance: 0,
    craterScars: 0,
    kickoffCount: 1,
  };
}

export function isMatchOver(state: MatchState): boolean {
  return state.phase === "fulltime";
}

export function winningTeam(state: MatchState): Team | null {
  if (!isMatchOver(state)) return null;
  if (state.scoreCyan === state.scoreMagenta) return null;
  return state.scoreCyan > state.scoreMagenta ? "cyan" : "magenta";
}

function withWinCheck(state: MatchState): MatchState {
  if (state.scoreCyan >= WIN_SCORE || state.scoreMagenta >= WIN_SCORE) {
    return { ...state, phase: "fulltime" };
  }
  return state;
}

interface PhaseStep {
  state: MatchState;
  leftover: number;
}

function stepPhase(state: MatchState, dt: number): PhaseStep {
  switch (state.phase) {
    case "kickoff": {
      const kickoffTimer = state.kickoffTimer - dt;
      if (kickoffTimer > 0) return { state: { ...state, kickoffTimer }, leftover: 0 };
      return { state: { ...state, phase: "play", kickoffTimer: 0 }, leftover: -kickoffTimer };
    }
    case "play": {
      const clockSeconds = state.clockSeconds - dt;
      if (clockSeconds > 0) return { state: { ...state, clockSeconds }, leftover: 0 };
      const settled = { ...state, clockSeconds: 0 };
      if (state.scoreCyan !== state.scoreMagenta) return { state: { ...settled, phase: "fulltime" }, leftover: 0 };
      return { state: { ...settled, phase: "overtime", overtimeSeconds: 0 }, leftover: -clockSeconds };
    }
    case "overtime":
      return { state: { ...state, overtimeSeconds: state.overtimeSeconds + dt }, leftover: 0 };
    case "goal": {
      const kickoffTimer = state.kickoffTimer - dt;
      if (kickoffTimer > 0) return { state: { ...state, kickoffTimer }, leftover: 0 };
      const afterWin = withWinCheck({ ...state, kickoffTimer: 0 });
      if (afterWin.phase === "fulltime") return { state: afterWin, leftover: 0 };
      return {
        state: { ...afterWin, phase: "kickoff", kickoffTimer: KICKOFF_SECONDS, kickoffCount: afterWin.kickoffCount + 1 },
        leftover: -kickoffTimer,
      };
    }
    default:
      return { state, leftover: 0 };
  }
}

export function tickMatch(state: MatchState, dt: number): MatchState {
  if (dt <= 0 || state.phase === "fulltime") return state;

  let current = state;
  let remaining = dt;
  for (let guard = 0; guard < 8 && remaining > 0 && current.phase !== "fulltime"; guard += 1) {
    const step = stepPhase(current, remaining);
    current = step.state;
    remaining = step.leftover;
  }
  return current;
}

export function recordGoal(state: MatchState, team: Team, blastDistance: number, now: number): MatchState {
  void now;
  if (state.phase !== "play" && state.phase !== "overtime") return state;
  const scored = {
    ...state,
    scoreCyan: state.scoreCyan + (team === "cyan" ? 1 : 0),
    scoreMagenta: state.scoreMagenta + (team === "magenta" ? 1 : 0),
    lastGoalTeam: team,
    longestGoalBlastDistance: Math.max(state.longestGoalBlastDistance, blastDistance),
  };
  if (state.phase === "overtime") return withWinCheck({ ...scored, phase: "fulltime" });
  const afterWin = withWinCheck({ ...scored, phase: "goal", kickoffTimer: GOAL_CELEBRATION_SECONDS });
  return afterWin;
}

export function recordCraterCreated(state: MatchState): MatchState {
  return { ...state, craterScars: state.craterScars + 1 };
}
