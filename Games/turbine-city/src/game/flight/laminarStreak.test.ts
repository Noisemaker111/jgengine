import { describe, expect, test } from "bun:test";
import { initialLaminarState, laminarPercent, onRingCrossed, tickLaminar } from "./laminarStreak";

describe("laminar streak", () => {
  test("crossing rings while centered builds the streak", () => {
    let state = initialLaminarState();
    state = tickLaminar(state, true, 1);
    state = onRingCrossed(state, true);
    state = tickLaminar(state, true, 1);
    state = onRingCrossed(state, true);
    expect(state.streak).toBe(2);
    expect(state.best).toBe(2);
  });

  test("a ring crossed while off-core does not extend the streak", () => {
    let state = initialLaminarState();
    state = onRingCrossed(state, true);
    state = onRingCrossed(state, false);
    expect(state.streak).toBe(1);
  });

  test("leaving the core shatters the streak immediately, not at the next ring", () => {
    let state = initialLaminarState();
    state = onRingCrossed(state, true);
    state = onRingCrossed(state, true);
    expect(state.streak).toBe(2);
    state = tickLaminar(state, false, 0.5);
    expect(state.streak).toBe(0);
    expect(state.best).toBe(2);
  });

  test("best streak never regresses after a shatter", () => {
    let state = initialLaminarState();
    state = onRingCrossed(state, true);
    state = onRingCrossed(state, true);
    state = onRingCrossed(state, true);
    state = tickLaminar(state, false, 0.5);
    state = onRingCrossed(state, true);
    expect(state.best).toBe(3);
    expect(state.streak).toBe(1);
  });

  test("laminar percent tracks time-in-core over total time", () => {
    let state = initialLaminarState();
    state = tickLaminar(state, true, 3);
    state = tickLaminar(state, false, 1);
    expect(laminarPercent(state)).toBeCloseTo(0.75, 5);
  });

  test("laminar percent is zero with no elapsed time", () => {
    expect(laminarPercent(initialLaminarState())).toBe(0);
  });
});
