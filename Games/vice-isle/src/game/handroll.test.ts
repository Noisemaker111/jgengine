import { describe, expect, test } from "bun:test";
import { CAR_TUNINGS, stepCar, type CarState } from "./handroll";

const flat = () => 0;

describe("handroll car controller", () => {
  test("accelerates forward under throttle", () => {
    const state: CarState = { x: 0, z: 0, heading: 0, vx: 0, vz: 0 };
    const tuning = CAR_TUNINGS.car_muscle!;
    let pose = stepCar(state, tuning, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, 1 / 60, flat);
    for (let i = 0; i < 120; i += 1) {
      pose = stepCar(state, tuning, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, 1 / 60, flat);
    }
    expect(pose.speedKmh).toBeGreaterThan(30);
    expect(state.z).toBeGreaterThan(5);
  });

  test("steering turns the heading only with speed", () => {
    const parked: CarState = { x: 0, z: 0, heading: 0, vx: 0, vz: 0 };
    const tuning = CAR_TUNINGS.car_sport!;
    stepCar(parked, tuning, { throttle: 0, brake: 0, steer: 1, handbrake: 0 }, 1 / 60, flat);
    expect(Math.abs(parked.heading)).toBeLessThan(0.01);

    const moving: CarState = { x: 0, z: 0, heading: 0, vx: 0, vz: 12 };
    for (let i = 0; i < 60; i += 1) {
      stepCar(moving, tuning, { throttle: 1, brake: 0, steer: 1, handbrake: 0 }, 1 / 60, flat);
    }
    expect(Math.abs(moving.heading)).toBeGreaterThan(0.5);
  });

  test("brake reverses from standstill and world bounds clamp", () => {
    const state: CarState = { x: 0, z: 0, heading: 0, vx: 0, vz: 0 };
    const tuning = CAR_TUNINGS.car_compact!;
    for (let i = 0; i < 120; i += 1) {
      stepCar(state, tuning, { throttle: 0, brake: 1, steer: 0, handbrake: 0 }, 1 / 60, flat);
    }
    expect(state.z).toBeLessThan(-1);

    const runaway: CarState = { x: 0, z: 299, heading: 0, vx: 0, vz: 60 };
    stepCar(runaway, tuning, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, 1, flat);
    expect(runaway.z).toBeLessThanOrEqual(300);
  });
});
