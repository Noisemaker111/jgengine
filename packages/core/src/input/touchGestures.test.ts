import { describe, expect, test } from "bun:test";

import { createTouchGestureTracker } from "./touchGestures";

const TUNING = { tapMoveThresholdPx: 12, tapMaxMs: 320, longPressMs: 420 };

describe("createTouchGestureTracker", () => {
  test("still finger lifted quickly is a tap", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    expect(tracker.end(200)).toBe("tap");
  });

  test("still finger lifted late is nothing", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    expect(tracker.end(400)).toBeNull();
  });

  test("movement past the threshold commits to look and cancels tap", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    expect(tracker.move(120, 100)).toEqual({ dx: 20, dy: 0 });
    expect(tracker.move(125, 103)).toEqual({ dx: 5, dy: 3 });
    expect(tracker.beginHold()).toBe(false);
    expect(tracker.end(100)).toBeNull();
  });

  test("sub-threshold jitter still taps and reports deltas", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    expect(tracker.move(104, 100)).toEqual({ dx: 4, dy: 0 });
    expect(tracker.end(150)).toBe("tap");
  });

  test("hold engages only while still, and ends on lift", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    expect(tracker.beginHold()).toBe(true);
    expect(tracker.isHolding()).toBe(true);
    expect(tracker.beginHold()).toBe(false);
    expect(tracker.end(1000)).toBe("hold-end");
    expect(tracker.isHolding()).toBe(false);
  });

  test("cancel ends an active hold", () => {
    const tracker = createTouchGestureTracker(TUNING);
    tracker.begin(100, 100, 0);
    tracker.beginHold();
    expect(tracker.cancel()).toBe("hold-end");
    expect(tracker.isActive()).toBe(false);
  });

  test("move and end are inert without an active gesture", () => {
    const tracker = createTouchGestureTracker(TUNING);
    expect(tracker.move(10, 10)).toBeNull();
    expect(tracker.end(0)).toBeNull();
    expect(tracker.cancel()).toBeNull();
  });
});
