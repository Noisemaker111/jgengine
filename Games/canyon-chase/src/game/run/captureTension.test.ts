import { describe, expect, test } from "bun:test";
import { CAPTURE_HOLD_SECONDS, CAPTURE_RADIUS_METERS, INITIAL_CAPTURE_STATE, advanceCapture } from "./captureTension";

describe("advanceCapture", () => {
  test("does not capture the instant range is entered", () => {
    const result = advanceCapture(INITIAL_CAPTURE_STATE, CAPTURE_RADIUS_METERS - 1, 10);
    expect(result.captured).toBe(false);
    expect(result.tensionFraction).toBe(0);
    expect(result.state.withinRangeSince).toBe(10);
  });

  test("captures once the hold duration elapses continuously within range", () => {
    let state = INITIAL_CAPTURE_STATE;
    const enteredAt = 5;
    let result = advanceCapture(state, 10, enteredAt);
    state = result.state;
    result = advanceCapture(state, 10, enteredAt + CAPTURE_HOLD_SECONDS - 0.01);
    expect(result.captured).toBe(false);
    result = advanceCapture(state, 10, enteredAt + CAPTURE_HOLD_SECONDS);
    expect(result.captured).toBe(true);
    expect(result.tensionFraction).toBe(1);
  });

  test("breaking away past the capture radius resets the hold window", () => {
    let result = advanceCapture(INITIAL_CAPTURE_STATE, 10, 0);
    result = advanceCapture(result.state, CAPTURE_RADIUS_METERS + 5, 1);
    expect(result.state.withinRangeSince).toBeNull();
    expect(result.tensionFraction).toBe(0);
    result = advanceCapture(result.state, 10, 4);
    expect(result.state.withinRangeSince).toBe(4);
    expect(result.captured).toBe(false);
  });
});
