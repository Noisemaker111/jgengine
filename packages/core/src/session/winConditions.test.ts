import { describe, expect, test } from "bun:test";
import { createWinConditionSet } from "@jgengine/core/session/winConditions";

interface MatchState {
  scoreA: number;
  scoreB: number;
  timeLeft: number;
}

describe("createWinConditionSet", () => {
  test("returns null when no condition fires", () => {
    const conditions = createWinConditionSet<MatchState>();
    conditions.add("score-cap", (state) => (state.scoreA >= 10 ? "a" : null));
    expect(conditions.evaluate({ scoreA: 3, scoreB: 1, timeLeft: 30 })).toBeNull();
  });

  test("the first registered condition to fire wins, in registration order", () => {
    const conditions = createWinConditionSet<MatchState>();
    conditions.add("score-cap", (state) => (state.scoreA >= 10 ? "a" : null));
    conditions.add("timeout", (state) => (state.timeLeft <= 0 ? "b" : null));
    const state: MatchState = { scoreA: 10, scoreB: 0, timeLeft: 0 };
    expect(conditions.evaluate(state)).toEqual({ winner: "a", conditionId: "score-cap" });
  });

  test("falls through to a later condition when earlier ones don't fire", () => {
    const conditions = createWinConditionSet<MatchState>();
    conditions.add("score-cap", (state) => (state.scoreA >= 10 ? "a" : null));
    conditions.add("timeout", (state) => (state.timeLeft <= 0 ? "b" : null));
    const state: MatchState = { scoreA: 3, scoreB: 0, timeLeft: 0 };
    expect(conditions.evaluate(state)).toEqual({ winner: "b", conditionId: "timeout" });
  });

  test("remove unregisters a condition", () => {
    const conditions = createWinConditionSet<MatchState>();
    const remove = conditions.add("score-cap", (state) => (state.scoreA >= 10 ? "a" : null));
    remove();
    expect(conditions.ids()).toEqual([]);
    expect(conditions.evaluate({ scoreA: 99, scoreB: 0, timeLeft: 30 })).toBeNull();
  });

  test("ids reports registration order", () => {
    const conditions = createWinConditionSet<MatchState>();
    conditions.add("score-cap", () => null);
    conditions.add("timeout", () => null);
    expect(conditions.ids()).toEqual(["score-cap", "timeout"]);
  });
});
