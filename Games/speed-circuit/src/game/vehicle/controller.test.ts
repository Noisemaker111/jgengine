import { describe, expect, test } from "bun:test";
import { NEUTRAL_AXIS } from "@jgengine/core/input/axisInput";

import { SPAWN_HEADING, SPAWN_POSITION } from "../race/track";
import { createVehicleController } from "./controller";

const DT = 1 / 60;

describe("vehicle controller — throttle/brake speed integration", () => {
  test("full throttle accelerates the car forward from a standstill", () => {
    const controller = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
    let last = controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    for (let i = 0; i < 90; i += 1) {
      last = controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    }
    expect(last.speedKmh).toBeGreaterThan(20);
    const dz = last.position[2] - SPAWN_POSITION[2];
    const dx = last.position[0] - SPAWN_POSITION[0];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(5);
  });

  test("braking after building speed slows the car back down", () => {
    const controller = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
    for (let i = 0; i < 90; i += 1) controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    const beforeBrake = controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).speedKmh;
    let afterBrake = beforeBrake;
    for (let i = 0; i < 60; i += 1) afterBrake = controller.tick(DT, { ...NEUTRAL_AXIS, brake: 1 }).speedKmh;
    expect(afterBrake).toBeLessThan(beforeBrake);
  });
});

describe("vehicle controller — steering", () => {
  test("steering while moving changes heading over time", () => {
    const controller = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
    for (let i = 0; i < 40; i += 1) controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 });
    const startHeading = controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1 }).heading;
    let heading = startHeading;
    for (let i = 0; i < 60; i += 1) heading = controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1, steer: 1 }).heading;
    expect(Math.abs(heading - startHeading)).toBeGreaterThan(0.1);
  });
});

describe("vehicle controller — reset", () => {
  test("resetTo teleports the car and zeroes drift", () => {
    const controller = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });
    for (let i = 0; i < 60; i += 1) controller.tick(DT, { ...NEUTRAL_AXIS, throttle: 1, steer: 1 });
    controller.resetTo(SPAWN_POSITION, SPAWN_HEADING);
    const pose = controller.tick(DT, NEUTRAL_AXIS);
    expect(Math.hypot(pose.position[0] - SPAWN_POSITION[0], pose.position[2] - SPAWN_POSITION[2])).toBeLessThan(0.5);
  });
});
