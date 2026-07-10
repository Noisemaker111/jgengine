import { describe, expect, test } from "bun:test";

import { NEUTRAL_DRONE_AXES } from "./input";
import { createDroneController } from "./controller";

const DT = 1 / 60;
const SPAWN = { position: [0, 10, 0] as const, heading: 0 };
const NO_WIND: readonly [number, number] = [0, 0];

describe("drone controller — throttle and pitch integration", () => {
  test("throttle climbs the drone from a standstill", () => {
    const controller = createDroneController(SPAWN);
    let last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, throttle: 1 }, NO_WIND);
    for (let i = 0; i < 90; i += 1) last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, throttle: 1 }, NO_WIND);
    expect(last.position[1]).toBeGreaterThan(SPAWN.position[1]);
    expect(last.climbing).toBe(true);
  });

  test("pitch forward builds forward momentum", () => {
    const controller = createDroneController(SPAWN);
    let last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1 }, NO_WIND);
    for (let i = 0; i < 90; i += 1) last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1 }, NO_WIND);
    expect(last.speed).toBeGreaterThan(5);
    const dz = last.position[2] - SPAWN.position[2];
    expect(dz).toBeGreaterThan(1);
  });

  test("boost increases top speed over the unboosted cap", () => {
    const controller = createDroneController(SPAWN);
    let normal = 0;
    for (let i = 0; i < 240; i += 1) normal = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1 }, NO_WIND).speed;

    const boosted = createDroneController(SPAWN);
    let boostedSpeed = 0;
    for (let i = 0; i < 240; i += 1) {
      boostedSpeed = boosted.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1, boost: true }, NO_WIND).speed;
    }
    expect(boostedSpeed).toBeGreaterThan(normal);
  });
});

describe("drone controller — yaw and drag", () => {
  test("yaw input rotates heading over time", () => {
    const controller = createDroneController(SPAWN);
    let heading = 0;
    for (let i = 0; i < 60; i += 1) heading = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, yaw: 1 }, NO_WIND).heading;
    expect(Math.abs(heading)).toBeGreaterThan(0.1);
  });

  test("drag settles speed back down once controls are released", () => {
    const controller = createDroneController(SPAWN);
    for (let i = 0; i < 90; i += 1) controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1 }, NO_WIND);
    const beforeRelease = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1 }, NO_WIND).speed;
    let afterRelease = beforeRelease;
    for (let i = 0; i < 90; i += 1) afterRelease = controller.tick(DT, NEUTRAL_DRONE_AXES, NO_WIND).speed;
    expect(afterRelease).toBeLessThan(beforeRelease);
  });
});

describe("drone controller — wind and reset", () => {
  test("a wind vector pushes velocity along the wind direction", () => {
    const controller = createDroneController(SPAWN);
    const wind: readonly [number, number] = [0, -5];
    let last = controller.tick(DT, NEUTRAL_DRONE_AXES, wind);
    for (let i = 0; i < 60; i += 1) last = controller.tick(DT, NEUTRAL_DRONE_AXES, wind);
    expect(last.velocityZ).toBeLessThan(0);
  });

  test("resetTo teleports the drone and zeroes momentum", () => {
    const controller = createDroneController(SPAWN);
    for (let i = 0; i < 60; i += 1) controller.tick(DT, { ...NEUTRAL_DRONE_AXES, pitch: 1, yaw: 1, throttle: 1 }, NO_WIND);
    controller.resetTo(SPAWN.position, SPAWN.heading);
    const pose = controller.tick(DT, NEUTRAL_DRONE_AXES, NO_WIND);
    expect(Math.hypot(pose.position[0] - SPAWN.position[0], pose.position[2] - SPAWN.position[2])).toBeLessThan(0.1);
    expect(pose.speed).toBeLessThan(0.1);
  });

  test("altitude never drops below the tuned floor", () => {
    const controller = createDroneController({ position: [0, 1, 0], heading: 0 });
    let last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, throttle: -1 }, NO_WIND);
    for (let i = 0; i < 120; i += 1) last = controller.tick(DT, { ...NEUTRAL_DRONE_AXES, throttle: -1 }, NO_WIND);
    expect(last.position[1]).toBeGreaterThanOrEqual(0.4);
  });
});
