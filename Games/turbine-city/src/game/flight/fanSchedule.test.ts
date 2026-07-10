import { describe, expect, test } from "bun:test";
import { fanCycleSeconds, fanSpoolState, type FanSchedule } from "./fanSchedule";

const SCHEDULE: FanSchedule = { id: "fan-test", rampSec: 3, onSec: 16, offSec: 8, phaseOffset: 0, reverses: false };

describe("fanSpoolState", () => {
  test("is pure in t — identical t always yields identical state", () => {
    const a = fanSpoolState(SCHEDULE, 37.25);
    const b = fanSpoolState(SCHEDULE, 37.25);
    expect(a).toEqual(b);
  });

  test("walks up -> on -> down -> off across one cycle", () => {
    expect(fanSpoolState(SCHEDULE, 0).stage).toBe("up");
    expect(fanSpoolState(SCHEDULE, 1.5).power).toBeCloseTo(0.5, 5);
    expect(fanSpoolState(SCHEDULE, 3).stage).toBe("on");
    expect(fanSpoolState(SCHEDULE, 10).power).toBe(1);
    expect(fanSpoolState(SCHEDULE, 19).stage).toBe("down");
    expect(fanSpoolState(SCHEDULE, 27).stage).toBe("off");
    expect(fanSpoolState(SCHEDULE, 27).power).toBe(0);
  });

  test("wraps around to the next cycle deterministically", () => {
    const cycle = fanCycleSeconds(SCHEDULE);
    const first = fanSpoolState(SCHEDULE, 1.5);
    const second = fanSpoolState(SCHEDULE, 1.5 + cycle);
    expect(second).toEqual(first);
  });

  test("secondsToNextStage counts down to zero at the boundary", () => {
    const near = fanSpoolState(SCHEDULE, 18.5);
    expect(near.stage).toBe("on");
    expect(near.secondsToNextStage).toBeCloseTo(0.5, 5);
  });

  test("a non-reversing fan always spins forward", () => {
    expect(fanSpoolState(SCHEDULE, 5).direction).toBe(1);
    expect(fanSpoolState(SCHEDULE, 5 + fanCycleSeconds(SCHEDULE) * 3).direction).toBe(1);
  });

  test("a reversing fan flips direction every full cycle", () => {
    const reversing: FanSchedule = { ...SCHEDULE, reverses: true };
    const cycle = fanCycleSeconds(reversing);
    expect(fanSpoolState(reversing, 5).direction).toBe(1);
    expect(fanSpoolState(reversing, 5 + cycle).direction).toBe(-1);
    expect(fanSpoolState(reversing, 5 + cycle * 2).direction).toBe(1);
  });
});
