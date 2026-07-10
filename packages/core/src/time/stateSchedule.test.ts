import { describe, expect, test } from "bun:test";

import { createStateSchedule, nextClearWindow } from "@jgengine/core/time/stateSchedule";

const traffic = () =>
  createStateSchedule({
    phases: [
      { state: "green", durationSeconds: 10 },
      { state: "yellow", durationSeconds: 2 },
      { state: "red", durationSeconds: 8 },
    ],
  });

describe("createStateSchedule", () => {
  test("stateAt is a pure function of absolute time and loops", () => {
    const schedule = traffic();
    expect(schedule.cycleSeconds).toBe(20);
    expect(schedule.stateAt(0)).toBe("green");
    expect(schedule.stateAt(10)).toBe("yellow");
    expect(schedule.stateAt(12)).toBe("red");
    expect(schedule.stateAt(20)).toBe("green");
    expect(schedule.stateAt(212)).toBe("red");
    expect(schedule.stateAt(-5)).toBe("red");
  });

  test("sampleAt reports phase timing and fraction", () => {
    const sample = traffic().sampleAt(15);
    expect(sample.state).toBe("red");
    expect(sample.index).toBe(2);
    expect(sample.elapsedSeconds).toBe(3);
    expect(sample.remainingSeconds).toBe(5);
    expect(sample.fraction).toBeCloseTo(3 / 8, 5);
  });

  test("nextTransitionAt gives the countdown seam", () => {
    const schedule = traffic();
    expect(schedule.nextTransitionAt(0)).toBe(10);
    expect(schedule.nextTransitionAt(11)).toBe(12);
    expect(schedule.nextTransitionAt(25)).toBe(30);
  });

  test("offset staggers identical schedules", () => {
    const late = createStateSchedule({
      phases: [
        { state: "on", durationSeconds: 5 },
        { state: "off", durationSeconds: 5 },
      ],
      offsetSeconds: 5,
    });
    expect(late.stateAt(0)).toBe("off");
    expect(late.stateAt(5)).toBe("on");
  });

  test("non-looping schedules clamp to the final phase forever", () => {
    const oneShot = createStateSchedule({
      phases: [
        { state: "arming", durationSeconds: 3 },
        { state: "armed", durationSeconds: 1 },
      ],
      loop: false,
    });
    expect(oneShot.stateAt(100)).toBe("armed");
    expect(oneShot.sampleAt(100).remainingSeconds).toBe(Number.POSITIVE_INFINITY);
    expect(oneShot.nextTransitionAt(100)).toBe(Number.POSITIVE_INFINITY);
  });

  test("windowsOf and nextWindow forecast matching phases across cycles", () => {
    const schedule = traffic();
    const windows = schedule.windowsOf((state) => state === "green", 5, 40);
    expect(windows).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 30 },
      { start: 40, end: 45 },
    ]);
    expect(schedule.nextWindow((state) => state === "red", 0)).toEqual({ start: 12, end: 20 });
    expect(schedule.nextWindow(() => false, 0)).toBeNull();
  });

  test("rejects empty and non-positive phases", () => {
    expect(() => createStateSchedule({ phases: [] })).toThrow();
    expect(() => createStateSchedule({ phases: [{ state: "x", durationSeconds: 0 }] })).toThrow();
  });
});

describe("nextClearWindow", () => {
  test("scans a predicate of time for the next open gap", () => {
    const busy = (t: number) => t % 10 < 6;
    const window = nextClearWindow((t) => !busy(t), { fromSeconds: 0, horizonSeconds: 30, stepSeconds: 0.5 });
    expect(window).not.toBeNull();
    expect(window!.start).toBeCloseTo(6, 5);
    expect(window!.end).toBeCloseTo(10, 5);
  });

  test("respects minDurationSeconds and returns null when nothing qualifies", () => {
    const clearBriefly = (t: number) => t >= 4 && t < 5;
    expect(
      nextClearWindow(clearBriefly, { fromSeconds: 0, horizonSeconds: 20, stepSeconds: 0.25, minDurationSeconds: 3 }),
    ).toBeNull();
  });
});
