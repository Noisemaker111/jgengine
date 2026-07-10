import { describe, expect, test } from "bun:test";
import {
  BOAT_MAX_FORWARD_SPEED,
  createBoatState,
  currentAssist,
  currentAssistMood,
  groundSpeed,
  NEUTRAL_INPUT,
  stepBoat,
} from "./momentum";

const FULL_THROTTLE = { throttle: 1 as const, rudder: 0 as const, brake: false };

function runTicks(state: ReturnType<typeof createBoatState>, input: typeof FULL_THROTTLE, currentVec: readonly [number, number], ticks: number, dt = 1 / 30) {
  let s = state;
  for (let i = 0; i < ticks; i += 1) s = stepBoat(s, input, currentVec, dt);
  return s;
}

describe("boat momentum", () => {
  test("throttle accelerates a boat from rest facing +z", () => {
    const start = createBoatState(0, 0, 0);
    const after = runTicks(start, FULL_THROTTLE, [0, 0], 30);
    expect(after.speed).toBeGreaterThan(0);
    expect(after.z).toBeGreaterThan(0);
    expect(after.x).toBeCloseTo(0, 5);
  });

  test("with-current heading is faster over ground than against-current heading", () => {
    const withCurrentVec: readonly [number, number] = [0, 4];
    const againstCurrentVec: readonly [number, number] = [0, -4];
    const forwardFacing = createBoatState(0, 0, 0);

    const withCurrentBoat = runTicks(forwardFacing, FULL_THROTTLE, withCurrentVec, 60);
    const againstCurrentBoat = runTicks(forwardFacing, FULL_THROTTLE, againstCurrentVec, 60);

    const withSpeed = groundSpeed(withCurrentBoat, withCurrentVec);
    const againstSpeed = groundSpeed(againstCurrentBoat, againstCurrentVec);

    expect(withSpeed).toBeGreaterThan(BOAT_MAX_FORWARD_SPEED);
    expect(againstSpeed).toBeLessThan(BOAT_MAX_FORWARD_SPEED);
    expect(withSpeed).toBeGreaterThan(againstSpeed);
  });

  test("currentAssist is positive with the flow and negative against it", () => {
    const heading = 0;
    expect(currentAssist(heading, [0, 5])).toBeGreaterThan(0);
    expect(currentAssist(heading, [0, -5])).toBeLessThan(0);
    expect(currentAssistMood(heading, [0, 5])).toBe("surf");
    expect(currentAssistMood(heading, [0, -5])).toBe("fight");
    expect(currentAssistMood(heading, [0, 0])).toBe("neutral");
  });

  test("drag decelerates a coasting boat back toward rest", () => {
    const moving = { x: 0, z: 0, headingRad: 0, speed: 10 };
    const after = stepBoat(moving, NEUTRAL_INPUT, [0, 0], 1 / 30);
    expect(after.speed).toBeLessThan(10);
    expect(after.speed).toBeGreaterThanOrEqual(0);
  });

  test("stepBoat is a pure function of its inputs", () => {
    const state = createBoatState(3, 4, 0.5);
    const a = stepBoat(state, FULL_THROTTLE, [1, 1], 1 / 30);
    const b = stepBoat(state, FULL_THROTTLE, [1, 1], 1 / 30);
    expect(a).toEqual(b);
  });

  test("restarting from createBoatState always yields the same fresh state", () => {
    const first = createBoatState(1, 2, 0.3);
    const second = createBoatState(1, 2, 0.3);
    expect(first).toEqual(second);
    expect(first.speed).toBe(0);
  });
});
