import { describe, expect, test } from "bun:test";

import { aircraftAttitudeQuaternion, createRigidAircraft } from "@jgengine/core/physics/aircraftDynamics";

import { flightDemoBooster, flightDemoHelicopter, flightDemoHelicopterAssists, flightDemoHover, flightDemoPlaneAssists, flightDemoPlane, flightDemoSpawn, flightDemoUpperStage } from "./flightTuning";

const DT = 1 / 60;

function fly(seconds: number, control: { throttle: number; pitch: number; roll: number; yaw: number }) {
  const plane = createRigidAircraft(flightDemoPlane, flightDemoSpawn);
  let pitched = 0;
  let rolled = 0;
  let minY = Number.POSITIVE_INFINITY;
  let step = plane.tick(DT, control);
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    step = plane.tick(DT, control);
    pitched += step.pitchRate * DT;
    rolled += step.rollRate * DT;
    minY = Math.min(minY, step.position[1]);
  }
  return { step, pitched, rolled, minY };
}

describe("flight demo plane", () => {
  test("holds level hands-off at cruise", () => {
    const { step } = fly(8, { throttle: 0.35, pitch: 0, roll: 0, yaw: 0 });
    expect(Math.abs(step.pitch)).toBeLessThan(0.08);
    expect(step.position[1]).toBeGreaterThan(200);
  });

  test("loops in about ten seconds without hitting the ground", () => {
    const { pitched, minY } = fly(10.5, { throttle: 1, pitch: 1, roll: 0, yaw: 0 });
    expect(pitched).toBeGreaterThan(2 * Math.PI);
    expect(minY).toBeGreaterThan(150);
  });

  test("rolls a full turn in under two seconds", () => {
    expect(fly(2, { throttle: 0.35, pitch: 0, roll: 1, yaw: 0 }).rolled).toBeGreaterThan(2 * Math.PI);
  });
});

describe("flight demo plane assists", () => {
  test("level a banked plane hands-off", () => {
    const plane = createRigidAircraft({ ...flightDemoPlane, assists: flightDemoPlaneAssists }, { ...flightDemoSpawn, orientation: aircraftAttitudeQuaternion(0, 0, 1) });
    let step = plane.tick(DT, { throttle: 0.35, pitch: 0, roll: 0, yaw: 0 });
    for (let i = 0; i < Math.round(5 / DT); i += 1) step = plane.tick(DT, { throttle: 0.35, pitch: 0, roll: 0, yaw: 0 });
    expect(Math.abs(step.bank)).toBeLessThan(0.05);
  });
});

describe("flight demo helicopter", () => {
  function hover(pedal: number, seconds: number) {
    const heli = createRigidAircraft(flightDemoHelicopter, { position: [0, 40, 0] });
    heli.restore({ ...heli.snapshot(), rotorSpeed: 1 });
    let step = heli.tick(DT, { throttle: 1, collective: flightDemoHover.collective, pitch: 0, roll: 0, yaw: pedal });
    for (let i = 0; i < Math.round(seconds / DT); i += 1) step = heli.tick(DT, { throttle: 1, collective: flightDemoHover.collective, pitch: 0, roll: 0, yaw: pedal });
    return step;
  }

  test("hovers on its hover collective", () => {
    expect(Math.abs(hover(flightDemoHover.pedal, 2).velocity[1])).toBeLessThan(0.3);
  });

  test("with assists on it holds heading and position with the pedals and cyclic hands-off", () => {
    const heli = createRigidAircraft({ ...flightDemoHelicopter, assists: flightDemoHelicopterAssists }, { position: [0, 40, 0] });
    heli.restore({ ...heli.snapshot(), rotorSpeed: 1 });
    let step = heli.tick(DT, { throttle: 1, collective: flightDemoHover.collective, pitch: 0, roll: 0, yaw: 0 });
    for (let i = 0; i < Math.round(8 / DT); i += 1) step = heli.tick(DT, { throttle: 1, collective: flightDemoHover.collective, pitch: 0, roll: 0, yaw: 0 });
    expect(Math.abs(step.heading)).toBeLessThan(0.1);
    expect(Math.hypot(step.velocity[0], step.velocity[2])).toBeLessThan(0.5);
  });

  test("needs pedal to hold heading", () => {
    expect(Math.abs(hover(0, 2).heading)).toBeGreaterThan(0.5);
    expect(Math.abs(hover(flightDemoHover.pedal, 2).heading)).toBeLessThan(0.15);
  });
});

describe("flight demo rocket", () => {
  test("pulls harder as the booster burns, then stages and keeps climbing", () => {
    const rocket = createRigidAircraft(flightDemoBooster, { position: [0, 4, 0], orientation: aircraftAttitudeQuaternion(0, Math.PI / 2 - 0.03, 0) });
    const input = { throttle: 1, pitch: 0, roll: 0, yaw: 0 };
    let previous = rocket.tick(DT, input);
    let first = 0;
    let last = 0;
    for (let i = 0; i < Math.round(5.2 / DT); i += 1) {
      const step = rocket.tick(DT, input);
      const accel = Math.hypot(step.velocity[0] - previous.velocity[0], step.velocity[1] - previous.velocity[1], step.velocity[2] - previous.velocity[2]) / DT;
      if (i === 10) first = accel;
      if (step.motor!.thrust > 0) last = accel;
      previous = step;
    }
    expect(previous.motor!.burnedOut).toBe(true);
    expect(last).toBeGreaterThan(first * 1.8);
    rocket.retune(flightDemoUpperStage);
    let step = previous;
    for (let i = 0; i < Math.round(8 / DT); i += 1) step = rocket.tick(DT, input);
    expect(step.position[1]).toBeGreaterThan(1200);
    expect(step.pitch).toBeGreaterThan(0.8);
  });
});
