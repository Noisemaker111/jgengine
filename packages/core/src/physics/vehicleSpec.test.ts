import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { createVehicleDynamics } from "./vehicleDynamics";
import { VEHICLE_STYLES, vehicleTuning, type VehicleSpec } from "./vehicleSpec";

const DT = 1 / 60;
const axis = (partial: Partial<AxisInput>): AxisInput => ({ ...NEUTRAL_AXIS, ...partial });
const CAR: VehicleSpec = { ...VEHICLE_STYLES.arcade, topSpeed: 30, accel: 8, brake: 12, turnRate: 1.8 };

function speedAfter(spec: VehicleSpec, seconds: number, options = {}, modifiers = {}): number {
  const car = createVehicleDynamics(vehicleTuning(spec), options);
  let speed = 0;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) speed = car.tick(DT, axis({ throttle: 1 }), modifiers).forwardSpeed;
  return speed;
}

describe("vehicleTuning", () => {
  test("top speed and launch follow the spec", () => {
    expect(speedAfter(CAR, 30)).toBeCloseTo(30, 0);
    expect(speedAfter({ ...CAR, topSpeed: 20 }, 30)).toBeCloseTo(20, 0);
    expect(speedAfter({ ...CAR, accel: 12 }, 1)).toBeGreaterThan(speedAfter(CAR, 1));
  });

  test("a gearbox reports gears and rpm and still reaches top speed", () => {
    const car = createVehicleDynamics(vehicleTuning({ ...CAR, gearbox: { gears: [3.2, 2.1, 1.5, 1.15, 0.95] } }));
    let gear = 0;
    let speed = 0;
    for (let i = 0; i < 40 / DT; i += 1) {
      const step = car.tick(DT, axis({ throttle: 1 }));
      gear = Math.max(gear, step.gear);
      speed = step.forwardSpeed;
      expect(step.rpm).toBeGreaterThan(0);
    }
    expect(gear).toBeGreaterThanOrEqual(4);
    expect(speed).toBeGreaterThan(28);
  });

  test("suspension rides the terrain and can be left off", () => {
    expect(vehicleTuning(CAR).suspension).toBeUndefined();
    const sprung = vehicleTuning({ ...CAR, suspension: 0.5 });
    expect(sprung.suspension?.springRate).toBeGreaterThan(0);
    const softer = vehicleTuning({ ...CAR, suspension: 1 });
    expect(softer.suspension!.springRate).toBeLessThan(sprung.suspension!.springRate);
  });

  test("drift loosens the rear and lets the slide run further before stability steps in", () => {
    const planted = vehicleTuning({ ...CAR, drift: 0 });
    const loose = vehicleTuning({ ...CAR, drift: 1 });
    expect(loose.rear!.peakGrip).toBeLessThan(planted.rear!.peakGrip);
    expect(loose.assists!.maxSideslip!).toBeGreaterThan(planted.assists!.maxSideslip!);
    expect(loose.handbrakeGrip!).toBeLessThan(planted.handbrakeGrip!);
  });
});

describe("vehicleDynamics knobs", () => {
  test("speedLimitScale lifts or lowers the governor for a tick (nitro, a slow zone)", () => {
    expect(speedAfter(CAR, 30, {}, { speedLimitScale: 1.2 })).toBeCloseTo(36, 0);
    expect(speedAfter(CAR, 30, {}, { speedLimitScale: 0.5 })).toBeCloseTo(15, 0);
  });

  test("dragAt slows the car where the ground drags", () => {
    expect(speedAfter(CAR, 10, { dragAt: () => 0.8 })).toBeLessThan(speedAfter(CAR, 10) * 0.6);
  });

  test("a hop without suspension leaves the ground and lands", () => {
    const car = createVehicleDynamics(vehicleTuning({ ...CAR, hop: { speed: 4, gravity: 20 } }));
    for (let i = 0; i < 30; i += 1) car.tick(DT, axis({ throttle: 1 }));
    expect(car.jump()).toBe(true);
    expect(car.jump()).toBe(false);
    let peak = 0;
    let landed = false;
    for (let i = 0; i < 60; i += 1) {
      const step = car.tick(DT, axis({ throttle: 1 }));
      peak = Math.max(peak, step.airOffset);
      if (i > 2 && !step.airborne) landed = true;
    }
    // v²/2g = 0.4 m.
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThan(0.5);
    expect(landed).toBe(true);
    expect(car.jump(6)).toBe(true);
  });

  test("a car without a hop cannot jump", () => {
    expect(createVehicleDynamics(vehicleTuning(CAR)).jump()).toBe(false);
  });

  test("obstacles stop the car at a wall and report the hit once", () => {
    const wall = [{ position: [0, 0, 20] as const, halfExtents: [10, 2, 0.5] as const }];
    const car = createVehicleDynamics(vehicleTuning(CAR), { obstacles: () => wall, bodyRadius: 1 });
    let hits = 0;
    let hardest = 0;
    let z = 0;
    for (let i = 0; i < 300; i += 1) {
      const step = car.tick(DT, axis({ throttle: 1 }));
      z = step.position[2];
      if (step.impact !== null) {
        hits += 1;
        hardest = Math.max(hardest, step.impact.closingSpeed);
      }
    }
    expect(z).toBeLessThan(20 - 0.5 - 0.9);
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(hardest).toBeGreaterThan(8);
    expect(Math.abs(car.velocity()[1])).toBeLessThan(1);
  });

  test("slip reads 0 rolling straight and climbs in a handbrake slide", () => {
    const car = createVehicleDynamics(vehicleTuning(CAR));
    let step = car.tick(DT, axis({ throttle: 1 }));
    for (let i = 0; i < 120; i += 1) step = car.tick(DT, axis({ throttle: 0.6 }));
    expect(step.slip).toBeLessThan(0.1);
    let peak = 0;
    for (let i = 0; i < 40; i += 1) peak = Math.max(peak, car.tick(DT, axis({ steer: 1, handbrake: 1 })).slip);
    expect(peak).toBeGreaterThan(0.6);
  });
});
