import { describe, expect, test } from "bun:test";

import { measureHandling } from "./handlingProbe";
import { roadFrictionAt } from "./roadFriction";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "./vehicleDynamics";

const car: VehicleDynamicsTuning = {
  massKg: 1200,
  wheelbase: 2.5,
  frontWeight: 0.55,
  comHeight: 0.5,
  trackWidth: 1.55,
  front: { peakGrip: 1, peakSlipAngle: 0.12, slideGrip: 0.8 },
  driveFront: 0,
  powertrain: { kind: "direct", maxForce: 7000, maxPower: 120000, coastForce: 0 },
  brakeForce: 14000,
  steering: { maxAngle: 0.6, rate: 20 },
};

describe("roadFriction", () => {
  test("one number for the road, one per named surface, and the dial scales the distance from the test track", () => {
    const wet = { friction: 0.6, surfaces: { gravel: 0.7 } };
    expect(roadFrictionAt(wet, undefined, 1)).toBe(0.6);
    expect(roadFrictionAt(wet, "gravel", 1)).toBeCloseTo(0.42, 12);
    expect(roadFrictionAt(wet, "unknown", 1)).toBe(0.6);
    const dialled = [0, 0.2, 1, 2, 4].map((strength) => roadFrictionAt(wet, undefined, strength));
    expect(dialled[0]).toBe(1);
    for (let i = 1; i < dialled.length; i += 1) expect(dialled[i] ?? 0).toBeLessThan(dialled[i - 1] ?? 0);
    expect(dialled[4]).toBe(0.02);
  });

  test("a wet road set to 0.6 corners and stops on 60% of the grip", () => {
    const dry = measureHandling(() => createVehicleDynamics(car));
    const wet = measureHandling(() => createVehicleDynamics({ ...car, effects: { roadFriction: { friction: 0.6 } } }));
    expect(wet.maxLateralG / dry.maxLateralG).toBeCloseTo(0.6, 1);
    const surfaces = measureHandling(() =>
      createVehicleDynamics({ ...car, effects: { roadFriction: { surfaces: { ice: 0.1 } } } }, { surfaceAt: () => "ice" }),
    );
    expect(surfaces.maxLateralG).toBeLessThan(dry.maxLateralG * 0.15);
  });
});
