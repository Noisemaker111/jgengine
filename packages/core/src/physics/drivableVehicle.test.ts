import { describe, expect, test } from "bun:test";

import { tickDrivableVehicle } from "./drivableVehicle";
import { createKinematicVehicle } from "./kinematicVehicle";
import { NEUTRAL_AXIS } from "../input/axisInput";

const TUNING = {
  engineAccel: 20,
  brakeAccel: 26,
  topSpeed: 28,
  reverseSpeed: 8,
  turnRate: 2,
  turnSpeedRef: 6,
  gripStrength: 8,
  handbrakeGrip: 0.3,
};

describe("tickDrivableVehicle", () => {
  test("connects an axis sample through the sim to a setPose-ready patch", () => {
    const vehicle = createKinematicVehicle(TUNING, { position: [0, 0, 0], heading: 0 });
    const result = tickDrivableVehicle(vehicle, 1 / 60, { ...NEUTRAL_AXIS, throttle: 1 });
    expect(result.pose.dt).toBeCloseTo(1 / 60);
    expect(result.pose.position[2]).toBeGreaterThan(0);
    expect(result.step.forwardSpeed).toBeGreaterThan(0);
  });

  test("ground snaps the resulting pose when groundHeight is given", () => {
    const vehicle = createKinematicVehicle(TUNING, { position: [0, 0, 0], heading: 0 });
    const result = tickDrivableVehicle(vehicle, 1 / 60, NEUTRAL_AXIS, {
      groundHeight: (x, z) => 5 + x + z,
    });
    expect(result.pose.position[1]).toBeCloseTo(5);
  });

  test("without groundHeight the sim's own flat y is kept", () => {
    const vehicle = createKinematicVehicle(TUNING, { position: [0, 1.5, 0], heading: 0 });
    const result = tickDrivableVehicle(vehicle, 1 / 60, NEUTRAL_AXIS);
    expect(result.pose.position[1]).toBeCloseTo(1.5);
  });
});
