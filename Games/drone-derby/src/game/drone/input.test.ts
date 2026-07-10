import { describe, expect, test } from "bun:test";

import { NEUTRAL_DRONE_AXES, sampleDroneInput } from "./input";

const DT = 1 / 60;

function down(...actions: readonly string[]) {
  return (action: string) => actions.includes(action);
}

describe("sampleDroneInput", () => {
  test("ramps throttle toward the held direction over several frames", () => {
    let axes = NEUTRAL_DRONE_AXES;
    for (let i = 0; i < 30; i += 1) axes = sampleDroneInput(down("throttleUp"), axes, DT, null);
    expect(axes.throttle).toBeGreaterThan(0.5);
  });

  test("opposing keys cancel out to a neutral target", () => {
    let axes = NEUTRAL_DRONE_AXES;
    for (let i = 0; i < 30; i += 1) axes = sampleDroneInput(down("throttleUp", "throttleDown"), axes, DT, null);
    expect(axes.throttle).toBeCloseTo(0, 5);
  });

  test("releasing keys ramps the axis back to neutral", () => {
    let axes = NEUTRAL_DRONE_AXES;
    for (let i = 0; i < 30; i += 1) axes = sampleDroneInput(down("yawRight"), axes, DT, null);
    expect(axes.yaw).toBeGreaterThan(0.5);
    for (let i = 0; i < 30; i += 1) axes = sampleDroneInput(down(), axes, DT, null);
    expect(axes.yaw).toBeCloseTo(0, 5);
  });

  test("pointer tilt overrides the digital pitch/strafe keys", () => {
    let axes = NEUTRAL_DRONE_AXES;
    for (let i = 0; i < 30; i += 1) axes = sampleDroneInput(down("pitchBack"), axes, DT, { pitch: 1, strafe: -1 });
    expect(axes.pitch).toBeGreaterThan(0.5);
    expect(axes.strafe).toBeLessThan(-0.5);
  });

  test("boost is a direct digital passthrough", () => {
    const axes = sampleDroneInput(down("boost"), NEUTRAL_DRONE_AXES, DT, null);
    expect(axes.boost).toBe(true);
    const released = sampleDroneInput(down(), axes, DT, null);
    expect(released.boost).toBe(false);
  });
});
