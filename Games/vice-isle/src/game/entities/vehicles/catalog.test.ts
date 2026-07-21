import { describe, expect, test } from "bun:test";
import { createKinematicVehicle } from "@jgengine/core/world";

import { VEHICLES, vehicleById } from "./catalog";

/** Gravitational acceleration, m/s² — brake g = brakeForce / (massKg · g). */
const GRAVITY = 9.81;

const groundCars = VEHICLES.filter((v) => v.dynamics.type === "ground");

function chassisOf(id: string) {
  const def = vehicleById(id);
  if (def === undefined || def.dynamics.type !== "ground") throw new Error(`${id} is not a ground vehicle`);
  const chassis = def.dynamics.tuning.chassis;
  if (chassis === undefined) throw new Error(`${id} has no chassis`);
  return chassis;
}

function turningRadius(id: string): number {
  const def = vehicleById(id);
  if (def === undefined || def.dynamics.type !== "ground") throw new Error(`${id} is not a ground vehicle`);
  const steering = def.dynamics.tuning.steering;
  if (steering === undefined) throw new Error(`${id} has no steering`);
  // Bicycle-model minimum turning radius at full lock: wheelbase / tan(maxAngle).
  return steering.wheelbase / Math.tan(steering.maxAngle);
}

describe("vice-isle vehicle catalog (#1051)", () => {
  test("every ground vehicle drives on a mass-and-force chassis", () => {
    expect(groundCars.length).toBeGreaterThanOrEqual(6);
    for (const car of groundCars) {
      if (car.dynamics.type !== "ground") continue;
      expect(car.dynamics.tuning.chassis, `${car.id} chassis`).toBeDefined();
      expect(car.collisionRadius).toBeGreaterThan(0);
    }
  });

  test("aircraft stay off the chassis model", () => {
    for (const air of VEHICLES.filter((v) => v.dynamics.type === "aircraft")) {
      expect(air.dynamics.type).toBe("aircraft");
    }
  });

  test("mass orders bus > suv > cop > muscle > sport > compact", () => {
    const order = ["car_bus", "car_suv", "car_cop", "car_muscle", "car_sport", "car_compact"];
    const masses = order.map((id) => chassisOf(id).massKg);
    for (let i = 0; i < masses.length - 1; i += 1) {
      expect(masses[i]!, `${order[i]} heavier than ${order[i + 1]}`).toBeGreaterThan(masses[i + 1]!);
    }
  });

  test("service-brake deceleration stays in a plausible 0.35–1.3 g band", () => {
    for (const car of groundCars) {
      if (car.dynamics.type !== "ground") continue;
      const chassis = car.dynamics.tuning.chassis!;
      const brakeG = chassis.brakeForce / (chassis.massKg * GRAVITY);
      expect(brakeG, `${car.id} brake g`).toBeGreaterThanOrEqual(0.35);
      expect(brakeG, `${car.id} brake g`).toBeLessThanOrEqual(1.3);
    }
  });

  test("the bus has more than triple the compact's turning circle", () => {
    expect(turningRadius("car_bus")).toBeGreaterThan(turningRadius("car_compact") * 3);
  });

  test("lifting off the throttle scrubs speed instead of gliding forever", () => {
    // Regression guard: coasting (no throttle, no brake) from ~30 km/h must fall below 10 km/h
    // within 4 s for every ground car — the old floaty ~22 s glide was the "feels the same" bug.
    const dt = 1 / 60;
    for (const car of groundCars) {
      if (car.dynamics.type !== "ground") continue;
      const vehicle = createKinematicVehicle(car.dynamics.tuning, { position: [0, 0, 0], heading: 0 });
      for (let i = 0; i < 3000; i += 1) {
        const step = vehicle.tick(dt, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
        if (Math.abs(step.forwardSpeed) * 3.6 >= 30) break;
      }
      let coastMs = 0;
      let kmh = 30;
      for (let i = 0; i < 4 * 60; i += 1) {
        const step = vehicle.tick(dt, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
        kmh = Math.abs(step.forwardSpeed) * 3.6;
        coastMs += dt;
        if (kmh <= 10) break;
      }
      expect(kmh, `${car.id} still coasting at ${kmh.toFixed(1)} km/h after ${coastMs.toFixed(1)}s`).toBeLessThanOrEqual(10);
    }
  });

  test("street cars hit a midsize-feel launch band after 2 s full throttle (#1515)", () => {
    // Compact / cruiser / SUV should feel like ~22–30 mph by 2 s; bus stays deliberately slower.
    const dt = 1 / 60;
    const targets: Record<string, { min: number; max: number }> = {
      car_compact: { min: 9, max: 16 },
      car_cop: { min: 10, max: 16 },
      car_suv: { min: 9, max: 15 },
      car_muscle: { min: 11, max: 20 },
      car_sport: { min: 11, max: 20 },
      car_bus: { min: 4, max: 10 },
    };
    for (const [id, band] of Object.entries(targets)) {
      const def = vehicleById(id);
      if (def === undefined || def.dynamics.type !== "ground") throw new Error(id);
      const vehicle = createKinematicVehicle(def.dynamics.tuning);
      let step = vehicle.tick(dt, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      for (let i = 1; i < 120; i += 1) step = vehicle.tick(dt, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      expect(step.forwardSpeed, `${id} 2s launch ${step.forwardSpeed.toFixed(2)} m/s`).toBeGreaterThanOrEqual(band.min);
      expect(step.forwardSpeed, `${id} 2s launch ${step.forwardSpeed.toFixed(2)} m/s`).toBeLessThanOrEqual(band.max);
    }
  });

  test("reverse after 2 s stays crawl-useful, not a second highway gear (#1515)", () => {
    const dt = 1 / 60;
    for (const car of groundCars) {
      if (car.dynamics.type !== "ground") continue;
      const vehicle = createKinematicVehicle(car.dynamics.tuning);
      let step = vehicle.tick(dt, { throttle: 0, brake: 1, steer: 0, handbrake: 0 });
      for (let i = 1; i < 120; i += 1) step = vehicle.tick(dt, { throttle: 0, brake: 1, steer: 0, handbrake: 0 });
      // Bus is intentionally sluggish; everything else should reverse with intent by 2 s.
      const minReverse = car.id === "car_bus" ? -1.5 : -3;
      expect(step.forwardSpeed, `${car.id} reverse`).toBeLessThan(minReverse);
      // Cap near reverseSpeed (~0.18× top) — never rocket reverse.
      expect(step.forwardSpeed, `${car.id} reverse`).toBeGreaterThan(-(car.dynamics.tuning.reverseSpeed + 0.6));
    }
  });
});
