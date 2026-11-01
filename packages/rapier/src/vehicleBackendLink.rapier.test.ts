import { describe, expect, test } from "bun:test";

import type { RayCastWheelState } from "@jgengine/core/physics/physicsBackend";
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
  steering: { maxAngle: 0.6, rate: 3 },
  effects: {
    combinedSlip: {},
    longitudinalLoadTransfer: {},
    lateralLoadTransfer: {},
    rollingResistance: {},
    speedSensitiveSteering: { angle: 0.15, at: 30 },
    selfAlign: { strength: 0.3 },
    abs: { strength: 1 },
    tractionControl: { strength: 0.6 },
    stability: { strength: 0.5 },
  },
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
      link.sync(sim.tick(DT, full).motion);
      backend.step(DT);
    }
    const front = sim.pose().position[2] + 2.1;
    expect(front).toBeLessThan(39.6);
    expect(front).toBeGreaterThan(39);
    const crateState = backend.body(crate);
    expect(Math.hypot(crateState?.position[0] ?? 0, (crateState?.position[2] ?? 12) - 12)).toBeGreaterThan(1);
    backend.dispose();
  });
});

describe("Rapier ray-cast vehicle behind the backend seam", () => {
  const wheels = [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]].map(([x, z]) => ({ connection: [x ?? 0, -0.3, z ?? 0] as const, radius: 0.35, restLength: 0.4 }));

  test("the link's wheel probes use Rapier's vehicle controller and find the ground", async () => {
    const backend = await createRapierBackend();
    try {
      const ground = backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
      const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.5, 2.1], clearance: 0.3, wheels });
      link.sync({ position: [0, 0, 0], heading: 0 });
      backend.step(DT);
      const states = link.probeWheels(DT);
      expect(states.length).toBe(4);
      for (const state of states) {
        expect(state.inContact).toBe(true);
        expect(state.ground).toBe(ground);
        expect(state.contactNormal[1]).toBeCloseTo(1, 3);
        expect(state.contactPoint[1]).toBeCloseTo(0, 2);
      }
      link.dispose();
    } finally { backend.dispose(); }
  });

  test("a dynamic chassis on Rapier's ray-cast vehicle rests on its springs and drives forward", async () => {
    const backend = await createRapierBackend();
    try {
      backend.addBody({ shape: { kind: "box", halfExtents: [50, 0.5, 50] }, position: [0, -0.5, 0], kind: "static" });
      const chassis = backend.addBody({ shape: { kind: "box", halfExtents: [0.9, 0.4, 2.1] }, position: [0, 1.2, 0], mass: 1200, layers: 2 });
      const create = backend.createRayCastVehicle;
      if (create === undefined) throw new Error("Rapier offers a ray-cast vehicle");
      const car = create({ chassis, wheels: wheels.map((w) => ({ ...w, stiffness: 30, frictionSlip: 1.5, maxForce: 60000 })), mask: 1 });
      for (let i = 0; i < 120; i += 1) { car.update(DT); backend.step(DT); }
      const rest = backend.body(chassis);
      expect(rest?.position[1]).toBeGreaterThan(0.6);
      expect(rest?.position[1]).toBeLessThan(1.3);
      const state: RayCastWheelState = { inContact: false, suspensionLength: 0, suspensionForce: 0, contactPoint: [0, 0, 0], contactNormal: [0, 0, 0], ground: null, rotation: 0 };
      expect(car.wheel(0, state).inContact).toBe(true);
      expect(state.suspensionForce).toBeGreaterThan(0);
      for (let i = 2; i < 4; i += 1) car.setWheelInput(i, 4000, 0, 0);
      for (let i = 0; i < 120; i += 1) { car.update(DT); backend.step(DT); }
      const driven = backend.body(chassis);
      expect(driven?.position[2]).toBeGreaterThan(3);
      expect(Math.abs(driven?.position[0] ?? 99)).toBeLessThan(0.5);
      expect(car.speed()).toBeGreaterThan(2);
      car.retuneWheel(0, { radius: 0.4 });
      car.dispose();
    } finally { backend.dispose(); }
  });
});
