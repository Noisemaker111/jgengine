import { describe, expect, test } from "bun:test";

import { createGestureSurfaceTracker } from "./gestureSurface";

const BINDINGS = {
  tap: "rotateCw",
  swipeDown: "hardDrop",
  swipeUp: "hold",
  drag: { left: "shiftLeft", right: "shiftRight", stepPx: 40 },
};

describe("gesture surface", () => {
  test("a quick still tap fires the tap action", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    expect(tracker.move(103, 102)).toEqual([]);
    expect(tracker.end(103, 102, 120)).toEqual(["rotateCw"]);
  });

  test("a slow still press is not a tap", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    expect(tracker.end(100, 100, 900)).toEqual([]);
  });

  test("horizontal drag streams one action per step in travel order", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    expect(tracker.move(145, 102)).toEqual(["shiftRight"]);
    expect(tracker.move(225, 102)).toEqual(["shiftRight", "shiftRight"]);
    expect(tracker.move(185, 102)).toEqual(["shiftLeft"]);
    expect(tracker.end(185, 102, 600)).toEqual([]);
  });

  test("vertical flick fires the swipe when the drag leaves that axis unbound", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    tracker.move(102, 180);
    expect(tracker.end(102, 190, 110)).toEqual(["hardDrop"]);
  });

  test("upward flick fires swipeUp", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 200, 0);
    tracker.move(101, 120);
    expect(tracker.end(101, 110, 110)).toEqual(["hold"]);
  });

  test("slow vertical drift below swipe velocity fires nothing", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    tracker.move(101, 160);
    expect(tracker.end(101, 170, 2000)).toEqual([]);
  });

  test("a fast horizontal flick never double-fires drag steps and a swipe", () => {
    const tracker = createGestureSurfaceTracker({ ...BINDINGS, swipeRight: "boost" });
    tracker.begin(100, 100, 0);
    const fired = tracker.move(220, 101);
    expect(fired).toEqual(["shiftRight", "shiftRight", "shiftRight"]);
    expect(tracker.end(220, 101, 90)).toEqual([]);
  });

  test("cancel discards the gesture", () => {
    const tracker = createGestureSurfaceTracker(BINDINGS);
    tracker.begin(100, 100, 0);
    tracker.cancel();
    expect(tracker.isActive()).toBe(false);
    expect(tracker.end(100, 100, 50)).toEqual([]);
  });
});
