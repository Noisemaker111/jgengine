import { describe, expect, test } from "bun:test";

import { createThresholdTracker } from "./thresholdCrossings";

describe("createThresholdTracker", () => {
  test("emits a falling crossing when the source drops past a mark", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      initial: 100,
    });
    expect(tracker.update(60)).toEqual([]);
    expect(tracker.update(40)).toEqual([{ id: "half", at: 50, direction: "falling", from: 60, to: 40 }]);
  });

  test("seeds silently from the first update when no initial is given", () => {
    const tracker = createThresholdTracker({ thresholds: [{ id: "half", at: 50 }] });
    expect(tracker.update(80)).toEqual([]); // seed, no crossing
    expect(tracker.update(30)).toHaveLength(1);
  });

  test("a single large drop emits every skipped threshold in travel order", () => {
    const tracker = createThresholdTracker({
      thresholds: [
        { id: "t75", at: 75 },
        { id: "t50", at: 50 },
        { id: "t25", at: 25 },
      ],
      initial: 100,
    });
    const crossings = tracker.update(10);
    expect(crossings.map((c) => c.id)).toEqual(["t75", "t50", "t25"]); // high → low
    expect(crossings.every((c) => c.direction === "falling")).toBe(true);
  });

  test("a large rise emits skipped thresholds low → high", () => {
    const tracker = createThresholdTracker({
      thresholds: [
        { id: "t25", at: 25 },
        { id: "t50", at: 50 },
        { id: "t75", at: 75 },
      ],
      initial: 0,
    });
    expect(tracker.update(100).map((c) => c.id)).toEqual(["t25", "t50", "t75"]);
  });

  test("trigger filters to a single direction", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      trigger: "falling",
      initial: 100,
    });
    expect(tracker.update(40)).toHaveLength(1); // falling emitted
    expect(tracker.update(60)).toEqual([]); // rising suppressed
  });

  test("once policy fires each threshold at most once per direction", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      policy: "once",
      initial: 100,
    });
    expect(tracker.update(40)).toHaveLength(1);
    expect(tracker.update(60)).toHaveLength(1); // rising is a different direction, still fires once
    expect(tracker.update(40)).toEqual([]); // falling already fired
    expect(tracker.update(60)).toEqual([]); // rising already fired
  });

  test("hysteresis requires clearing the full band to flip and re-arm", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      hysteresis: 5,
      initial: 100,
    });
    expect(tracker.update(48)).toEqual([]); // inside band [45,55], no flip
    expect(tracker.update(44)).toHaveLength(1); // below 45 → falling
    expect(tracker.update(54)).toEqual([]); // inside band, not yet risen
    expect(tracker.update(56)).toHaveLength(1); // above 55 → rising
  });

  test("staying on the same side emits nothing", () => {
    const tracker = createThresholdTracker({ thresholds: [{ id: "half", at: 50 }], initial: 100 });
    expect(tracker.update(90)).toEqual([]);
    expect(tracker.update(80)).toEqual([]);
  });

  test("snapshot round-trips and preserves the once-ledger and sides", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      policy: "once",
      initial: 100,
    });
    tracker.update(40); // fires falling:once
    const snap = JSON.parse(JSON.stringify(tracker.snapshot()));

    const restored = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      policy: "once",
    });
    restored.restore(snap);
    expect(restored.value()).toBe(40);
    expect(restored.update(60)).toHaveLength(1); // rising still available
    expect(restored.update(40)).toEqual([]); // falling already fired before save
  });

  test("reset clears the once-ledger", () => {
    const tracker = createThresholdTracker({
      thresholds: [{ id: "half", at: 50 }],
      policy: "once",
      initial: 100,
    });
    tracker.update(40);
    expect(tracker.update(60)).toHaveLength(1);
    tracker.reset(100);
    expect(tracker.update(40)).toHaveLength(1); // fires again after reset
  });
});
