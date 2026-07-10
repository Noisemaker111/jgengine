import { describe, expect, test } from "bun:test";
import { DEFAULT_CAR_TUNING, NEUTRAL_CAR_INPUT, advanceCar, createCarState } from "./carKinematics";

describe("advanceCar", () => {
  test("throttle accelerates forward speed up to the max", () => {
    let state = createCarState([0, 0, 0], 0);
    for (let i = 0; i < 200; i += 1) {
      state = advanceCar(state, { ...NEUTRAL_CAR_INPUT, throttle: true }, 1 / 60);
    }
    expect(state.speed).toBeCloseTo(DEFAULT_CAR_TUNING.maxSpeed, 1);
  });

  test("moving forward with zero heading advances position along +z", () => {
    let state = createCarState([0, 0, 0], 0);
    for (let i = 0; i < 30; i += 1) {
      state = advanceCar(state, { ...NEUTRAL_CAR_INPUT, throttle: true }, 1 / 60);
    }
    expect(state.position[2]).toBeGreaterThan(0);
    expect(state.position[0]).toBeCloseTo(0, 5);
  });

  test("steering right increases heading while moving forward", () => {
    let state = createCarState([0, 0, 0], 0);
    state = advanceCar(state, { ...NEUTRAL_CAR_INPUT, throttle: true }, 1);
    const before = state.heading;
    state = advanceCar(state, { ...NEUTRAL_CAR_INPUT, throttle: true, steerRight: true }, 1 / 60);
    expect(state.heading).toBeGreaterThan(before);
  });

  test("drag decays speed to exactly zero with no input", () => {
    let state = { ...createCarState([0, 0, 0], 0), speed: 0.2 };
    for (let i = 0; i < 30; i += 1) {
      state = advanceCar(state, NEUTRAL_CAR_INPUT, 1 / 60);
    }
    expect(state.speed).toBe(0);
  });

  test("a surge multiplier raises the achievable top speed", () => {
    let state = createCarState([0, 0, 0], 0);
    for (let i = 0; i < 300; i += 1) {
      state = advanceCar(state, { ...NEUTRAL_CAR_INPUT, throttle: true }, 1 / 60, DEFAULT_CAR_TUNING, 1.35);
    }
    expect(state.speed).toBeGreaterThan(DEFAULT_CAR_TUNING.maxSpeed);
  });
});
