import { describe, expect, test } from "bun:test";

import { easeInQuad } from "../anim/easing";
import { createMotionTrack } from "./motionTrack";

function sampleAt(now: number, track: ReturnType<typeof createMotionTrack>): [number, number, number] {
  const out: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN];
  track.sampleInto(now, out);
  return out;
}

describe("createMotionTrack — two points and a duration", () => {
  test("moves from the first point to the midpoint at half time, then to the last point", () => {
    const track = createMotionTrack({ points: [[0, 0, 0], [10, 0, 0]], duration: 2, startAt: 100 });

    const before = sampleAt(99, track);
    expect(before[0]).toBe(0);
    expect(track.sampleInto(99, [0, 0, 0])).toBe(0);

    const progress = track.sampleInto(101, [0, 0, 0]);
    const middle = sampleAt(101, track);
    expect(progress).toBeCloseTo(0.5, 6);
    expect(middle[0]).toBeCloseTo(5, 6);
    expect(middle[1]).toBeCloseTo(0, 6);
    expect(middle[2]).toBeCloseTo(0, 6);

    const after = sampleAt(103, track);
    expect(after[0]).toBeCloseTo(10, 6);
    expect(track.sampleInto(103, [0, 0, 0])).toBe(1);
  });
});

describe("createMotionTrack — progress over distance", () => {
  test("a speed-tracked L arrives by path length and bends at the corner", () => {
    const track = createMotionTrack({
      points: [[0, 0, 0], [3, 0, 0], [3, 4, 0]],
      speed: 1,
      startAt: 10,
    });

    expect(track.length()).toBeCloseTo(7, 6);
    expect(track.arrivesAt()).toBeCloseTo(17, 6);

    const progress = track.sampleInto(15, [0, 0, 0]);
    expect(progress).toBeCloseTo(5 / 7, 6);
    expect(sampleAt(15, track)[0]).toBeCloseTo(3, 6);
    expect(sampleAt(15, track)[1]).toBeCloseTo(2, 6);
    expect(sampleAt(15, track)[2]).toBeCloseTo(0, 6);
  });
});

describe("createMotionTrack — easing", () => {
  test("easeInQuad reaches a quarter of the distance at half time", () => {
    const track = createMotionTrack({
      points: [[0, 0, 0], [10, 0, 0]],
      duration: 2,
      startAt: 0,
      easing: easeInQuad,
    });

    expect(track.sampleInto(1, [0, 0, 0])).toBeCloseTo(0.25, 6);
    expect(sampleAt(1, track)[0]).toBeCloseTo(2.5, 6);
    expect(sampleAt(2, track)[0]).toBeCloseTo(10, 6);
  });
});

describe("createMotionTrack — arrival", () => {
  test("justArrived is false before, true once at arrival, false after", () => {
    const track = createMotionTrack({ points: [[0, 0, 0], [5, 0, 0]], duration: 2, startAt: 0 });

    expect(track.justArrived(1.999)).toBe(false);
    expect(track.justArrived(2)).toBe(true);
    expect(track.justArrived(2)).toBe(false);
    expect(track.justArrived(3)).toBe(false);
  });
});

describe("createMotionTrack — snapshot and restore", () => {
  test("restoring into a fresh track keeps the reported arrival", () => {
    const source = createMotionTrack({ points: [[0, 0, 0], [5, 0, 0]], duration: 2, startAt: 40 });
    expect(source.justArrived(42)).toBe(true);
    const state = source.snapshot();
    expect(state).toEqual({ startAt: 40, arrivalReported: true });

    const restored = createMotionTrack({ points: [[0, 0, 0], [5, 0, 0]], duration: 2, startAt: 0 });
    restored.restore(state);

    expect(restored.snapshot()).toEqual({ startAt: 40, arrivalReported: true });
    expect(restored.arrivesAt()).toBeCloseTo(42, 6);
    expect(restored.justArrived(43)).toBe(false);
  });
});

describe("createMotionTrack — retune and reset", () => {
  test("retuning the points changes the length and the arrival", () => {
    const track = createMotionTrack({
      points: [[0, 0, 0], [3, 0, 0], [3, 4, 0]],
      speed: 1,
      startAt: 0,
    });
    expect(track.length()).toBeCloseTo(7, 6);
    expect(track.arrivesAt()).toBeCloseTo(7, 6);

    track.retune({ points: [[0, 0, 0], [10, 0, 0]] });
    expect(track.length()).toBeCloseTo(10, 6);
    expect(track.arrivesAt()).toBeCloseTo(10, 6);
    expect(sampleAt(10, track)[0]).toBeCloseTo(10, 6);
  });

  test("replacing the duration retimes the same path", () => {
    const track = createMotionTrack({ points: [[0, 0, 0], [10, 0, 0]], duration: 2, startAt: 0 });
    track.retune({ duration: 5 });
    expect(track.arrivesAt()).toBeCloseTo(5, 6);
    expect(sampleAt(2.5, track)[0]).toBeCloseTo(5, 6);
  });

  test("reset clears the reported arrival and starts again from the config start", () => {
    const track = createMotionTrack({ points: [[0, 0, 0], [5, 0, 0]], duration: 2, startAt: 0 });
    expect(track.justArrived(2)).toBe(true);

    track.reset();

    expect(track.snapshot()).toEqual({ startAt: 0, arrivalReported: false });
    expect(track.justArrived(2)).toBe(true);
  });
});

describe("createMotionTrack — bad configs", () => {
  test("throws on fewer than two points", () => {
    expect(() => createMotionTrack({ points: [[0, 0, 0]], duration: 1, startAt: 0 })).toThrow(Error);
  });

  test("throws when both duration and speed are given", () => {
    expect(() =>
      createMotionTrack({ points: [[0, 0, 0], [1, 0, 0]], duration: 1, speed: 1, startAt: 0 }),
    ).toThrow(Error);
  });

  test("throws when neither duration nor speed is given", () => {
    expect(() => createMotionTrack({ points: [[0, 0, 0], [1, 0, 0]], startAt: 0 })).toThrow(Error);
  });

  test("throws when speed is zero or negative", () => {
    expect(() => createMotionTrack({ points: [[0, 0, 0], [1, 0, 0]], speed: 0, startAt: 0 })).toThrow(Error);
    expect(() => createMotionTrack({ points: [[0, 0, 0], [1, 0, 0]], speed: -2, startAt: 0 })).toThrow(Error);
  });

  test("retune rejects the same bad values", () => {
    const track = createMotionTrack({ points: [[0, 0, 0], [1, 0, 0]], duration: 1, startAt: 0 });
    expect(() => track.retune({ points: [[0, 0, 0]] })).toThrow(Error);
    expect(() => track.retune({ speed: 0 })).toThrow(Error);
    expect(() => track.retune({ duration: 1, speed: 1 })).toThrow(Error);
  });
});
