import { describe, expect, test } from "bun:test";

import { createDamageDirectionTracker } from "./damageDirection";

/** A controllable clock so fade timing is deterministic. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe("createDamageDirectionTracker", () => {
  test("a registered hit is active at full peak, then fades to nothing", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000 });
    tracker.registerHit({ angle: Math.PI / 2, intensity: 1 });

    let active = tracker.active();
    expect(active.length).toBe(1);
    expect(active[0]!.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(active[0]!.intensity).toBeCloseTo(1, 6);

    clock.advance(500); // halfway: eased(0.5) = 1 - 0.25 = 0.75
    active = tracker.active();
    expect(active[0]!.intensity).toBeCloseTo(0.75, 6);
    expect(active[0]!.age).toBeCloseTo(0.5, 6);

    clock.advance(500); // reaches duration → gone
    expect(tracker.active().length).toBe(0);
    expect(tracker.count()).toBe(0);
  });

  test("multiple hits from different bearings coexist as separate arcs", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000 });
    tracker.registerHit({ angle: 0 });
    tracker.registerHit({ angle: Math.PI });
    tracker.registerHit({ angle: -Math.PI / 2, intensity: 0.5 });
    expect(tracker.count()).toBe(3);
    expect(tracker.active().length).toBe(3);
  });

  test("active() is sorted strongest-first", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000 });
    tracker.registerHit({ angle: 0, intensity: 0.3 });
    tracker.registerHit({ angle: 1, intensity: 0.9 });
    tracker.registerHit({ angle: 2, intensity: 0.6 });
    const active = tracker.active();
    expect(active.map((i) => i.intensity)).toEqual([...active.map((i) => i.intensity)].sort((a, b) => b - a));
    expect(active[0]!.angle).toBeCloseTo(1, 6);
  });

  test("intensity is clamped to 0..1", () => {
    const tracker = createDamageDirectionTracker();
    const view = tracker.registerHit({ angle: 0, intensity: 5 });
    expect(view.intensity).toBeCloseTo(1, 6);
  });

  test("mergeWindow refreshes a nearby same-kind hit instead of adding one", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000, mergeWindow: 0.2 });
    tracker.registerHit({ angle: 1.0, intensity: 0.5, kind: "melee" });
    clock.advance(400);
    tracker.registerHit({ angle: 1.1, intensity: 0.4, kind: "melee" }); // within window → merge & refresh
    expect(tracker.count()).toBe(1);
    const active = tracker.active();
    // Refreshed birth: age resets and peak keeps the stronger 0.5.
    expect(active[0]!.age).toBeCloseTo(0, 6);
    expect(active[0]!.intensity).toBeCloseTo(0.5, 6);
  });

  test("mergeWindow does not merge different kinds or far angles", () => {
    const tracker = createDamageDirectionTracker({ duration: 1000, mergeWindow: 0.2 });
    tracker.registerHit({ angle: 1.0, kind: "melee" });
    tracker.registerHit({ angle: 1.05, kind: "fire" }); // same angle, different kind
    tracker.registerHit({ angle: 2.5, kind: "melee" }); // same kind, far angle
    expect(tracker.count()).toBe(3);
  });

  test("angle wrap-around near ±π merges correctly", () => {
    const tracker = createDamageDirectionTracker({ duration: 1000, mergeWindow: 0.3 });
    tracker.registerHit({ angle: Math.PI - 0.05 });
    tracker.registerHit({ angle: -Math.PI + 0.05 }); // ~0.1 rad apart across the seam
    expect(tracker.count()).toBe(1);
  });

  test("pool is bounded: the weakest indicator is evicted when full", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000, max: 2 });
    tracker.registerHit({ angle: 0, intensity: 0.2 }); // weakest
    tracker.registerHit({ angle: 1, intensity: 1.0 });
    tracker.registerHit({ angle: 2, intensity: 0.8 }); // full → evicts the 0.2
    expect(tracker.count()).toBe(2);
    const angles = tracker.active().map((i) => Math.round(i.angle));
    expect(angles).not.toContain(0);
    expect(angles).toContain(1);
    expect(angles).toContain(2);
  });

  test("clear drops everything and subscribe fires on activity", () => {
    const tracker = createDamageDirectionTracker({ duration: 1000 });
    let hits = 0;
    const off = tracker.subscribe(() => { hits += 1; });
    tracker.registerHit({ angle: 0 });
    tracker.registerHit({ angle: 1 });
    expect(tracker.count()).toBe(2);
    tracker.clear();
    expect(tracker.count()).toBe(0);
    off();
    tracker.registerHit({ angle: 2 });
    expect(hits).toBe(3); // two hits + clear, not the post-unsubscribe hit
  });

  test("snapshot/restore round-trips live indicators with correct ages", () => {
    const clock = fakeClock();
    const tracker = createDamageDirectionTracker({ now: clock.now, duration: 1000 });
    tracker.registerHit({ angle: 0.5, intensity: 0.8, kind: "fire" });
    clock.advance(300);
    tracker.registerHit({ angle: 2.0, intensity: 0.6 });
    const snap = JSON.parse(JSON.stringify(tracker.snapshot()));

    const revived = createDamageDirectionTracker({ now: clock.now, duration: 1000 });
    revived.restore(snap);
    expect(revived.count()).toBe(2);
    const original = tracker.active();
    const restored = revived.active();
    expect(restored.length).toBe(original.length);
    // Same eased strengths at the same clock time.
    const byAngle = (arr: readonly { angle: number; intensity: number }[]) =>
      [...arr].sort((a, b) => a.angle - b.angle).map((i) => i.intensity);
    expect(byAngle(restored)).toEqual(byAngle(original));
  });

  test("active() reuses its output objects (allocation-aware)", () => {
    const tracker = createDamageDirectionTracker({ duration: 1000 });
    tracker.registerHit({ angle: 0 });
    const first = tracker.active()[0];
    const second = tracker.active()[0];
    expect(first).toBe(second); // same pooled view object identity
  });
});
