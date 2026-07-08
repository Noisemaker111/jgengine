import { describe, expect, test } from "bun:test";
import {
  advancePathFollow,
  createPathFollow,
  pathFromNav,
  type PathFollowConfig,
} from "@jgengine/core/nav/pathFollow";

const LINE: PathFollowConfig = {
  waypoints: [
    [0, 0, 0],
    [10, 0, 0],
  ],
  speed: 2,
};

describe("pathFollow", () => {
  test("seeds at the first waypoint heading to the second", () => {
    const state = createPathFollow(LINE);
    expect(state.position).toEqual([0, 0, 0]);
    expect(state.target).toBe(1);
    expect(state.done).toBe(false);
  });

  test("advances speed * dt along the segment", () => {
    let state = createPathFollow(LINE);
    state = advancePathFollow(LINE, state, 1);
    expect(state.position[0]).toBeCloseTo(2);
    expect(state.distanceTravelled).toBeCloseTo(2);
    expect(state.done).toBe(false);
  });

  test("reaches the end and reports done, clamping overshoot", () => {
    let state = createPathFollow(LINE);
    state = advancePathFollow(LINE, state, 100);
    expect(state.position).toEqual([10, 0, 0]);
    expect(state.done).toBe(true);
    expect(state.distanceTravelled).toBeCloseTo(10);
  });

  test("crosses multiple waypoints within one step", () => {
    const config: PathFollowConfig = {
      waypoints: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [2, 0, 1],
      ],
      speed: 10,
    };
    let state = createPathFollow(config);
    state = advancePathFollow(config, state, 0.3);
    expect(state.position[0]).toBeCloseTo(2);
    expect(state.position[2]).toBeCloseTo(1);
    expect(state.done).toBe(true);
  });

  test("loops back to the first waypoint without finishing", () => {
    const config: PathFollowConfig = { ...LINE, loop: true };
    let state = createPathFollow(config);
    state = advancePathFollow(config, state, 100);
    expect(state.done).toBe(false);
    expect(state.distanceTravelled).toBeGreaterThan(10);
  });

  test("heading points along travel direction", () => {
    const config: PathFollowConfig = {
      waypoints: [
        [0, 0, 0],
        [0, 0, 5],
      ],
      speed: 1,
    };
    let state = createPathFollow(config);
    state = advancePathFollow(config, state, 1);
    expect(state.heading).toBeCloseTo(0);
  });

  test("pathFromNav lifts a 2D route onto a y plane", () => {
    expect(
      pathFromNav(
        [
          [1, 2],
          [3, 4],
        ],
        0.5,
      ),
    ).toEqual([
      [1, 0.5, 2],
      [3, 0.5, 4],
    ]);
  });

  test("pathFromNav samples terrain height via a sampleHeight source, plus an additive offset", () => {
    const field = { sampleHeight: (x: number, z: number) => x + z };
    expect(
      pathFromNav(
        [
          [1, 2],
          [3, 4],
        ],
        field,
        0.5,
      ),
    ).toEqual([
      [1, 3.5, 2],
      [3, 7.5, 4],
    ]);
  });

  test("pathFromNav applies an offset on top of a fixed y", () => {
    expect(pathFromNav([[1, 2]], 1, 0.25)).toEqual([[1, 1.25, 2]]);
  });

  test("single-waypoint path is immediately done and stationary", () => {
    const config: PathFollowConfig = { waypoints: [[5, 0, 5]], speed: 3 };
    let state = createPathFollow(config);
    expect(state.done).toBe(true);
    state = advancePathFollow(config, state, 1);
    expect(state.position).toEqual([5, 0, 5]);
  });
});
