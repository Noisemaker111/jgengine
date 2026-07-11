import { describe, expect, test } from "bun:test";

import {
  classifyBeatAccuracy,
  createBeatClock,
  createBeatInputBuffer,
  inBarWindow,
  nearestBeatDelta,
  nextBeatTime,
} from "./beatClock";

describe("createBeatClock — tick scheduling", () => {
  test("120 bpm advances one beat every 0.5 game-seconds", () => {
    const clock = createBeatClock({ bpm: 120 });
    expect(clock.beatDurationSec()).toBeCloseTo(0.5, 5);
    const snapshot = clock.advance(0.5);
    expect(snapshot.beatIndex).toBe(1);
    expect(snapshot.phase).toBeCloseTo(0, 5);
  });

  test("fires onBeat once per newly crossed integer beat", () => {
    const fired: number[] = [];
    const clock = createBeatClock({ bpm: 120 }, (beatIndex) => fired.push(beatIndex));
    clock.advance(1.25);
    expect(fired).toEqual([0, 1, 2]);
    clock.advance(0.5);
    expect(fired).toEqual([0, 1, 2, 3]);
  });

  test("bar/beatInBar wrap using beatsPerBar", () => {
    const clock = createBeatClock({ bpm: 60, beatsPerBar: 4 });
    const snapshot = clock.advance(9);
    expect(snapshot.beatIndex).toBe(9);
    expect(snapshot.bar).toBe(2);
    expect(snapshot.beatInBar).toBe(1);
  });

  test("negative or zero dt never moves the clock backward", () => {
    const clock = createBeatClock({ bpm: 120 });
    clock.advance(1);
    const before = clock.now();
    clock.advance(-5);
    expect(clock.now()).toBe(before);
  });

  test("bpm() reports the configured tempo", () => {
    const clock = createBeatClock({ bpm: 174 });
    expect(clock.bpm()).toBe(174);
  });
});

describe("nextBeatTime — input quantization", () => {
  test("snaps forward to the next beat boundary", () => {
    expect(nextBeatTime(0.1, 0.5)).toBeCloseTo(0.5, 5);
    expect(nextBeatTime(0.49, 0.5)).toBeCloseTo(0.5, 5);
  });

  test("a press exactly on the beat resolves to that same instant", () => {
    expect(nextBeatTime(1.0, 0.5)).toBeCloseTo(1.0, 5);
  });

  test("a press just after a beat still waits for the next one", () => {
    expect(nextBeatTime(0.51, 0.5)).toBeCloseTo(1.0, 5);
  });
});

describe("createBeatInputBuffer — buffered action fires on next beat", () => {
  test("an action buffered mid-beat fires only once its beat arrives", () => {
    const buffer = createBeatInputBuffer<string>(0.5);
    const fireAt = buffer.buffer("dash", 0.1);
    expect(fireAt).toBeCloseTo(0.5, 5);
    expect(buffer.advance(0.3)).toEqual([]);
    expect(buffer.pendingCount()).toBe(1);
    expect(buffer.advance(0.5)).toEqual(["dash"]);
    expect(buffer.pendingCount()).toBe(0);
  });

  test("multiple buffered actions fire together once their shared beat arrives", () => {
    const buffer = createBeatInputBuffer<string>(0.5);
    buffer.buffer("attack", 0.05);
    buffer.buffer("block", 0.2);
    const fired = buffer.advance(0.5);
    expect(fired.sort()).toEqual(["attack", "block"]);
  });

  test("an action buffered exactly on a beat fires immediately", () => {
    const buffer = createBeatInputBuffer<string>(0.5);
    buffer.buffer("parry", 1.0);
    expect(buffer.advance(1.0)).toEqual(["parry"]);
  });

  test("clear drops all pending actions", () => {
    const buffer = createBeatInputBuffer<string>(0.5);
    buffer.buffer("dash", 0.1);
    buffer.clear();
    expect(buffer.pendingCount()).toBe(0);
    expect(buffer.advance(10)).toEqual([]);
  });
});

describe("nearestBeatDelta — signed offset to the nearest beat", () => {
  test("early is negative", () => {
    expect(nearestBeatDelta(0.9, 1.0)).toBeCloseTo(-0.1, 5);
  });

  test("late is positive", () => {
    expect(nearestBeatDelta(1.1, 1.0)).toBeCloseTo(0.1, 5);
  });

  test("landing exactly on the beat is zero", () => {
    expect(nearestBeatDelta(2.0, 1.0)).toBe(0);
  });
});

describe("classifyBeatAccuracy — default tiers", () => {
  test("within 0.06s classifies as perfect", () => {
    expect(classifyBeatAccuracy(1.02, 1.0).tier).toBe("perfect");
  });

  test("within 0.14s but beyond perfect classifies as good", () => {
    expect(classifyBeatAccuracy(1.1, 1.0).tier).toBe("good");
  });

  test("beyond every tier classifies as miss", () => {
    expect(classifyBeatAccuracy(1.3, 1.0).tier).toBe("miss");
  });

  test("custom tiers override the default windows", () => {
    const aceOnly = [{ id: "ace", windowSec: 0.02 }];
    expect(classifyBeatAccuracy(1.05, 1.0, aceOnly).tier).toBe("miss");
    expect(classifyBeatAccuracy(1.01, 1.0, aceOnly).tier).toBe("ace");
  });
});

describe("inBarWindow", () => {
  test("membership in a bar-relative window using a live clock snapshot", () => {
    const clock = createBeatClock({ bpm: 60, beatsPerBar: 4 });
    clock.advance(5);
    expect(inBarWindow(clock.snapshot(), 1, 3)).toBe(true);

    clock.advance(1.9);
    expect(inBarWindow(clock.snapshot(), 1, 3)).toBe(true);

    clock.advance(0.2);
    expect(inBarWindow(clock.snapshot(), 1, 3)).toBe(false);
  });
});
