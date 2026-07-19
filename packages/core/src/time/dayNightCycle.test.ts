import { describe, expect, test } from "bun:test";

import { createDayNightCycle, type DayNightCycleOptions, type DayNightKeyframe } from "./dayNightCycle";

const KEYFRAMES: readonly DayNightKeyframe[] = [
  { at: 0, phase: "night", color: "#000000", intensity: 0 },
  { at: 0.25, phase: "dawn", color: "#ff8040", intensity: 0.5 },
  { at: 0.5, phase: "day", color: "#ffffff", lightColor: "#fff4d6", intensity: 1 },
  { at: 0.75, phase: "dusk", color: "#ff4020", intensity: 0.5 },
];

/** A cycle whose injected clock reads whatever `clock.t` is set to. */
function controllable(overrides: Partial<DayNightCycleOptions> = {}) {
  const clock = { t: 0 };
  const cycle = createDayNightCycle({
    keyframes: KEYFRAMES,
    dayLengthMs: 1000,
    now: () => clock.t,
    ...overrides,
  });
  return { cycle, clock };
}

describe("createDayNightCycle", () => {
  test("advances the day fraction from the injected clock and wraps past 1", () => {
    const { cycle, clock } = controllable();
    expect(cycle.dayFraction()).toBeCloseTo(0, 5);
    clock.t = 250;
    expect(cycle.dayFraction()).toBeCloseTo(0.25, 5);
    clock.t = 1000;
    expect(cycle.dayFraction()).toBeCloseTo(0, 5); // wrapped a full day
    clock.t = 1500;
    expect(cycle.dayFraction()).toBeCloseTo(0.5, 5);
  });

  test("speed multiplies the advance rate", () => {
    const { cycle, clock } = controllable({ speed: 2 });
    clock.t = 250; // 250ms real * 2 = 500ms game = half a 1000ms day
    expect(cycle.dayFraction()).toBeCloseTo(0.5, 5);
  });

  test("sample() reports the active phase and blends colors between keyframes", () => {
    const { cycle, clock } = controllable();
    clock.t = 250;
    const dawn = cycle.sample();
    expect(dawn.phase).toBe("dawn");
    expect(dawn.color.toLowerCase()).toBe("#ff8040");
    // Halfway from dawn(#ff8040) to day(#ffffff): channels lerp to mid values.
    clock.t = 375;
    const midMorning = cycle.sample();
    expect(midMorning.phase).toBe("dawn"); // phase is the "from" keyframe label
    expect(midMorning.intensity).toBeCloseTo(0.75, 5);
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(midMorning.color.slice(i, i + 2), 16));
    expect(r).toBe(255); // both ends 0xff
    expect(g).toBeGreaterThan(0x80);
    expect(b).toBeGreaterThan(0x40);
  });

  test("wraps the final segment from dusk back to night across the 1.0 boundary", () => {
    const { cycle, clock } = controllable();
    clock.t = 875; // halfway between dusk(0.75) and night(1.0/0.0)
    const s = cycle.sample();
    expect(s.phase).toBe("dusk");
    expect(s.intensity).toBeCloseTo(0.25, 5); // lerp 0.5 -> 0.0
  });

  test("phase strings are never interpreted — arbitrary labels round-trip", () => {
    const cycle = createDayNightCycle({
      keyframes: [
        { at: 0, phase: "eclipse", color: "#101010" },
        { at: 0.5, phase: "aurora-x7", color: "#00ffaa" },
      ],
      dayLengthMs: 1000,
      now: () => 0,
    });
    expect(cycle.phase()).toBe("eclipse");
    expect(cycle.sampleAt(0.6).phase).toBe("aurora-x7");
  });

  test("lightColor falls back to color; intensity defaults to 1", () => {
    const cycle = createDayNightCycle({
      keyframes: [{ at: 0, phase: "flat", color: "#334455" }],
      now: () => 0,
    });
    const s = cycle.sample();
    expect(s.lightColor.toLowerCase()).toBe("#334455");
    expect(s.intensity).toBe(1);
  });

  test("pause freezes advancement; play resumes and setSpeed(0) pauses", () => {
    const { cycle, clock } = controllable();
    clock.t = 250;
    cycle.pause();
    clock.t = 750; // 500ms elapses while paused — must not advance
    expect(cycle.dayFraction()).toBeCloseTo(0.25, 5);
    expect(cycle.isPaused()).toBe(true);
    cycle.play();
    clock.t = 1000; // 250ms after resume
    expect(cycle.dayFraction()).toBeCloseTo(0.5, 5);
    cycle.setSpeed(0);
    expect(cycle.isPaused()).toBe(true);
  });

  test("subscribe fires on control changes and unsubscribe stops it", () => {
    const { cycle } = controllable();
    let count = 0;
    const off = cycle.subscribe(() => {
      count += 1;
    });
    cycle.pause();
    cycle.play();
    cycle.setDayFraction(0.5);
    expect(count).toBe(3);
    off();
    cycle.pause();
    expect(count).toBe(3);
  });

  test("snapshot/restore round-trips the clock position, pause state, and speed", () => {
    const { cycle, clock } = controllable({ speed: 2 });
    clock.t = 100; // -> 0.2 of the day
    const snap = cycle.snapshot();
    expect(snap.paused).toBe(false);
    expect(snap.speed).toBe(2);

    const clock2 = { t: 5000 };
    const other = createDayNightCycle({ keyframes: KEYFRAMES, dayLengthMs: 1000, now: () => clock2.t });
    other.restore(snap);
    expect(other.dayFraction()).toBeCloseTo(0.2, 5);
    clock2.t = 5100; // 100ms later at restored speed 2 -> +0.2
    expect(other.dayFraction()).toBeCloseTo(0.4, 5);
  });

  test("setDayFraction jumps the clock and keeps advancing from there", () => {
    const { cycle, clock } = controllable();
    clock.t = 500;
    cycle.setDayFraction(0.9);
    expect(cycle.dayFraction()).toBeCloseTo(0.9, 5);
    clock.t = 600;
    expect(cycle.dayFraction()).toBeCloseTo(0, 5); // 0.9 + 0.1 wraps
  });

  test("calendar() adapter exposes the day fraction for a sky/daylight seam", () => {
    const { cycle, clock } = controllable();
    clock.t = 500;
    expect(cycle.calendar().dayFraction).toBeCloseTo(0.5, 5);
  });

  test("throws on empty keyframes so the misconfiguration is loud", () => {
    expect(() => createDayNightCycle({ keyframes: [] })).toThrow(/at least one keyframe/);
  });
});
