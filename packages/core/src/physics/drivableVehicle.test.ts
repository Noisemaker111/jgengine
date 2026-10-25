import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS } from "../input/axisInput";
import { tickDrivableVehicle } from "./drivableVehicle";
import { createTireMarks } from "./tireMarks";
import { createVehicleDynamics } from "./vehicleDynamics";
import { VEHICLE_STYLES, vehicleTuning } from "./vehicleSpec";

const TUNING = vehicleTuning({ ...VEHICLE_STYLES.arcade, topSpeed: 28, accel: 9, brake: 12, turnRate: 2 });
const DT = 1 / 60;

describe("tickDrivableVehicle", () => {
  test("connects an axis sample through the sim to a setPose-ready patch", () => {
    const vehicle = createVehicleDynamics(TUNING, { position: [0, 0, 0], heading: 0 });
    let result = tickDrivableVehicle(vehicle, DT, { ...NEUTRAL_AXIS, throttle: 1 });
    for (let i = 0; i < 10; i += 1) result = tickDrivableVehicle(vehicle, DT, { ...NEUTRAL_AXIS, throttle: 1 });
    expect(result.pose.dt).toBeCloseTo(DT);
    expect(result.pose.position[2]).toBeGreaterThan(0);
    expect(result.step.forwardSpeed).toBeGreaterThan(0);
  });

  test("ground snaps the resulting pose when groundHeight is given", () => {
    const vehicle = createVehicleDynamics(TUNING, { position: [0, 0, 0], heading: 0 });
    const result = tickDrivableVehicle(vehicle, DT, NEUTRAL_AXIS, { groundHeight: (x, z) => 5 + x + z });
    expect(result.pose.position[1]).toBeCloseTo(5);
  });

  test("without groundHeight the sim's own flat y is kept", () => {
    const vehicle = createVehicleDynamics(TUNING, { position: [0, 1.5, 0], heading: 0 });
    const result = tickDrivableVehicle(vehicle, DT, NEUTRAL_AXIS);
    expect(result.pose.position[1]).toBeCloseTo(1.5);
  });
});

describe("tire effects", () => {
  function slide(handbrake: number) {
    const vehicle = createVehicleDynamics(TUNING, { position: [0, 0, 0], heading: 0 });
    const marks = createTireMarks();
    const smoke: { position?: readonly [number, number, number]; burst?: number }[] = [];
    const particles = { play: (name: string, request?: { position?: readonly [number, number, number]; burst?: number }) => {
      expect(name).toBe("smoke/tire");
      smoke.push(request ?? {});
    } };
    let time = 0;
    for (let i = 0; i < 150; i += 1) {
      time += DT;
      tickDrivableVehicle(vehicle, DT, { ...NEUTRAL_AXIS, throttle: 1 }, { tires: { id: "car", time, marks, particles } });
    }
    const straight = marks.marks(time).length;
    for (let i = 0; i < 60; i += 1) {
      time += DT;
      tickDrivableVehicle(vehicle, DT, { ...NEUTRAL_AXIS, throttle: 0.4, steer: 1, handbrake }, { tires: { id: "car", time, marks, particles } });
    }
    return { straight, marks: marks.marks(time), smoke };
  }

  test("a handbrake slide lays rear skid marks and smokes; a straight run does not", () => {
    const { straight, marks, smoke } = slide(1);
    expect(straight).toBe(0);
    expect(marks.length).toBeGreaterThan(10);
    expect(smoke.length).toBeGreaterThan(3);
    for (const mark of marks) {
      expect(mark.width).toBeGreaterThan(0.1);
      expect(Math.hypot(mark.bx - mark.ax, mark.bz - mark.az)).toBeLessThan(3);
    }
  });
});
