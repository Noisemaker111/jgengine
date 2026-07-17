import { describe, expect, test } from "bun:test";
import {
  advancePathFollow,
  createPathFollow,
  pathFollowProgress,
  pathFollowSeek,
  pathFromNav,
  pathLength,
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

const SQUARE: PathFollowConfig = {
  waypoints: [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 10],
  ],
  speed: 5,
  loop: true,
};

describe("pathFollow semantic progress adapter", () => {
  test("pathLength sums every segment including the loop wrap", () => {
    expect(pathLength(SQUARE)).toBeCloseTo(40);
    expect(pathLength({ ...SQUARE, loop: false })).toBeCloseTo(30);
  });

  test("seek by normalized fraction lands mid-path with travel heading", () => {
    // 0.25 of 40 units = 10 units = end of first segment / start of second.
    const state = pathFollowSeek(SQUARE, { kind: "normalized", value: 0.25 });
    expect(state.position[0]).toBeCloseTo(10);
    expect(state.position[2]).toBeCloseTo(0);
    expect(state.target).toBe(2);
  });

  test("seek by distance matches simulating forward the same distance", () => {
    const seeked = pathFollowSeek(SQUARE, { kind: "distance", value: 17 });
    const simulated = advancePathFollow(SQUARE, createPathFollow(SQUARE), 17 / SQUARE.speed);
    expect(seeked.position[0]).toBeCloseTo(simulated.position[0]);
    expect(seeked.position[2]).toBeCloseTo(simulated.position[2]);
    expect(seeked.target).toBe(simulated.target);
  });

  test("seek by segment + fraction places along the named segment", () => {
    const state = pathFollowSeek(SQUARE, { kind: "segment", index: 1, fraction: 0.5 });
    expect(state.position[0]).toBeCloseTo(10);
    expect(state.position[2]).toBeCloseTo(5);
  });

  test("looping seek wraps distances beyond the path length", () => {
    const wrapped = pathFollowSeek(SQUARE, { kind: "distance", value: 45 });
    const direct = pathFollowSeek(SQUARE, { kind: "distance", value: 5 });
    expect(wrapped.position[0]).toBeCloseTo(direct.position[0]);
    expect(wrapped.position[2]).toBeCloseTo(direct.position[2]);
  });

  test("non-looping seek clamps past the end and reports done", () => {
    const line: PathFollowConfig = { ...SQUARE, loop: false };
    const state = pathFollowSeek(line, { kind: "distance", value: 999 });
    expect(state.position).toEqual([0, 0, 10]);
    expect(state.done).toBe(true);
  });

  test("pathFollowProgress inverts seek to normalized/segment/fraction", () => {
    const state = pathFollowSeek(SQUARE, { kind: "segment", index: 2, fraction: 0.5 });
    const progress = pathFollowProgress(SQUARE, state);
    expect(progress.segment).toBe(2);
    expect(progress.fraction).toBeCloseTo(0.5);
    expect(progress.normalized).toBeCloseTo(25 / 40);
  });
});
