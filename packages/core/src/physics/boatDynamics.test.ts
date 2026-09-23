import { describe, expect, test } from "bun:test";

import type { AxisInput } from "../input/axisInput";
import { createBoatDynamics, type BoatTuning } from "./boatDynamics";
import { tickDrivableVehicle } from "./drivableVehicle";
import { measureHandling } from "./handlingProbe";

const DT = 1 / 60;

const speedboat: BoatTuning = { massKg: 900, length: 6, beam: 2.3, maxThrust: 7000, propSpeed: 30, planingSpeed: 8, steering: { kind: "outboard" } };
const tug: BoatTuning = { massKg: 30000, length: 18, beam: 6, maxThrust: 90000, propSpeed: 9, steering: { kind: "rudder", area: 2.5 } };

function axis(partial: Partial<AxisInput>): AxisInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: 0, ...partial };
}

function run(boat: ReturnType<typeof createBoatDynamics>, seconds: number, input: AxisInput) {
  let step = boat.tick(DT, input);
  for (let i = 1; i < Math.round(seconds / DT); i += 1) step = boat.tick(DT, input);
  return step;
}

describe("createBoatDynamics", () => {
  test("a planing hull climbs onto the plane and runs well past hull speed", () => {
    const boat = createBoatDynamics(speedboat);
    const step = run(boat, 20, axis({ throttle: 1 }));
    expect(step.planing).toBe(1);
    expect(step.forwardSpeed).toBeGreaterThan(1.34 * Math.sqrt(9.81 * speedboat.length) * 2);
  });

  test("a displacement hull stalls near hull speed and never planes", () => {
    const boat = createBoatDynamics({ ...tug, propSpeed: 30 });
    const step = run(boat, 60, axis({ throttle: 1 }));
    expect(step.planing).toBe(0);
    expect(step.forwardSpeed).toBeLessThan(1.34 * Math.sqrt(9.81 * tug.length) * 1.25);
  });

  test("a rudder needs flow: no turn at rest, a slow turn once the prop washes over it", () => {
    const still = run(createBoatDynamics(tug), 2, axis({ steer: 1 }));
    expect(still.yawRate).toBe(0);
    const washed = run(createBoatDynamics(tug), 2, axis({ steer: 1, throttle: 0.5 }));
    expect(washed.yawRate).toBeLessThan(-0.01);
  });

  test("an outboard swings its thrust, so it turns hard at low speed", () => {
    const boat = run(createBoatDynamics(speedboat), 2, axis({ steer: 1, throttle: 0.5 }));
    const rudder = run(createBoatDynamics(tug), 2, axis({ steer: 1, throttle: 0.5 }));
    expect(boat.yawRate).toBeLessThan(rudder.yawRate * 3);
    expect(boat.steerAngle).toBeGreaterThan(0);
  });

  test("measureHandling reads a boat like any drivable sim", () => {
    const report = measureHandling(() => createBoatDynamics(speedboat), { cornerSpeed: 15 });
    expect(report.topSpeed).toBeGreaterThan(20);
    expect(report.spun).toBe(false);
    expect(report.maxLateralG).toBeGreaterThan(0.1);
  });

  test("tickDrivableVehicle poses a boat entity", () => {
    const boat = createBoatDynamics(speedboat, { position: [0, 2, 0] });
    const drive = tickDrivableVehicle(boat, DT, axis({ throttle: 1 }));
    expect(drive.pose.position[1]).toBe(2);
    expect(drive.step.engineLoad).toBeGreaterThan(0.9);
  });

  test("snapshot and restore replay bit-exactly", () => {
    const boat = createBoatDynamics(speedboat, { waterHeight: (x, z, t) => 0.3 * Math.sin(x * 0.2 + t) + 0.1 * Math.cos(z * 0.3) });
    run(boat, 3, axis({ throttle: 1, steer: 0.4 }));
    const saved = boat.snapshot();
    const a = run(boat, 2, axis({ throttle: 0.7, steer: -1 }));
    boat.restore(saved);
    const b = run(boat, 2, axis({ throttle: 0.7, steer: -1 }));
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test("the hull rides the water surface", () => {
    const boat = createBoatDynamics(speedboat, { waterHeight: (_x, _z, t) => 0.5 * Math.sin(t * 2) });
    const heights: number[] = [];
    for (let i = 0; i < 240; i += 1) heights.push(boat.tick(DT, axis({})).position[1]);
    expect(Math.max(...heights)).toBeGreaterThan(0.45);
    expect(Math.min(...heights)).toBeLessThan(-0.45);
  });

  test("a current carries a drifting hull with it", () => {
    const boat = createBoatDynamics(tug, { current: () => [1.5, 0] });
    run(boat, 60, axis({}));
    expect(boat.velocity()[0]).toBeCloseTo(1.5, 1);
    expect(boat.pose().position[0]).toBeGreaterThan(40);
  });

  test("retune takes effect on the next tick", () => {
    const boat = createBoatDynamics(speedboat);
    const slow = run(boat, 10, axis({ throttle: 1 })).forwardSpeed;
    boat.retune({ ...speedboat, maxThrust: 14000, propSpeed: 45 });
    const fast = run(boat, 10, axis({ throttle: 1 })).forwardSpeed;
    expect(fast).toBeGreaterThan(slow + 3);
    expect(boat.tuning().maxThrust).toBe(14000);
  });

  test("reverse thrust backs the boat up and resetTo clears motion", () => {
    const boat = createBoatDynamics(speedboat);
    expect(run(boat, 3, axis({ brake: 1 })).forwardSpeed).toBeLessThan(-0.5);
    boat.resetTo([5, 0, 5], 1);
    expect(boat.velocity()).toEqual([0, 0]);
    expect(boat.pose().heading).toBe(1);
  });
});
