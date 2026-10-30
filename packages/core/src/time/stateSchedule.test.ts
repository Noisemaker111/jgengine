import { describe, expect, test } from "bun:test";

import { createPhaseSchedule, createStateSchedule, nextClearWindow } from "@jgengine/core/time/stateSchedule";

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

describe("createPhaseSchedule", () => {
  const loading = () =>
    createPhaseSchedule({
      phases: [
        { state: "loading", durationSeconds: 2 },
        { state: "riding", durationSeconds: 5 },
        { state: "unloading", durationSeconds: 1 },
      ],
    });

  test("timed phases advance on their own duration, carrying overshoot", () => {
    const schedule = loading();
    expect(schedule.state()).toBe("loading");
    expect(schedule.tick(1.5)).toEqual([]);
    expect(schedule.remainingSeconds()).toBeCloseTo(0.5, 5);
    expect(schedule.fraction()).toBeCloseTo(0.75, 5);
    const steps = schedule.tick(1);
    expect(steps).toEqual([{ from: "loading", to: "riding", wrapped: false }]);
    expect(schedule.remainingSeconds()).toBeCloseTo(4.5, 5);
  });

  test("a phase without a duration waits for advance()", () => {
    const schedule = createPhaseSchedule({
      phases: [{ state: "idle" }, { state: "counting", durationSeconds: 3 }, { state: "racing" }],
    });
    expect(schedule.state()).toBe("idle");
    expect(schedule.remainingSeconds()).toBeNull();
    expect(schedule.fraction()).toBe(0);
    expect(schedule.tick(10)).toEqual([]);
    expect(schedule.state()).toBe("idle");
    expect(schedule.advance()).toBe("counting");
    expect(schedule.remainingSeconds()).toBe(3);
    const steps = schedule.tick(4);
    expect(steps).toEqual([{ from: "counting", to: "racing", wrapped: false }]);
    expect(schedule.remainingSeconds()).toBeNull();
  });

  test("a non-looping schedule ends on its last phase", () => {
    const schedule = loading();
    schedule.tick(7);
    expect(schedule.state()).toBe("unloading");
    expect(schedule.ended()).toBe(false);
    expect(schedule.remainingSeconds()).toBeCloseTo(1, 5);
    const steps = schedule.tick(1);
    expect(steps).toEqual([]);
    expect(schedule.ended()).toBe(true);
    expect(schedule.remainingSeconds()).toBe(0);
    expect(schedule.fraction()).toBe(1);
    expect(schedule.advance()).toBe("unloading");
    expect(schedule.tick(5)).toEqual([]);
  });

  test("ending an event phase at the end finishes the schedule", () => {
    const schedule = createPhaseSchedule({ phases: [{ state: "mine" }, { state: "done" }] });
    expect(schedule.advance()).toBe("done");
    expect(schedule.ended()).toBe(false);
    expect(schedule.advance()).toBe("done");
    expect(schedule.ended()).toBe(true);
  });

  test("loop wraps to the first phase and reports the wrap", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "buy", durationSeconds: 1 },
        { state: "live", durationSeconds: 2 },
      ],
      loop: true,
    });
    const steps = schedule.tick(3.25);
    expect(steps).toEqual([
      { from: "buy", to: "live", wrapped: false },
      { from: "live", to: "buy", wrapped: true },
    ]);
    expect(schedule.state()).toBe("buy");
    expect(schedule.remainingSeconds()).toBeCloseTo(0.75, 5);
    expect(schedule.ended()).toBe(false);
  });

  test("a timed phase of zero seconds ends on the next tick", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "cue", durationSeconds: 0 },
        { state: "hold" },
      ],
    });
    expect(schedule.tick(0.016)).toEqual([{ from: "cue", to: "hold", wrapped: false }]);
  });

  test("enter jumps to a named phase and clears its elapsed time", () => {
    const schedule = loading();
    schedule.tick(1);
    expect(schedule.enter("unloading")).toBe(true);
    expect(schedule.state()).toBe("unloading");
    expect(schedule.remainingSeconds()).toBe(1);
    expect(schedule.enter("lost")).toBe(false);
    expect(schedule.state()).toBe("unloading");
  });

  test("snapshot and restore round-trip a schedule mid-phase", () => {
    const schedule = loading();
    schedule.tick(3);
    const saved = schedule.snapshot();
    schedule.tick(10);
    expect(schedule.ended()).toBe(true);
    schedule.restore(saved);
    expect(schedule.state()).toBe("riding");
    expect(schedule.remainingSeconds()).toBeCloseTo(4, 5);
    expect(schedule.ended()).toBe(false);
  });

  test("restore clamps an out-of-range position", () => {
    const schedule = loading();
    schedule.restore({ index: 99, elapsedSeconds: 500, ended: false });
    expect(schedule.index()).toBe(2);
    expect(schedule.remainingSeconds()).toBeCloseTo(0, 5);
    schedule.restore({ index: -4, elapsedSeconds: -1, ended: false });
    expect(schedule.index()).toBe(0);
    expect(schedule.remainingSeconds()).toBe(2);
    expect(schedule.ended()).toBe(false);
  });

  test("reset returns to the first phase", () => {
    const schedule = loading();
    schedule.tick(10);
    schedule.reset();
    expect(schedule.state()).toBe("loading");
    expect(schedule.remainingSeconds()).toBe(2);
    expect(schedule.ended()).toBe(false);
  });

  test("goTo enters a phase off the ordered list and its next decides what follows", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "idle" },
        { state: "loading", durationSeconds: 1 },
        { state: "unloading", durationSeconds: 1, next: "idle" },
        { state: "broken", durationSeconds: 2, next: "idle" },
      ],
      loop: true,
    });
    expect(schedule.goTo("broken")).toBe(true);
    expect(schedule.state()).toBe("broken");
    expect(schedule.remainingSeconds()).toBe(2);
    expect(schedule.goTo("lost")).toBe(false);
    expect(schedule.state()).toBe("broken");
    expect(schedule.tick(2)).toEqual([{ from: "broken", to: "idle", wrapped: true }]);
  });

  test("a next override skips the list order without reporting a wrap", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "idle" },
        { state: "loading", durationSeconds: 1 },
        { state: "broken", durationSeconds: 2, next: "idle" },
      ],
      loop: true,
    });
    schedule.goTo("loading");
    expect(schedule.tick(1)).toEqual([{ from: "loading", to: "broken", wrapped: false }]);
    expect(schedule.tick(2)).toEqual([{ from: "broken", to: "idle", wrapped: true }]);
  });

  test("an explicit id addresses a phase whose state is not a name", () => {
    const schedule = createPhaseSchedule<number>({
      phases: [
        { state: 0, id: "start" },
        { state: 1, id: "run", durationSeconds: 3 },
      ],
      loop: true,
    });
    expect(schedule.goTo("run")).toBe(true);
    expect(schedule.state()).toBe(1);
    expect(schedule.retune("run", 5)).toBe(true);
    expect(schedule.remainingSeconds()).toBe(5);
  });

  test("rejects a next phase that does not exist", () => {
    expect(() => createPhaseSchedule({ phases: [{ state: "a", next: "b" }] })).toThrow("unknown next phase");
  });

  test("retune changes a phase's seconds in play and keeps its elapsed time", () => {
    const schedule = loading();
    schedule.tick(1);
    expect(schedule.retune("loading", 4)).toBe(true);
    expect(schedule.state()).toBe("loading");
    expect(schedule.remainingSeconds()).toBe(3);
    expect(schedule.fraction()).toBeCloseTo(0.25, 5);
    expect(schedule.retune("lost", 4)).toBe(false);
    expect(() => schedule.retune("loading", -1)).toThrow("at least zero");
    expect(() => schedule.retune("loading", Number.NaN)).toThrow("at least zero");
    expect(schedule.state()).toBe("loading");
    expect(schedule.tick(3)).toEqual([{ from: "loading", to: "riding", wrapped: false }]);
  });

  test("drop step mode ends the tick at its first phase change", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "load", durationSeconds: 1 },
        { state: "ride", durationSeconds: 1 },
        { state: "unload", durationSeconds: 1 },
      ],
      loop: true,
      overshoot: "drop",
    });
    expect(schedule.tick(2.5)).toEqual([{ from: "load", to: "ride", wrapped: false }]);
    expect(schedule.state()).toBe("ride");
    expect(schedule.remainingSeconds()).toBe(1);
    expect(schedule.tick(0.5)).toEqual([]);
    expect(schedule.remainingSeconds()).toBeCloseTo(0.5, 5);
    expect(schedule.tick(0.5)).toEqual([{ from: "ride", to: "unload", wrapped: false }]);
    expect(schedule.remainingSeconds()).toBe(1);
  });

  test("a zero-length phase passes through on the next tick in drop mode too", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "cue", durationSeconds: 0 },
        { state: "wait" },
        { state: "go", durationSeconds: 0 },
        { state: "rest" },
      ],
      overshoot: "drop",
    });
    expect(schedule.tick(0.1)).toEqual([{ from: "cue", to: "wait", wrapped: false }]);
    expect(schedule.state()).toBe("wait");
    expect(schedule.tick(5)).toEqual([]);
    expect(schedule.advance()).toBe("go");
    expect(schedule.tick(0.1)).toEqual([{ from: "go", to: "rest", wrapped: false }]);
  });

  test("snapshot and restore round-trip a jumped-to, retuned phase", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "idle" },
        { state: "loading", durationSeconds: 2 },
        { state: "broken", durationSeconds: 10, next: "idle" },
      ],
      loop: true,
    });
    schedule.goTo("broken");
    schedule.retune("broken", 6);
    schedule.tick(2.5);
    const saved = schedule.snapshot();
    schedule.goTo("idle");
    schedule.restore(saved);
    expect(schedule.state()).toBe("broken");
    expect(schedule.index()).toBe(2);
    expect(schedule.remainingSeconds()).toBeCloseTo(3.5, 5);
    expect(schedule.ended()).toBe(false);
  });

  test("snapshot and restore round-trip a drop-mode schedule at a zero-length phase", () => {
    const schedule = createPhaseSchedule({
      phases: [
        { state: "a", durationSeconds: 0 },
        { state: "b", durationSeconds: 4 },
        { state: "c", durationSeconds: 0 },
      ],
      loop: true,
      overshoot: "drop",
    });
    expect(schedule.tick(0.1)).toEqual([{ from: "a", to: "b", wrapped: false }]);
    const saved = schedule.snapshot();
    expect(schedule.tick(4)).toEqual([{ from: "b", to: "c", wrapped: false }]);
    expect(schedule.state()).toBe("c");
    schedule.restore(saved);
    expect(schedule.state()).toBe("b");
    expect(schedule.index()).toBe(1);
    expect(schedule.remainingSeconds()).toBe(4);
  });

  test("rejects an empty list and a negative duration", () => {
    expect(() => createPhaseSchedule({ phases: [] })).toThrow();
    expect(() => createPhaseSchedule({ phases: [{ state: "x", durationSeconds: -1 }] })).toThrow();
    expect(() => createPhaseSchedule({ phases: [{ state: "x", durationSeconds: Number.NaN }] })).toThrow();
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
