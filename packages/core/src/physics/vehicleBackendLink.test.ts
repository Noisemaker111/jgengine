import { describe, expect, test } from "bun:test";

import type { AxisInput } from "../input/axisInput";
import { createPhysicsWorldBackend } from "./physicsWorldBackend";
import { createVehicleBackendLink } from "./vehicleBackendLink";
import { createVehicleDynamics, type VehicleDynamicsTuning } from "./vehicleDynamics";

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

function axis(partial: Partial<AxisInput>): AxisInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: 0, ...partial };
}

function world() {
  const backend = createPhysicsWorldBackend({ capacity: 64, bounds: { min: [-60, -5, -60], max: [60, 20, 60] }, warn: false });
  backend.addBody({ shape: { kind: "box", halfExtents: [60, 0.5, 60] }, position: [0, -0.5, 0], kind: "static" });
  return backend;
}

describe("createVehicleBackendLink", () => {
  test("a wall stops the car instead of letting it drive through", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [10, 2, 0.5] }, position: [0, 2, 30], kind: "static" });
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.7, 2.1] });
    const sim = createVehicleDynamics(car, { clampMove: link.clampMove });
    let hitSeen = false;
    for (let i = 0; i < 360; i += 1) {
      const step = sim.tick(DT, axis({ throttle: 1 }));
      link.sync(step.motion);
      backend.step(DT);
      if (link.lastHit() !== null) hitSeen = true;
    }
    const front = sim.pose().position[2] + 2.1;
    expect(front).toBeLessThan(29.6);
    expect(front).toBeGreaterThan(29);
    expect(hitSeen).toBe(true);
    expect(link.lastHit()?.normal[2]).toBeCloseTo(-1, 3);
  });

  test("an angled approach slides along the wall rather than sticking", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [40, 2, 0.5] }, position: [0, 2, 20], kind: "static" });
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.7, 2.1] });
    const sim = createVehicleDynamics(car, { heading: 0.5, clampMove: link.clampMove });
    let xAtContact = Number.NaN;
    for (let i = 0; i < 300; i += 1) {
      const step = sim.tick(DT, axis({ throttle: 0.6 }));
      link.sync(step.motion);
      backend.step(DT);
      if (Number.isNaN(xAtContact) && link.lastHit() !== null) xAtContact = sim.pose().position[0];
    }
    expect(Number.isNaN(xAtContact)).toBe(false);
    expect(sim.pose().position[0]).toBeGreaterThan(xAtContact + 2);
    expect(sim.pose().position[2]).toBeLessThan(19.6);
  });

  test("the kinematic chassis shoves a dynamic crate out of the way", () => {
    const backend = world();
    const crate = backend.addBody({ shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 0.5, 15], mass: 20, layers: 2 });
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.7, 2.1], blockMask: 1 });
    const sim = createVehicleDynamics(car, { clampMove: link.clampMove });
    for (let i = 0; i < 240; i += 1) {
      const step = sim.tick(DT, axis({ throttle: 1 }));
      link.sync(step.motion);
      backend.step(DT);
    }
    expect(backend.body(crate)!.position[2]).toBeGreaterThan(16);
    expect(sim.pose().position[2]).toBeGreaterThan(20);
  });

  test("dispose removes the chassis body", () => {
    const backend = world();
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.7, 2.1] });
    expect(backend.hasBody(link.body)).toBe(true);
    link.dispose();
    expect(backend.hasBody(link.body)).toBe(false);
  });
});

describe("vehicleBackendLink wheel probes", () => {
  test("each wheel finds the ground under it, and a ledge under one wheel shortens its suspension", () => {
    const backend = world();
    backend.addBody({ shape: { kind: "box", halfExtents: [1, 0.1, 1] }, position: [0.8, 0.1, 1.3], kind: "static" });
    const wheels = [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]].map(([x, z]) => ({ connection: [x ?? 0, -0.3, z ?? 0] as const, radius: 0.35, restLength: 0.4 }));
    const link = createVehicleBackendLink(backend, { halfExtents: [0.9, 0.5, 2.1], clearance: 0.3, wheels });
    link.sync({ position: [0, 0, 0], heading: 0 });
    backend.step(DT);
    const states = link.probeWheels(DT);
    expect(states.length).toBe(4);
    for (const state of states) expect(state.inContact).toBe(true);
    const [leftFront, rightFront] = states;
    expect(leftFront?.suspensionLength).toBeCloseTo(0.15, 2);
    expect(rightFront?.suspensionLength).toBeCloseTo(-0, 1);
    expect(rightFront?.contactPoint[1]).toBeCloseTo(0.2, 2);
    expect(link.probeWheels(DT)).toBe(states);
    link.sync({ position: [3, 0, -2], heading: 0.5 });
    const saved = link.snapshot();
    link.sync({ position: [9, 0, 9], heading: 2 });
    link.restore(saved);
    expect(link.snapshot()).toEqual({ position: [3, 0, -2], heading: 0.5, pitch: 0, roll: 0 });
    expect(backend.body(link.body)?.position[0]).toBeCloseTo(3, 6);
    link.dispose();
  });
});
