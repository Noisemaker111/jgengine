import { describe, expect, test } from "bun:test";

import { Carryable, carrySpeedMultiplier } from "./carryable";
import { PhysicsWorld } from "./physicsWorld";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 20, 20] as const };

function world(): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, gravity: 0, sleepThresholdSteps: 100000 });
}

function frames(w: PhysicsWorld, n: number): void {
  for (let i = 0; i < n; i += 1) w.step(1 / 60);
}

describe("carrySpeedMultiplier", () => {
  test("is unhindered within capacity and slows past it", () => {
    expect(carrySpeedMultiplier(4, 8, 1)).toBe(1);
    expect(carrySpeedMultiplier(16, 8, 1)).toBeCloseTo(0.5, 5);
    expect(carrySpeedMultiplier(16, 8, 2)).toBe(1);
    expect(carrySpeedMultiplier(10, 8, 0)).toBe(0);
  });
});

describe("Carryable", () => {
  test("a held body follows its hold point", () => {
    const w = world();
    const body = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3], mass: 2 });
    const carry = new Carryable(w, body, { maxForce: 1000 });
    carry.grab(1, 0, 5, 0);
    for (let i = 0; i < 240; i += 1) {
      carry.setHoldPoint(1, 3, 5, -2);
      carry.update();
      w.step(1 / 60);
    }
    expect(w.posX[body]!).toBeCloseTo(3, 0);
    expect(w.posZ[body]!).toBeCloseTo(-2, 0);
    expect(carry.held).toBe(true);
  });

  test("two owners pull toward the midpoint of their hold points", () => {
    const w = world();
    const body = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3], mass: 4 });
    const carry = new Carryable(w, body, { maxForce: 1000 });
    carry.grab(1, 0, 5, 0);
    carry.grab(2, 4, 5, 0);
    expect(carry.owners).toBe(2);
    for (let i = 0; i < 240; i += 1) {
      carry.update();
      w.step(1 / 60);
    }
    expect(w.posX[body]!).toBeCloseTo(2, 0);
  });

  test("throw releases the constraint and imparts velocity", () => {
    const w = world();
    const body = w.addBody({ position: [0, 5, 0], halfExtents: [0.3, 0.3, 0.3] });
    const carry = new Carryable(w, body, {});
    carry.grab(1, 0, 5, 0);
    carry.throw(8, 0, 0);
    expect(carry.held).toBe(false);
    expect(w.jointCount).toBe(0);
    expect(w.velX[body]!).toBeCloseTo(8, 5);
    frames(w, 30);
    expect(w.posX[body]!).toBeGreaterThan(1);
  });
});
