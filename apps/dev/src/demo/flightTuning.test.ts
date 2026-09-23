import { describe, expect, test } from "bun:test";

import { createRigidAircraft } from "@jgengine/core/physics/aircraftDynamics";

import { flightDemoHelicopter, flightDemoHover, flightDemoPlane, flightDemoSpawn } from "./flightTuning";

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

  test("needs pedal to hold heading", () => {
    expect(Math.abs(hover(0, 2).heading)).toBeGreaterThan(0.5);
    expect(Math.abs(hover(flightDemoHover.pedal, 2).heading)).toBeLessThan(0.15);
  });
});
