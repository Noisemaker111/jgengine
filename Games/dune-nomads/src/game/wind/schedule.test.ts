import { describe, expect, test } from "bun:test";

import { WIND_SHIFT_COUNT, buildWindSchedule, windStateAt, windVectorMagnitude } from "./schedule";

describe("buildWindSchedule", () => {
  test("is deterministic for a fixed seed", () => {
    const a = buildWindSchedule("dune-test-seed");
    const b = buildWindSchedule("dune-test-seed");
    expect(a.map((shift) => shift.direction)).toEqual(b.map((shift) => shift.direction));
    expect(a.map((shift) => shift.speed)).toEqual(b.map((shift) => shift.speed));
  });

  test("different seeds produce different schedules", () => {
    const a = buildWindSchedule("seed-a");
    const b = buildWindSchedule("seed-b");
    expect(a.map((shift) => shift.speed)).not.toEqual(b.map((shift) => shift.speed));
  });

  test("produces the brief's minimum of 8+ shifts per run", () => {
    const schedule = buildWindSchedule("dune-test-seed");
    expect(schedule.length).toBeGreaterThanOrEqual(8);
    expect(WIND_SHIFT_COUNT).toBeGreaterThanOrEqual(8);
  });

  test("every shift direction is a unit vector", () => {
    for (const shift of buildWindSchedule("dune-test-seed")) {
      expect(Math.hypot(shift.direction[0], shift.direction[1])).toBeCloseTo(1, 4);
    }
  });
});

describe("windStateAt", () => {
  const schedule = buildWindSchedule("dune-test-seed");

  test("is a pure function of elapsed time", () => {
    const a = windStateAt(schedule, 40, 123.4);
    const b = windStateAt(schedule, 40, 123.4);
    expect(a.index).toBe(b.index);
    expect(a.vector).toEqual(b.vector);
  });

  test("picks the first shift at t=0", () => {
    const state = windStateAt(schedule, 40, 0);
    expect(state.index).toBe(0);
    expect(state.secondsUntilNext).toBeCloseTo(40, 5);
  });

  test("advances to the next shift after the shift interval", () => {
    const state = windStateAt(schedule, 40, 41);
    expect(state.index).toBe(1);
  });

  test("wraps around after the last shift", () => {
    const state = windStateAt(schedule, 40, 40 * schedule.length + 5);
    expect(state.index).toBe(0);
  });

  test("reports a positive wind speed magnitude", () => {
    const state = windStateAt(schedule, 40, 15);
    expect(windVectorMagnitude(state.vector)).toBeGreaterThan(0);
  });
});
