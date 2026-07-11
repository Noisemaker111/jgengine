import { describe, expect, it } from "bun:test";

import { steerToward, steerYaw, yawForward, yawRight } from "./steering";

function dot(a: readonly [number, number], b: readonly [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

describe("yaw steering", () => {
  it("keeps yawRight perpendicular to yawForward on the screen-right side", () => {
    for (const yaw of [0, Math.PI / 3, Math.PI, -Math.PI / 4, 5]) {
      const forward = yawForward(yaw);
      const right = yawRight(yaw);
      expect(dot(forward, right)).toBeCloseTo(0);
      const slightlyRight = yawForward(steerYaw(yaw, 1, 0.2, 1));
      expect(dot(slightlyRight, right)).toBeGreaterThan(0);
    }
  });

  it("turns toward screen-right for a positive steer input", () => {
    const yaw = 0;
    const turned = steerYaw(yaw, 1, Math.PI / 2, 1);
    const forward = yawForward(turned);
    expect(forward[0]).toBeCloseTo(-1);
    expect(forward[1]).toBeCloseTo(0);
  });

  it("holds yaw at neutral steer and scales with dt", () => {
    expect(steerYaw(1.2, 0, 3, 0.016)).toBeCloseTo(1.2);
    expect(steerYaw(0, -1, 2, 0.5)).toBeCloseTo(1);
  });

  it("steerToward integrated through steerYaw converges on the desired yaw", () => {
    for (const [from, to] of [
      [0, Math.PI / 2],
      [Math.PI / 2, 0],
      [3, -3],
      [-0.2, Math.PI],
    ] as const) {
      let yaw = from;
      for (let i = 0; i < 300; i += 1) {
        const steer = Math.max(-1, Math.min(1, steerToward(yaw, to) * 4));
        yaw = steerYaw(yaw, steer, 2, 1 / 60);
      }
      const error = Math.atan2(Math.sin(to - yaw), Math.cos(to - yaw));
      expect(Math.abs(error)).toBeLessThan(0.01);
    }
  });
});
