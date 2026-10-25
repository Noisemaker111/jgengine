import { describe, expect, test } from "bun:test";
import { createRigidAircraft, type RigidAircraftTuning } from "@jgengine/core/world";
import { measureFlight } from "@jgengine/core/physics/handlingProbe";

import { vehicleById } from "./catalog";

function aircraft(id: string) {
  const def = vehicleById(id);
  if (def?.dynamics.type !== "aircraft") throw new Error(`${id} is not an aircraft`);
  return def.dynamics;
}

function wings(id: string) {
  const air = aircraft(id);
  return measureFlight((spawn) => createRigidAircraft(air.tuning, spawn), { cruiseSpeed: air.topSpeed * 0.6 });
}

/** Hands-off over the ground the way the game flies a rotor: rotor at full speed, collective on the throttle keys. */
function hoverDrift(tuning: RigidAircraftTuning, collective: number): { drift: number; climb: number } {
  const sim = createRigidAircraft(tuning, { position: [0, 60, 0] });
  for (let i = 0; i < 240; i += 1) sim.tick(1 / 60, { throttle: 1, collective, pitch: 0, roll: 0, yaw: 0 }, { thrustScale: 0 });
  const start = sim.snapshot();
  let step = sim.tick(1 / 60, { throttle: 1, collective, pitch: 0, roll: 0, yaw: 0 }, { thrustScale: 0 });
  for (let i = 0; i < 600; i += 1) step = sim.tick(1 / 60, { throttle: 1, collective, pitch: 0, roll: 0, yaw: 0 }, { thrustScale: 0 });
  return { drift: Math.hypot(step.position[0] - start.x, step.position[2] - start.z), climb: step.position[1] - start.y };
}

describe("Harbor Heat aircraft fly like their brief", () => {
  test("the trainer is the easy plane: low stall, gentle roll", () => {
    const report = wings("air_trainer");
    expect(report.stallSpeed).toBeLessThan(25);
    expect(report.rollRateDeg).toBeGreaterThan(80);
    expect(report.rollRateDeg).toBeLessThan(220);
    expect(report.climbRate).toBeGreaterThan(5);
  });

  test("the prop plane is quicker and still lands slow", () => {
    const report = wings("air_prop");
    expect(report.stallSpeed).toBeLessThan(30);
    expect(report.rollRateDeg).toBeGreaterThan(wings("air_trainer").rollRateDeg);
  });

  test("the jet climbs hard and rolls fast but needs speed to fly", () => {
    const report = wings("air_jet");
    expect(report.stallSpeed).toBeGreaterThan(30);
    expect(report.stallSpeed).toBeLessThan(45);
    expect(report.rollRateDeg).toBeGreaterThan(200);
    expect(report.rollRateDeg).toBeLessThan(420);
    expect(report.climbRate).toBeGreaterThan(30);
  });

  test("the helicopter hovers hands-off and climbs on collective", () => {
    const air = aircraft("air_helicopter");
    const report = measureFlight((spawn) => createRigidAircraft(air.tuning, spawn), { cruiseSpeed: 0 });
    expect(report.hoverDriftMeters).toBeLessThan(8);
    expect(report.climbRate).toBeGreaterThan(4);
    expect(hoverDrift(air.tuning, 0.9).climb).toBeGreaterThan(5);
  });

  test("the jump jet holds a hover on its lift rotors", () => {
    const air = aircraft("air_vtol");
    const held = hoverDrift(air.tuning, 1 / 1.7);
    expect(held.drift).toBeLessThan(15);
    expect(hoverDrift(air.tuning, 0.9).climb).toBeGreaterThan(5);
  });
});
