import { describe, expect, test } from "bun:test";

import { AxisChannel, DRIVE_AXIS_BINDINGS, clampAxis, rampToward } from "./axisInput";

const held = (...codes: string[]) => (code: string) => codes.includes(code);

describe("rampToward / clampAxis", () => {
  test("ramps toward the target at the given rate and lands exactly", () => {
    expect(rampToward(0, 1, 4, 0.1)).toBeCloseTo(0.4, 5);
    expect(rampToward(0.8, 1, 4, 0.1)).toBe(1);
  });

  test("infinite rate snaps instantly", () => {
    expect(rampToward(0, 1, Number.POSITIVE_INFINITY, 0.001)).toBe(1);
  });

  test("clampAxis respects per-axis range", () => {
    expect(clampAxis(2, { min: 0, max: 1 })).toBe(1);
    expect(clampAxis(-2, { min: -1, max: 1 })).toBe(-1);
  });
});

describe("AxisChannel", () => {
  test("digital keys ramp analog throttle up over time (pedal feel), not instant", () => {
    const ch = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 4 });
    const first = ch.sample(0.1, held("KeyW"));
    expect(first.throttle).toBeGreaterThan(0);
    expect(first.throttle).toBeLessThan(1);
    for (let i = 0; i < 30; i += 1) ch.sample(0.1, held("KeyW"));
    expect(ch.value.throttle).toBe(1);
  });

  test("steer is bipolar and centers when released", () => {
    const ch = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 100 });
    ch.sample(0.1, held("KeyD"));
    expect(ch.value.steer).toBeGreaterThan(0);
    ch.sample(0.1, held("KeyA"));
    expect(ch.value.steer).toBeLessThan(0);
    ch.sample(0.1, held());
    expect(ch.value.steer).toBeCloseTo(0, 5);
  });

  test("analog override replaces the digital target (gamepad axis)", () => {
    const ch = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 100 });
    ch.setAnalog("throttle", 0.5);
    ch.sample(0.1, held("KeyW"));
    expect(ch.value.throttle).toBeCloseTo(0.5, 5);
    ch.clearAnalog("throttle");
    ch.sample(0.1, held("KeyW"));
    expect(ch.value.throttle).toBe(1);
  });
});
