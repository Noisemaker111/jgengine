import { describe, expect, test } from "bun:test";

import type { PacedSchedule } from "@jgengine/core/time/pacedSchedule";
import { createPacedSchedule } from "@jgengine/core/time/pacedSchedule";

import { seededRng } from "../random/rng";

/** Fire every event up to `steps` and record the time `due` reported each one. */
function fireTimes(schedule: PacedSchedule, from: number, steps: number): number[] {
  const times: number[] = [];
  let now = from;
  for (let step = 0; step < steps; step += 1) {
    const wait = schedule.remaining(now);
    if (wait === undefined) break;
    now += Math.max(wait, Number.EPSILON);
    const indices = schedule.due(now);
    if (indices.length === 0) break;
    times.push(now);
  }
  return times;
}

describe("createPacedSchedule", () => {
  test("fires nothing before firstAt, then every `every` seconds", () => {
    const schedule = createPacedSchedule({ firstAt: 10, every: 5 }, seededRng("pace"));
    expect(schedule.due(0)).toEqual([]);
    expect(schedule.due(9.999)).toEqual([]);
    expect(schedule.due(10)).toEqual([0]);
    expect(schedule.due(12)).toEqual([]);
    expect(schedule.due(15)).toEqual([1]);
    expect(schedule.due(20)).toEqual([2]);
    expect(schedule.done()).toBe(false);
  });

  test("count stops the schedule", () => {
    const schedule = createPacedSchedule({ firstAt: 0, every: 2, count: 3 }, seededRng("count"));
    expect(schedule.due(100)).toEqual([0, 1, 2]);
    expect(schedule.done()).toBe(true);
    expect(schedule.remaining(100)).toBeUndefined();
    expect(schedule.due(200)).toEqual([]);
  });

  test("every 0 fires once", () => {
    const schedule = createPacedSchedule({ firstAt: 4, every: 0 }, seededRng("once"));
    expect(schedule.due(3.9)).toEqual([]);
    expect(schedule.due(4)).toEqual([0]);
    expect(schedule.done()).toBe(true);
    expect(schedule.due(500)).toEqual([]);
  });

  test("jitter is deterministic per seed and never makes a negative gap", () => {
    const first = fireTimes(createPacedSchedule({ firstAt: 0, every: 10, jitter: 3 }, seededRng("a")), 0, 6);
    const again = fireTimes(createPacedSchedule({ firstAt: 0, every: 10, jitter: 3 }, seededRng("a")), 0, 6);
    const other = fireTimes(createPacedSchedule({ firstAt: 0, every: 10, jitter: 3 }, seededRng("b")), 0, 6);
    expect(first).toHaveLength(6);
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);

    const shortGap = createPacedSchedule({ firstAt: 0, every: 1, jitter: 10 }, () => 0, { maxPerTick: 1 });
    expect(shortGap.due(0)).toEqual([0]);
    expect(shortGap.snapshot().nextAt).toBe(0);

    const longGap = createPacedSchedule({ firstAt: 0, every: 1, jitter: 10 }, () => 1, { maxPerTick: 1 });
    expect(longGap.due(0)).toEqual([0]);
    expect(longGap.snapshot().nextAt).toBe(11);

    const wide = fireTimes(createPacedSchedule({ firstAt: 0, every: 1, jitter: 10 }, seededRng("wide")), 0, 20);
    expect(wide).toHaveLength(20);
    for (let index = 1; index < wide.length; index += 1) {
      expect(wide[index] ?? 0).toBeGreaterThanOrEqual(wide[index - 1] ?? 0);
      expect(Number.isFinite(wide[index])).toBe(true);
    }
  });

  test("pause and resume shift the next event by the paused time", () => {
    const schedule = createPacedSchedule({ firstAt: 10, every: 10 }, seededRng("pause"));
    schedule.pause(5);
    expect(schedule.due(12)).toEqual([]);
    schedule.resume(15);
    expect(schedule.due(19)).toEqual([]);
    expect(schedule.due(20)).toEqual([0]);
    expect(schedule.due(30)).toEqual([1]);
  });

  test("snapshot mid-run restores into a fresh schedule", () => {
    const schedule = createPacedSchedule({ firstAt: 1, every: 4, count: 10 }, seededRng("snap"));
    expect(schedule.due(8)).toEqual([0, 1]);
    const state = schedule.snapshot();
    expect(state).toEqual({ nextAt: 9, fired: 2, pausedAt: null });

    const restored = createPacedSchedule({ firstAt: 1, every: 4, count: 10 }, seededRng("snap"));
    restored.restore(state);
    expect(restored.due(8.9)).toEqual([]);
    expect(restored.due(9)).toEqual(schedule.due(9));
    expect(restored.due(13)).toEqual(schedule.due(13));
    expect(restored.snapshot()).toEqual(schedule.snapshot());
  });

  test("a huge time jump returns at most maxPerTick and the rest on later calls", () => {
    const schedule = createPacedSchedule({ firstAt: 0, every: 1, count: 8 }, seededRng("burst"), { maxPerTick: 4 });
    expect(schedule.due(100)).toEqual([0, 1, 2, 3]);
    expect(schedule.done()).toBe(false);
    expect(schedule.due(100)).toEqual([4, 5, 6, 7]);
    expect(schedule.done()).toBe(true);
    expect(schedule.due(100)).toEqual([]);
  });

  test("retune changes later gaps but not the planned one, and reset restarts", () => {
    const schedule = createPacedSchedule({ firstAt: 0, every: 10 }, seededRng("retune"));
    expect(schedule.due(0)).toEqual([0]);
    schedule.retune({ every: 1 });
    expect(schedule.due(9)).toEqual([]);
    expect(schedule.due(10)).toEqual([1]);
    expect(schedule.due(11)).toEqual([2]);

    schedule.reset();
    expect(schedule.snapshot()).toEqual({ nextAt: 0, fired: 0, pausedAt: null });
    expect(schedule.remaining(0)).toBe(0);
    expect(schedule.due(0)).toEqual([0]);
  });
});
