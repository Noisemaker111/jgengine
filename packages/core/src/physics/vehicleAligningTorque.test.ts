import { describe, expect, test } from "bun:test";

import { aligningSteer, ROAD_CAR_STEERING_COMPLIANCE } from "./vehicleAligningTorque";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "./vehicleDynamics";

describe("aligningSteer", () => {
  test("compliance × (pneumatic + caster trail) × force, scaled by strength, zero with no force", () => {
    const one = aligningSteer({}, undefined, 3000, 2600, 0.02, 5000, 1);
    expect(one).toBeGreaterThan(0);
    // About 3.6 cm of trail on 5 kN through 0.4°/100 N·m: about 0.7° of road wheel.
    expect((one * 180) / Math.PI).toBeGreaterThan(0.4);
    expect((one * 180) / Math.PI).toBeLessThan(1);
    expect(aligningSteer({}, undefined, 3000, 2600, 0.02, 5000, 2)).toBeCloseTo(2 * one, 12);
    expect(aligningSteer({}, undefined, 3000, 2600, 0.02, -5000, 1)).toBeCloseTo(-one, 12);
    expect(aligningSteer({}, undefined, 3000, 2600, 0.02, 0, 1)).toBe(0);
    expect(aligningSteer({ compliance: 2 * ROAD_CAR_STEERING_COMPLIANCE }, undefined, 3000, 2600, 0.02, 5000, 1)).toBeCloseTo(2 * one, 12);
  });

  test("the pneumatic trail collapses toward the peak and reverses past it; the caster trail still aligns", () => {
    const pneumatic = (slip: number) => aligningSteer({ casterTrail: 0 }, undefined, 3000, 2600, slip, 5000, 1);
    expect(pneumatic(0.1)).toBeLessThan(pneumatic(0.02) * 0.3);
    expect(pneumatic(0.3)).toBeLessThan(0);
    expect(aligningSteer({ casterTrail: 0.016 }, undefined, 3000, 2600, 0.4, 5000, 1)).toBeGreaterThan(0);
  });
});

describe("aligningTorque effect", () => {
  const car: VehicleDynamicsTuning = {
    massKg: 1150,
    wheelbase: 2.3,
    frontWeight: 0.5,
    comHeight: 0.45,
    trackWidth: 1.5,
    front: { peakGrip: 0.93, peakSlipAngle: 0.15, slideGrip: 0.87, corneringStiffness: 15.3 },
    driveFront: 0,
    powertrain: { kind: "direct", maxForce: 6000, maxPower: 90000, coastForce: 0 },
    brakeForce: 12000,
    steering: { maxAngle: 0.5, rate: 6 },
    effects: { lateralLoadTransfer: {} },
  };
  const yaw = (tuning: VehicleDynamicsTuning) => {
    const dynamics = createVehicleDynamics(tuning);
    dynamics.restore({ ...dynamics.snapshot(), motion: { ...dynamics.snapshot().motion, vz: 20 } });
    let step = dynamics.tick(1 / 60, { throttle: 0.3, brake: 0, steer: 0.08, handbrake: 0 });
    for (let i = 0; i < 300; i += 1) step = dynamics.tick(1 / 60, { throttle: 0.3, brake: 0, steer: 0.08, handbrake: 0 });
    return { yaw: Math.abs(step.motion.yawRate), give: step.steering.steerAngle - step.steering.roadWheelAngle };
  };

  test("the wheels give way to the aligning torque: less yaw at the same rack, more with the dial up", () => {
    const plain = yaw(car);
    const one = yaw({ ...car, effects: { ...car.effects, aligningTorque: {} } });
    const four = yaw({ ...car, effects: { ...car.effects, aligningTorque: { strength: 4 } } });
    expect(one.yaw).toBeLessThan(plain.yaw);
    expect(four.yaw).toBeLessThan(one.yaw);
    expect(Math.abs(four.give)).toBeGreaterThan(Math.abs(one.give) * 2);
    expect(yaw({ ...car, effects: { ...car.effects, aligningTorque: { strength: 0 } } }).yaw).toBe(plain.yaw);
  });
});
