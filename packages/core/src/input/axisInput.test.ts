import { describe, expect, test } from "bun:test";

import {
  AxisChannel,
  DRIVE_AXIS_BINDINGS,
  clampAxis,
  createAxisChannel,
  rampToward,
  sampleAxisBindings,
} from "./axisInput";

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

  test("a pointer-bound axis steers from the pointer and falls back to keys without one", () => {
    const bindings = {
      ...DRIVE_AXIS_BINDINGS,
      steer: { ...DRIVE_AXIS_BINDINGS.steer, pointer: { source: "x" as const } },
    };
    const ch = new AxisChannel({ bindings, smoothing: 100 });
    ch.sample(0.1, held(), { x: 0.6, y: 0, active: true });
    expect(ch.value.steer).toBeCloseTo(0.6, 5);
    ch.sample(0.1, held("KeyA"), { x: 0.6, y: 0, active: true });
    expect(ch.value.steer).toBeCloseTo(0.6, 5);
    ch.sample(0.1, held("KeyA"), null);
    expect(ch.value.steer).toBe(-1);
    ch.sample(0.1, held("KeyA"), { x: 0.6, y: 0, active: false });
    expect(ch.value.steer).toBe(-1);
  });

  test("setAnalog still outranks a pointer-bound axis", () => {
    const bindings = {
      ...DRIVE_AXIS_BINDINGS,
      steer: { ...DRIVE_AXIS_BINDINGS.steer, pointer: { source: "x" as const } },
    };
    const ch = new AxisChannel({ bindings, smoothing: 100 });
    ch.setAnalog("steer", -0.3);
    ch.sample(0.1, held(), { x: 0.9, y: 0, active: true });
    expect(ch.value.steer).toBeCloseTo(-0.3, 5);
  });
});

const DRONE_BINDINGS = {
  pitch: { positive: ["KeyW"], negative: ["KeyS"] },
  lift: { positive: ["Space"] },
};

describe("createAxisChannel (custom axis schema)", () => {
  test("digital keys ramp analog values, same pedal feel as AxisChannel", () => {
    const ch = createAxisChannel({ bindings: DRONE_BINDINGS, ranges: { lift: { min: 0, max: 1 } }, smoothing: 4 });
    const first = ch.sample(0.1, held("KeyW"));
    expect(first.pitch).toBeGreaterThan(0);
    expect(first.pitch).toBeLessThan(1);
    for (let i = 0; i < 30; i += 1) ch.sample(0.1, held("KeyW"));
    expect(ch.value.pitch).toBe(1);
  });

  test("unlisted axes default to a bipolar range; explicit ranges clamp to their own bounds", () => {
    const ch = createAxisChannel({ bindings: DRONE_BINDINGS, ranges: { lift: { min: 0, max: 1 } }, smoothing: 100 });
    ch.sample(0.1, held("KeyS"));
    expect(ch.value.pitch).toBe(-1);
    ch.setAnalog("lift", 5);
    ch.sample(0.1, held());
    expect(ch.value.lift).toBe(1);
    ch.setAnalog("lift", -5);
    ch.sample(0.1, held());
    expect(ch.value.lift).toBe(0);
  });

  test("setAnalog overrides the digital target", () => {
    const ch = createAxisChannel({ bindings: DRONE_BINDINGS, ranges: { lift: { min: 0, max: 1 } }, smoothing: 100 });
    ch.setAnalog("pitch", 0.4);
    ch.sample(0.1, held("KeyW"));
    expect(ch.value.pitch).toBeCloseTo(0.4, 5);
    ch.clearAnalog("pitch");
    ch.sample(0.1, held("KeyW"));
    expect(ch.value.pitch).toBe(1);
  });

  test("a pointer-bound axis steers from the pointer and falls back to keys without one", () => {
    const bindings = {
      ...DRONE_BINDINGS,
      pitch: { ...DRONE_BINDINGS.pitch, pointer: { source: "y" as const } },
    };
    const ch = createAxisChannel({ bindings, ranges: { lift: { min: 0, max: 1 } }, smoothing: 100 });
    ch.sample(0.1, held(), { x: 0, y: 0.5, active: true });
    expect(ch.value.pitch).toBeCloseTo(0.5, 5);
    ch.sample(0.1, held(), null);
    expect(ch.value.pitch).toBe(0);
  });

  test("reset zeroes every axis", () => {
    const ch = createAxisChannel({ bindings: DRONE_BINDINGS, ranges: { lift: { min: 0, max: 1 } }, smoothing: 100 });
    ch.sample(0.1, held("KeyW", "Space"));
    expect(ch.value.pitch).toBeGreaterThan(0);
    expect(ch.value.lift).toBeGreaterThan(0);
    ch.reset();
    expect(ch.value).toEqual({ pitch: 0, lift: 0 });
  });
});

describe("sampleAxisBindings", () => {
  test("reads positive-minus-negative held state per axis", () => {
    const held = new Set(["KeyW", "KeyA"]);
    const axes = sampleAxisBindings(DRIVE_AXIS_BINDINGS, (code) => held.has(code));
    expect(axes.throttle).toBe(1);
    expect(axes.brake).toBe(0);
    expect(axes.steer).toBe(-1);
    expect(axes.handbrake).toBe(0);
  });

  test("clamps each axis to its supplied range", () => {
    const axes = sampleAxisBindings(
      { pedal: { positive: ["KeyW"] } },
      (code) => code === "KeyW",
      null,
      { pedal: { min: 0, max: 1 } },
    );
    expect(axes.pedal).toBe(1);
  });
});
