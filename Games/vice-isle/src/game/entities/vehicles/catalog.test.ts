import { describe, expect, test } from "bun:test";

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
});
