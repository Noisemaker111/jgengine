import { describe, expect, test } from "bun:test";

import { brakeFadeShare, brakeTemperatureStep } from "./brakeFade";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "./vehicleDynamics";

describe("brake fade", () => {
  test("a stop from 100 km/h heats the discs by its energy over their heat capacity", () => {
    // 1150 kg from 27.8 m/s: 444 kJ, 90% into 9.6 kJ/K of discs ≈ 42 K with no cooling.
    const energy = 0.5 * 1150 * (100 / 3.6) ** 2;
    const heated = brakeTemperatureStep({ cooling: { rest: 0, perSpeed: 0 } }, 20, energy / 3, 0, 3);
    expect(heated - 20).toBeCloseTo((0.9 * energy) / 9600, 6);
  });

  test("hot discs cool toward ambient, faster at speed", () => {
    const parked = brakeTemperatureStep({}, 500, 0, 0, 60);
    const driving = brakeTemperatureStep({}, 500, 0, 30, 60);
    expect(parked).toBeLessThan(500);
    expect(driving).toBeLessThan(parked);
    expect(driving).toBeGreaterThan(20);
  });

  test("the pad holds to 350 °C, then fades; the dial scales the fade, monotone and never below a tenth", () => {
    expect(brakeFadeShare({}, 300, 1)).toBe(1);
    expect(brakeFadeShare({}, 600, 1)).toBeCloseTo(0.6, 12);
    const shares = [0, 0.2, 1, 2, 4, 40].map((strength) => brakeFadeShare({}, 700, strength));
    expect(shares[0]).toBe(1);
    for (let i = 1; i < shares.length; i += 1) expect(shares[i] ?? 0).toBeLessThanOrEqual(shares[i - 1] ?? 0);
    expect(shares[3] ?? 0).toBeLessThan(shares[2] ?? 0);
    expect(shares[shares.length - 1]).toBe(0.1);
  });

  test("a heavy car stopping again and again from speed stops longer once its discs are hot", () => {
    const truck: VehicleDynamicsTuning = {
      massKg: 18000,
      wheelbase: 5,
      frontWeight: 0.4,
      comHeight: 1.4,
      trackWidth: 2.4,
      front: { peakGrip: 0.8, peakSlipAngle: 0.12, slideGrip: 0.8 },
      driveFront: 0,
      powertrain: { kind: "direct", maxForce: 60000, maxPower: 400000, coastForce: 0 },
      brakeForce: 18000 * 6,
      steering: { maxAngle: 0.5, rate: 4 },
      effects: { brakeFade: { heatCapacity: 30000, cooling: { rest: 10, perSpeed: 3 } } },
    };
    const car = createVehicleDynamics(truck);
    const distances: number[] = [];
    for (let stop = 0; stop < 5; stop += 1) {
      car.restore({ ...car.snapshot(), motion: { ...car.snapshot().motion, vx: 0, vz: 25, yawRate: 0 } });
      const start = car.pose().position[2];
      let step = car.tick(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: 0 });
      for (let i = 0; i < 1200 && step.motion.forwardSpeed > 0.3; i += 1) step = car.tick(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: 0 });
      distances.push(step.motion.position[2] - start);
    }
    for (let i = 1; i < distances.length; i += 1) expect(distances[i] ?? 0).toBeGreaterThanOrEqual((distances[i - 1] ?? 0) - 1e-6);
    expect(distances[distances.length - 1] ?? 0).toBeGreaterThan((distances[0] ?? 0) * 1.15);
    expect(car.tick(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }).brakes.temperature).toBeGreaterThan(350);
  });
});
