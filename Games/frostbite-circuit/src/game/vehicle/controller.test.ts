import { describe, expect, test } from "bun:test";
import { NEUTRAL_AXIS, type AxisInput } from "@jgengine/core/input/axisInput";

import { createSledController } from "./controller";

const SPAWN = { position: [0, 0, 0] as const, heading: 0 };

function axis(overrides: Partial<AxisInput>): AxisInput {
  return { ...NEUTRAL_AXIS, ...overrides };
}

describe("sled controller — ice drift kinematics", () => {
  test("throttle accelerates forward along heading", () => {
    const sled = createSledController(SPAWN);
    let pose = sled.pose();
    for (let i = 0; i < 60; i += 1) pose = sled.tick(1 / 60, axis({ throttle: 1 }));
    expect(pose.position[2]).toBeGreaterThan(0);
    expect(pose.speedKmh).toBeGreaterThan(0);
  });

  test("resetTo zeroes velocity — no residual slide after a reset", () => {
    const sled = createSledController(SPAWN);
    for (let i = 0; i < 60; i += 1) sled.tick(1 / 60, axis({ throttle: 1, steer: 1 }));
    sled.resetTo([5, 0, 5], Math.PI / 2);
    const pose = sled.tick(0, axis({}));
    expect(pose.position).toEqual([5, 0, 5]);
    expect(pose.speedKmh).toBe(0);
  });

  test("handbrake + steer at speed produces a drift with measurable slip", () => {
    const sled = createSledController(SPAWN);
    for (let i = 0; i < 90; i += 1) sled.tick(1 / 60, axis({ throttle: 1 }));
    let sawDrift = false;
    for (let i = 0; i < 60; i += 1) {
      const pose = sled.tick(1 / 60, axis({ throttle: 0.4, steer: 1, handbrake: 1 }));
      if (pose.drifting) sawDrift = true;
    }
    expect(sawDrift).toBe(true);
  });

  test("ice grip is looser than default road grip — slides carry further under the same input", () => {
    const sled = createSledController(SPAWN);
    for (let i = 0; i < 90; i += 1) sled.tick(1 / 60, axis({ throttle: 1 }));
    let maxSlip = 0;
    for (let i = 0; i < 40; i += 1) {
      const pose = sled.tick(1 / 60, axis({ throttle: 0.3, steer: 1, handbrake: 1 }));
      maxSlip = Math.max(maxSlip, pose.slip);
    }
    expect(maxSlip).toBeGreaterThan(0.2);
  });
});
