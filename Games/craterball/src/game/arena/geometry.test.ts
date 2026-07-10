import { describe, expect, test } from "bun:test";
import { GOAL_HALF_WIDTH, GOAL_LINE_X, PITCH_RX, PITCH_RZ, clampToPitch, isInsidePitch, scoringTeamFor } from "./geometry";

describe("craterball arena geometry", () => {
  test("center is inside the pitch", () => {
    expect(isInsidePitch(0, 0)).toBe(true);
  });

  test("far outside the pitch is not inside", () => {
    expect(isInsidePitch(PITCH_RX * 2, 0)).toBe(false);
  });

  test("clampToPitch leaves interior points untouched", () => {
    expect(clampToPitch([5, 3])).toEqual([5, 3]);
  });

  test("clampToPitch pulls an outside point back onto the ellipse", () => {
    const [x, z] = clampToPitch([PITCH_RX * 4, 0]);
    expect(x).toBeCloseTo(PITCH_RX, 5);
    expect(z).toBeCloseTo(0, 5);
  });

  test("ball crossing the east goal line within the gap scores for cyan", () => {
    expect(scoringTeamFor(GOAL_LINE_X + 0.5, 1)).toBe("cyan");
  });

  test("ball crossing the west goal line within the gap scores for magenta", () => {
    expect(scoringTeamFor(-GOAL_LINE_X - 0.5, -1)).toBe("magenta");
  });

  test("crossing the goal line outside the gap width does not score", () => {
    expect(scoringTeamFor(GOAL_LINE_X + 0.5, GOAL_HALF_WIDTH + 2)).toBeNull();
  });

  test("staying on the pitch never scores", () => {
    expect(scoringTeamFor(0, 0)).toBeNull();
  });

  test("PITCH_RZ bounds the sideline half-width", () => {
    expect(PITCH_RZ).toBeGreaterThan(GOAL_HALF_WIDTH);
  });
});
