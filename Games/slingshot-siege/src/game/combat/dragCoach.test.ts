import { describe, expect, test } from "bun:test";
import { SLING_ANCHOR } from "../state/slingshotStore";
import { DRAG_COACH_PULL_POINT, coachFrame, coachVisible, demoTrajectory } from "./dragCoach";

describe("coachVisible", () => {
  test("never dragged and idle: visible", () => {
    expect(coachVisible("aiming", false)).toBe(true);
  });

  test("dragged once: never visible again, even back in idle", () => {
    expect(coachVisible("aiming", true)).toBe(false);
  });

  test("mid-drag: hidden regardless of the coached flag", () => {
    expect(coachVisible("dragging", false)).toBe(false);
    expect(coachVisible("dragging", true)).toBe(false);
  });

  test("flying: hidden regardless of the coached flag", () => {
    expect(coachVisible("flying", false)).toBe(false);
  });
});

describe("demoTrajectory", () => {
  test("arcs upward using the real trajectory math", () => {
    const points = demoTrajectory();
    expect(points.length).toBeGreaterThan(2);
    const apex = points.reduce((best, p) => (p[1] > best[1] ? p : best));
    expect(apex[1]).toBeGreaterThan(points[0]![1]);
  });
});

describe("coachFrame", () => {
  test("starts invisible at the pouch", () => {
    const frame = coachFrame(0);
    expect(frame.opacity).toBe(0);
    expect(frame.showArc).toBe(false);
    expect(frame.position).toEqual(SLING_ANCHOR);
  });

  test("early in the pull the arc has not appeared yet", () => {
    const frame = coachFrame(0.5);
    expect(frame.showArc).toBe(false);
    expect(frame.opacity).toBe(1);
  });

  test("later in the pull the arc appears", () => {
    const frame = coachFrame(0.9);
    expect(frame.showArc).toBe(true);
  });

  test("holds fully pulled with the arc visible", () => {
    const frame = coachFrame(1.5);
    expect(frame.position).toEqual(DRAG_COACH_PULL_POINT);
    expect(frame.opacity).toBe(1);
    expect(frame.showArc).toBe(true);
  });

  test("fades out near the end of the loop", () => {
    const frame = coachFrame(2.4);
    expect(frame.opacity).toBeLessThan(0.1);
  });

  test("loops back to the start", () => {
    expect(coachFrame(2.5)).toEqual(coachFrame(0));
  });

  test("wraps negative elapsed time into the cycle", () => {
    const wrapped = coachFrame(-0.1);
    const equivalent = coachFrame(2.4);
    expect(wrapped.opacity).toBeCloseTo(equivalent.opacity, 5);
    expect(wrapped.showArc).toBe(equivalent.showArc);
    expect(wrapped.position).toEqual(equivalent.position);
  });
});
