import { describe, expect, test } from "bun:test";

import { analogAxes, createAxisShaper, shapeAxisValue } from "./axisShaper";

const DT = 1 / 60;

function steerShaper() {
  return createAxisShaper({
    axes: {
      steer: {
        digital: { riseRate: 4, returnRate: 8 },
        analog: { deadzone: 0.1, curve: 2 },
      },
      throttle: { range: { min: 0, max: 1 }, digital: { riseRate: 5, fallRate: 10 } },
    },
  });
}

describe("shapeAxisValue", () => {
  test("drops the deadzone and rescales the rest so output still spans 0..1", () => {
    const profile = { deadzone: 0.2 };
    expect(shapeAxisValue(0.15, profile)).toBe(0);
    expect(shapeAxisValue(0.6, profile)).toBeCloseTo(0.5, 6);
    expect(shapeAxisValue(-1, profile)).toBe(-1);
  });

  test("a curve gives finer control near centre and saturation reaches full early", () => {
    expect(shapeAxisValue(0.5, { curve: 2 })).toBeCloseTo(0.25, 6);
    expect(shapeAxisValue(0.9, { saturation: 0.9 })).toBe(1);
  });
});

describe("createAxisShaper", () => {
  test("a held key ramps in at the rise rate and snaps back at the return rate", () => {
    const shaper = steerShaper();
    let out = shaper.shape(DT, { steer: 1, throttle: 0 });
    expect(out.steer).toBeCloseTo(4 * DT, 6);
    for (let i = 0; i < 14; i += 1) out = shaper.shape(DT, { steer: 1, throttle: 0 });
    expect(out.steer).toBeCloseTo(1, 6);
    let released = 0;
    for (; out.steer > 0; released += 1) out = shaper.shape(DT, { steer: 0, throttle: 0 });
    expect(released).toBe(8);
  });

  test("a stick passes straight through its deadzone and curve with no lag", () => {
    const shaper = steerShaper();
    const out = shaper.shape(DT, { steer: 0.55, throttle: 0 }, { analog: { steer: true } });
    expect(out.steer).toBeCloseTo(0.25, 6);
    expect(shaper.shape(DT, { steer: 0.05, throttle: 0 }, { analog: new Set(["steer"]) }).steer).toBe(0);
  });

  test("reversing a key returns through centre before building the other way", () => {
    const shaper = steerShaper();
    for (let i = 0; i < 30; i += 1) shaper.shape(DT, { steer: 1, throttle: 0 });
    const out = shaper.shape(DT, { steer: -1, throttle: 0 });
    expect(out.steer).toBeCloseTo(1 - 8 * DT, 6);
    let ticks = 1;
    let value = out.steer;
    while (value > -0.99 && ticks < 200) {
      value = shaper.shape(DT, { steer: -1, throttle: 0 }).steer;
      ticks += 1;
    }
    expect(ticks * DT).toBeCloseTo(1 / 8 + 1 / 4, 1);
  });

  test("pedals clamp to their range and scale follows the signal", () => {
    const shaper = createAxisShaper({
      axes: { steer: { scale: (speed) => 1 / (1 + speed / 20) } },
    });
    expect(shaper.shape(DT, { steer: 1 }, { signal: 20 }).steer).toBeCloseTo(0.5, 6);
    const pedals = steerShaper();
    for (let i = 0; i < 60; i += 1) pedals.shape(DT, { steer: 0, throttle: 2 });
    expect(pedals.value().throttle).toBe(1);
  });

  test("snapshot/restore resumes the same output, retune keeps it", () => {
    const shaper = steerShaper();
    for (let i = 0; i < 5; i += 1) shaper.shape(DT, { steer: 1, throttle: 1 });
    const saved = shaper.snapshot();
    const replica = steerShaper();
    replica.restore(saved);
    expect(replica.shape(DT, { steer: 1, throttle: 1 })).toEqual(shaper.shape(DT, { steer: 1, throttle: 1 }));
    const before = shaper.snapshot();
    shaper.retune({ axes: { steer: { digital: { riseRate: 1 } }, throttle: { range: { min: 0, max: 1 } } } });
    expect(shaper.snapshot()).toEqual(before);
    shaper.reset();
    expect(shaper.value()).toEqual({ steer: 0, throttle: 0 });
  });
});

describe("analogAxes", () => {
  test("marks an axis analog when any of its bound actions published a magnitude", () => {
    const bindings = { steer: { positive: ["steerRight"], negative: ["steerLeft"] }, throttle: { positive: ["throttle"] } };
    expect([...analogAxes(bindings, { steerLeft: 0.4 })]).toEqual(["steer"]);
    expect(analogAxes(bindings, null).size).toBe(0);
  });
});
