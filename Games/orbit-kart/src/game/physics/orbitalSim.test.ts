import { describe, expect, test } from "bun:test";
import type { AsteroidObstacle, Planetoid } from "../cluster/catalog";
import { PLANETOIDS, ASTEROID_OBSTACLES } from "../cluster/catalog";
import {
  NEUTRAL_INPUT,
  angleBetween,
  currentWellId,
  dischargeMultiplier,
  isDischargeWindow,
  predictTrajectory,
  spawnKartState,
  stepKart,
  type KartControlInput,
  type KartPhysicsState,
} from "./orbitalSim";

const TEST_BODY: Planetoid = {
  id: "test_body",
  name: "Test Body",
  position: [0, 0],
  tier: "medium",
  color: "#7fd8be",
  ringColor: null,
  craterSeed: "test",
  radius: 10,
  mass: 95,
  wellRadius: 40,
};
const ONE_BODY: readonly Planetoid[] = [TEST_BODY];
const NO_ASTEROIDS: readonly AsteroidObstacle[] = [];
const DT = 0.05;

function runSteps(
  initial: KartPhysicsState,
  inputs: readonly KartControlInput[],
  planetoids: readonly Planetoid[],
  asteroids: readonly AsteroidObstacle[],
): readonly KartPhysicsState[] {
  const states: KartPhysicsState[] = [initial];
  let state = initial;
  for (const input of inputs) {
    state = stepKart(state, input, DT, planetoids, asteroids).state;
    states.push(state);
  }
  return states;
}

describe("orbit-kart gravity integrator determinism", () => {
  test("same fixed-dt input sequence produces the same path", () => {
    const initial = spawnKartState(-30, 12, 0.4);
    const inputs: KartControlInput[] = Array.from({ length: 120 }, (_, i) => ({
      thrust: i % 3 !== 0,
      retro: false,
      rotateLeft: i % 7 === 0,
      rotateRight: false,
      discharge: i % 11 === 0,
    }));
    const runA = runSteps(initial, inputs, PLANETOIDS, ASTEROID_OBSTACLES);
    const runB = runSteps(initial, inputs, PLANETOIDS, ASTEROID_OBSTACLES);
    expect(runA).toEqual(runB);
  });
});

describe("orbit-kart orbit capture/ejection", () => {
  test("a tangential entry deflects around the well without colliding, then exits", () => {
    const initial: KartPhysicsState = { x: -30, z: 0, vx: 1, vz: 16, heading: 0, wellCharge: 0, wellId: null };
    const states = runSteps(
      initial,
      Array.from({ length: 400 }, () => NEUTRAL_INPUT),
      ONE_BODY,
      NO_ASTEROIDS,
    );
    const minDistance = Math.min(...states.map((s) => Math.hypot(s.x - TEST_BODY.position[0], s.z - TEST_BODY.position[1])));
    expect(minDistance).toBeGreaterThan(TEST_BODY.radius);

    const wasInsideIdx = states.findIndex((s) => currentWellId(s.x, s.z, ONE_BODY) !== null);
    expect(wasInsideIdx).toBeGreaterThanOrEqual(0);
    const exitIdx = states.findIndex((s, i) => i > wasInsideIdx && currentWellId(s.x, s.z, ONE_BODY) === null);
    expect(exitIdx).toBeGreaterThan(wasInsideIdx);

    const entryHeading = Math.atan2(initial.vx, initial.vz);
    const exitState = states[exitIdx]!;
    const exitHeading = Math.atan2(exitState.vx, exitState.vz);
    let deflection = Math.abs(exitHeading - entryHeading);
    if (deflection > Math.PI) deflection = 2 * Math.PI - deflection;
    expect(deflection).toBeGreaterThan((3 * Math.PI) / 180);
    expect(deflection).toBeLessThan((175 * Math.PI) / 180);
  });
});

describe("orbit-kart slingshot window + discharge bonus", () => {
  test("angleBetween is zero for parallel vectors and pi for opposite vectors", () => {
    expect(angleBetween([1, 0], [1, 0])).toBeCloseTo(0, 5);
    expect(angleBetween([1, 0], [-1, 0])).toBeCloseTo(Math.PI, 5);
  });

  test("isDischargeWindow accepts a partly-outward, partly-tangential exit angle", () => {
    expect(isDischargeWindow([1, 0], [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)])).toBe(true);
    expect(isDischargeWindow([1, 0], [1, 0])).toBe(false);
    expect(isDischargeWindow([1, 0], [0, 1])).toBe(false);
  });

  test("dischargeMultiplier scales linearly with charge and clamps to [1, 1+scale]", () => {
    expect(dischargeMultiplier(0)).toBeCloseTo(1, 5);
    expect(dischargeMultiplier(1)).toBeGreaterThan(1.5);
    expect(dischargeMultiplier(2)).toBe(dischargeMultiplier(1));
  });

  test("discharging inside the window inside a well boosts speed and resets charge", () => {
    const charged: KartPhysicsState = { x: -14, z: 14, vx: -10, vz: 0, heading: 0, wellCharge: 0.8, wellId: TEST_BODY.id };
    const before = Math.hypot(charged.vx, charged.vz);
    const result = stepKart(charged, { thrust: false, retro: false, rotateLeft: false, rotateRight: false, discharge: true }, DT, ONE_BODY, NO_ASTEROIDS);
    expect(result.cleanSling).toBe(true);
    expect(result.state.wellCharge).toBe(0);
    expect(Math.hypot(result.state.vx, result.state.vz)).toBeGreaterThan(before);
  });

  test("discharging outside the window does nothing to velocity", () => {
    const charged: KartPhysicsState = { x: -14, z: 14, vx: -9, vz: -9, heading: 0, wellCharge: 0.8, wellId: TEST_BODY.id };
    const result = stepKart(charged, { thrust: false, retro: false, rotateLeft: false, rotateRight: false, discharge: true }, DT, ONE_BODY, NO_ASTEROIDS);
    expect(result.cleanSling).toBe(false);
    expect(result.state.wellCharge).toBeCloseTo(charged.wellCharge + 0.55 * DT, 5);
  });
});

describe("orbit-kart trajectory ribbon consistency", () => {
  test("the predicted thread matches repeated neutral-input simulation steps exactly", () => {
    const initial: KartPhysicsState = { x: -30, z: 12, vx: 2, vz: 15, heading: 0.2, wellCharge: 0, wellId: null };
    const steps = 40;
    const ribbon = predictTrajectory(initial, PLANETOIDS, ASTEROID_OBSTACLES, steps);
    const simulated = runSteps(
      initial,
      Array.from({ length: steps }, () => NEUTRAL_INPUT),
      PLANETOIDS,
      ASTEROID_OBSTACLES,
    );
    for (let i = 0; i < ribbon.length; i += 1) {
      expect(ribbon[i]![0]).toBeCloseTo(simulated[i]!.x, 6);
      expect(ribbon[i]![1]).toBeCloseTo(simulated[i]!.z, 6);
    }
  });
});
