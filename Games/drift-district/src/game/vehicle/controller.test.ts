import { describe, expect, test } from "bun:test";

import { createVehicleController } from "./controller";

const SPAWN = { position: [0, 0.15, 0] as const, heading: 0 };

describe("vehicle controller", () => {
  test("accelerates forward under throttle", () => {
    const vehicle = createVehicleController(SPAWN);
    let pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    for (let i = 0; i < 60; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    expect(pose.position[2]).toBeGreaterThan(0);
    expect(pose.speedKmh).toBeGreaterThan(0);
  });

  test("holding handbrake and steer while moving triggers a drift and charges the meter", () => {
    const vehicle = createVehicleController(SPAWN);
    for (let i = 0; i < 90; i += 1) vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    let pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 1 }, false);
    for (let i = 0; i < 60; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 1 }, false);
    expect(pose.drifting).toBe(true);
    expect(pose.driftMeter.charge).toBeGreaterThan(0);
  });

  test("driving straight never registers a drift", () => {
    const vehicle = createVehicleController(SPAWN);
    let pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 1 }, false);
    for (let i = 0; i < 90; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 1 }, false);
    expect(pose.drifting).toBe(false);
    expect(pose.driftMeter.charge).toBe(0);
  });

  test("boosting consumes drift meter charge and boosts speed", () => {
    const vehicle = createVehicleController(SPAWN);
    for (let i = 0; i < 90; i += 1) vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    let pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 1 }, false);
    for (let i = 0; i < 90; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 1 }, false);
    const chargedMeter = pose.driftMeter.charge;
    expect(chargedMeter).toBeGreaterThan(0);

    pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, true);
    expect(pose.driftMeter.boosting).toBe(true);
    for (let i = 0; i < 10; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    expect(pose.driftMeter.charge).toBeLessThan(chargedMeter);
  });

  test("steering right turns the car toward screen-right", () => {
    const vehicle = createVehicleController(SPAWN);
    for (let i = 0; i < 60; i += 1) vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    let pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 0 }, false);
    for (let i = 0; i < 60; i += 1) pose = vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 0 }, false);
    expect(pose.heading).toBeLessThan(0);
    expect(pose.position[0]).toBeLessThan(0);
  });

  test("resetTo restores position, heading, and clears the drift meter", () => {
    const vehicle = createVehicleController(SPAWN);
    for (let i = 0; i < 60; i += 1) vehicle.tick(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 1 }, false);
    vehicle.resetTo([5, 0.15, 5], Math.PI / 2);
    const pose = vehicle.tick(0, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    expect(pose.position[0]).toBeCloseTo(5, 5);
    expect(pose.position[2]).toBeCloseTo(5, 5);
    expect(pose.heading).toBeCloseTo(Math.PI / 2, 5);
    expect(pose.driftMeter.charge).toBe(0);
    expect(pose.speedKmh).toBe(0);
  });
});
