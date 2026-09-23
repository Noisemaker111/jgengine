import { describe, expect, test } from "bun:test";

import { createVehicleBackendLink } from "@jgengine/core/physics/vehicleBackendLink";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "@jgengine/core/physics/vehicleDynamics";
import { createRapierBackend } from "./rapierBackend";

const DT = 1 / 60;
const car: VehicleDynamicsTuning = {
  massKg: 1400,
  wheelbase: 2.6,
  frontWeight: 0.53,
  comHeight: 0.5,
  trackWidth: 1.6,
  front: { peakGrip: 1.1, peakSlipAngle: 0.12, slideGrip: 0.8 },
  driveFront: 0,
  powertrain: { kind: "direct", maxForce: 9000, maxPower: 150000 },
  brakeForce: 15000,
  steering: { maxAngle: 0.6, highSpeedAngle: 0.15, highSpeedAt: 30, rate: 3, selfAlign: 0.3 },
  assists: { abs: 1, tractionControl: 0.6, stability: 0.5 },
};
const full = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };

describe("createVehicleBackendLink on Rapier", () => {
  test("a wall stops the car and the rotating chassis shoves a crate", async () => {
    const backend = await createRapierBackend();
    backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
    backend.addBody({ shape: { kind: "box", halfExtents: [10, 2, 0.5] }, position: [0, 2, 40], kind: "static" });
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 0.5, 12], mass: 20, layers: 2 });
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.7, 2.1], blockMask: 1 });
    const sim = createVehicleDynamics(car, { clampMove: link.clampMove });
    for (let i = 0; i < 420; i += 1) {
      link.sync(sim.tick(DT, full));
      backend.step(DT);
    }
    const front = sim.pose().position[2] + 2.1;
    expect(front).toBeLessThan(39.6);
    expect(front).toBeGreaterThan(39);
    const crateState = backend.body(crate)!;
    expect(Math.hypot(crateState.position[0], crateState.position[2] - 12)).toBeGreaterThan(1);
    backend.dispose();
  });
});
