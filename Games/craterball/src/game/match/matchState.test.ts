import { describe, expect, test } from "bun:test";
import {
  GOAL_CELEBRATION_SECONDS,
  KICKOFF_SECONDS,
  MATCH_DURATION_SECONDS,
  WIN_SCORE,
  createInitialMatchState,
  isMatchOver,
  recordCraterCreated,
  recordGoal,
  tickMatch,
  winningTeam,
} from "./matchState";

describe("craterball match state machine", () => {
  test("starts in kickoff with a fresh scoreboard", () => {
    const state = createInitialMatchState();
    expect(state.phase).toBe("kickoff");
    expect(state.scoreCyan).toBe(0);
    expect(state.scoreMagenta).toBe(0);
    expect(state.clockSeconds).toBe(MATCH_DURATION_SECONDS);
    expect(isMatchOver(state)).toBe(false);
  });

  test("kickoff advances to play once the countdown elapses", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS - 0.1);
    expect(state.phase).toBe("kickoff");
    state = tickMatch(state, 0.2);
    expect(state.phase).toBe("play");
  });

  test("a goal during play moves to the goal-celebration phase and scores", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS + 0.1);
    state = recordGoal(state, "cyan", 12.5, 30);
    expect(state.phase).toBe("goal");
    expect(state.scoreCyan).toBe(1);
    expect(state.lastGoalTeam).toBe("cyan");
    expect(state.longestGoalBlastDistance).toBe(12.5);
  });

  test("goals are ignored outside of play/overtime (no double-scoring during celebration)", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS + 0.1);
    state = recordGoal(state, "cyan", 5, 30);
    const scoredAgain = recordGoal(state, "cyan", 5, 31);
    expect(scoredAgain.scoreCyan).toBe(1);
  });

  test("goal celebration returns to kickoff for the next serve", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS + 0.1);
    state = recordGoal(state, "magenta", 3, 30);
    state = tickMatch(state, GOAL_CELEBRATION_SECONDS + 0.1);
    expect(state.phase).toBe("kickoff");
    expect(state.kickoffCount).toBe(2);
  });

  test("reaching the win score ends the match at fulltime", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS + 0.1);
    for (let i = 0; i < WIN_SCORE; i += 1) {
      state = recordGoal(state, "cyan", 1, i);
      if (state.phase === "goal") {
        state = tickMatch(state, GOAL_CELEBRATION_SECONDS + 0.1);
        if (state.phase === "kickoff") state = tickMatch(state, KICKOFF_SECONDS + 0.1);
      }
    }
    expect(state.phase).toBe("fulltime");
    expect(state.scoreCyan).toBe(WIN_SCORE);
    expect(winningTeam(state)).toBe("cyan");
  });

  const OVERRUN = MATCH_DURATION_SECONDS + KICKOFF_SECONDS + GOAL_CELEBRATION_SECONDS + 50;

  test("clock expiry with an unequal score ends the match", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, KICKOFF_SECONDS + 0.1);
    state = recordGoal(state, "cyan", 1, 1);
    state = tickMatch(state, OVERRUN);
    expect(state.phase).toBe("fulltime");
    expect(winningTeam(state)).toBe("cyan");
  });

  test("clock expiry with a tied score goes to sudden-death overtime", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, OVERRUN);
    expect(state.phase).toBe("overtime");
    expect(state.clockSeconds).toBe(0);
  });

  test("any goal in sudden death ends the match immediately", () => {
    let state = createInitialMatchState();
    state = tickMatch(state, OVERRUN);
    state = recordGoal(state, "magenta", 8, 999);
    expect(state.phase).toBe("fulltime");
    expect(winningTeam(state)).toBe("magenta");
  });

  test("crater scars accumulate independently of goals", () => {
    let state = createInitialMatchState();
    state = recordCraterCreated(state);
    state = recordCraterCreated(state);
    expect(state.craterScars).toBe(2);
  });

  test("a fresh match state is a clean restart — no leftover score, phase, or timers", () => {
    const first = createInitialMatchState();
    const second = createInitialMatchState();
    expect(second).toEqual(first);
  });
});
