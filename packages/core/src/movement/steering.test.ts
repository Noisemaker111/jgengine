import { describe, expect, it } from "bun:test";

import { approachYaw, steerToward, steerYaw, yawForward, yawRight } from "./steering";

function wrappedError(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

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

describe("approachYaw", () => {
  it("rotates by at most turnRate * dt when the target is far", () => {
    expect(approachYaw(0, 1, 2, 0.1)).toBeCloseTo(0.2);
    expect(approachYaw(0, -1, 2, 0.1)).toBeCloseTo(-0.2);
  });

  it("snaps exactly onto the target once within a single step (no overshoot)", () => {
    expect(approachYaw(0, 0.05, 10, 0.01)).toBe(0.05);
    expect(approachYaw(1.2, 1.2, 5, 0.1)).toBe(1.2);
  });

  it("a large rate reaches the target in one call, matching an instant snap", () => {
    expect(approachYaw(0, 1.5, 1000, 1 / 60)).toBe(1.5);
    expect(approachYaw(-2, 2.7, 1e6, 1 / 60)).toBe(2.7);
  });

  it("turns along the shortest arc across the ±π seam", () => {
    const stepped = approachYaw(3.0, -3.0, 10, 0.01);
    expect(stepped).toBeGreaterThan(3.0);
    expect(Math.abs(wrappedError(stepped, -3.0))).toBeLessThan(Math.abs(wrappedError(3.0, -3.0)));
  });

  it("converges on the target from any start without overshoot", () => {
    for (const [from, to] of [
      [0, Math.PI / 2],
      [Math.PI / 2, 0],
      [3, -3],
      [-0.2, Math.PI],
    ] as const) {
      let yaw = from;
      for (let i = 0; i < 400; i += 1) yaw = approachYaw(yaw, to, 2, 1 / 60);
      expect(Math.abs(wrappedError(yaw, to))).toBeLessThan(1e-9);
    }
  });
});
