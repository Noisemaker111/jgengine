import { describe, expect, test } from "bun:test";

import { PhysicsWorld } from "./physicsWorld";
import { DEFAULT_GRIP_CURVE, createVehicleBody, sampleGripCurve } from "./vehicleBody";
import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";

const BOUNDS = { min: [-60, -20, -60] as const, max: [60, 20, 60] as const };

function world(): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, gravity: -20, linearDamping: 0, cellSize: 8, sleepThresholdSteps: 1e9 });
}

function axis(partial: Partial<AxisInput>): AxisInput {
  return { ...NEUTRAL_AXIS, ...partial };
}

describe("sampleGripCurve", () => {
  test("peaks at low slip and falls off as the tire slides", () => {
    const peak = sampleGripCurve(DEFAULT_GRIP_CURVE, 0.1);
    const slide = sampleGripCurve(DEFAULT_GRIP_CURVE, 0.9);
    expect(peak).toBeGreaterThan(slide);
    expect(peak).toBeCloseTo(1, 5);
  });

  test("grip is symmetric in slip magnitude and clamps past the ends", () => {
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, 0)).toBe(1);
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, -5)).toBe(0.55);
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, 5)).toBe(0.55);
  });
});

describe("VehicleBody suspension", () => {
  test("spring-damper settles the chassis at a stable ride height above the ground", () => {
    const w = world();
    const car = createVehicleBody(w, { position: [0, 1.5, 0], groundHeight: () => 0 });
    for (let i = 0; i < 240; i += 1) {
      car.update(1 / 60, NEUTRAL_AXIS);
      w.step(1 / 60);
    }
    const [, y] = car.position;
    expect(y).toBeGreaterThan(0.3);
    expect(y).toBeLessThan(2.5);
    expect(car.grounded).toBe(true);
  });
});

describe("VehicleBody drive + tire grip response to axis input", () => {
  function settled(): { w: PhysicsWorld; car: ReturnType<typeof createVehicleBody> } {
    const w = world();
    const car = createVehicleBody(w, { position: [0, 2, 0], groundHeight: () => 0 });
    for (let i = 0; i < 200; i += 1) {
      car.update(1 / 60, NEUTRAL_AXIS);
      w.step(1 / 60);
    }
    return { w, car };
  }

  test("throttle accelerates the car forward", () => {
    const { w, car } = settled();
    for (let i = 0; i < 120; i += 1) {
      car.update(1 / 60, axis({ throttle: 1 }));
      w.step(1 / 60);
    }
    expect(car.speed).toBeGreaterThan(4);
  });

  test("steering while moving rotates the heading and grip pulls velocity toward it", () => {
    const { w, car } = settled();
    for (let i = 0; i < 90; i += 1) {
      car.update(1 / 60, axis({ throttle: 1 }));
      w.step(1 / 60);
    }
    const headingBefore = car.heading;
    for (let i = 0; i < 90; i += 1) {
      car.update(1 / 60, axis({ throttle: 1, steer: 1 }));
      w.step(1 / 60);
    }
    expect(car.heading).not.toBeCloseTo(headingBefore, 2);
    const [fx, fz] = car.forward;
    const forwardSpeed = w.velX[car.chassis]! * fx + w.velZ[car.chassis]! * fz;
    const lateral = Math.abs(-w.velX[car.chassis]! * fz + w.velZ[car.chassis]! * fx);
    expect(forwardSpeed).toBeGreaterThan(lateral);
  });

  test("handbrake reduces grip so more lateral velocity survives (drift)", () => {
    function lateralAfterTurn(handbrake: number): number {
      const w = world();
      const car = createVehicleBody(w, { position: [0, 2, 0], groundHeight: () => 0 });
      for (let i = 0; i < 200; i += 1) {
        car.update(1 / 60, NEUTRAL_AXIS);
        w.step(1 / 60);
      }
      for (let i = 0; i < 60; i += 1) {
        car.update(1 / 60, axis({ throttle: 1 }));
        w.step(1 / 60);
      }
      for (let i = 0; i < 40; i += 1) {
        car.update(1 / 60, axis({ throttle: 1, steer: 1, handbrake }));
        w.step(1 / 60);
      }
      const [fx, fz] = car.forward;
      return Math.abs(-w.velX[car.chassis]! * fz + w.velZ[car.chassis]! * fx);
    }
    expect(lateralAfterTurn(1)).toBeGreaterThan(lateralAfterTurn(0));
  });
});
