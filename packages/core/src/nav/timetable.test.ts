import { describe, expect, test } from "bun:test";

import { createRouteTimetable } from "@jgengine/core/nav/timetable";

describe("createRouteTimetable", () => {
  test("position is a pure function of time — preview equals live", () => {
    const route = createRouteTimetable({
      waypoints: [
        [0, 0, 0],
        [0, 0, 10],
        [10, 0, 10],
      ],
      speed: 2,
    });
    expect(route.distance).toBe(20);
    expect(route.cycleSeconds).toBe(10);
    expect(route.positionAt(0)).toEqual([0, 0, 0]);
    expect(route.positionAt(2.5)).toEqual([0, 0, 5]);
    expect(route.positionAt(5)).toEqual([0, 0, 10]);
    expect(route.positionAt(7.5)).toEqual([5, 0, 10]);
    expect(route.positionAt(7.5)).toEqual(route.positionAt(7.5));
  });

  test("non-looping routes hold at the terminus forever", () => {
    const route = createRouteTimetable({
      waypoints: [
        [0, 0, 0],
        [0, 0, 10],
      ],
      speed: 5,
    });
    const pose = route.poseAt(100);
    expect(pose.position).toEqual([0, 0, 10]);
    expect(pose.dwelling).toBe(true);
    expect(route.progressAt(100)).toBe(1);
  });

  test("looping routes wrap and negative time samples backwards", () => {
    const route = createRouteTimetable({
      waypoints: [
        [0, 0, 0],
        [0, 0, 10],
        [10, 0, 10],
        [10, 0, 0],
      ],
      speed: 10,
      loop: true,
    });
    expect(route.cycleSeconds).toBe(4);
    expect(route.positionAt(0)).toEqual(route.positionAt(4));
    expect(route.positionAt(-0.5)).toEqual(route.positionAt(3.5));
  });

  test("dwells hold position at stops and delay departures", () => {
    const route = createRouteTimetable({
      waypoints: [
        { at: [0, 0, 0], dwellSeconds: 2 },
        { at: [0, 0, 10], dwellSeconds: 0 },
      ],
      speed: 5,
    });
    expect(route.cycleSeconds).toBe(4);
    const dwelling = route.poseAt(1);
    expect(dwelling.position).toEqual([0, 0, 0]);
    expect(dwelling.dwelling).toBe(true);
    expect(route.positionAt(3)).toEqual([0, 0, 5]);
  });

  test("offset staggers movers on the same route", () => {
    const config = {
      waypoints: [
        [0, 0, 0],
        [0, 0, 10],
      ] as const,
      speed: 1,
      loop: true,
    };
    const lead = createRouteTimetable(config);
    const chaser = createRouteTimetable({ ...config, offsetSeconds: -5 });
    expect(chaser.positionAt(5)).toEqual(lead.positionAt(0));
  });

  test("rejects degenerate configs", () => {
    expect(() => createRouteTimetable({ waypoints: [[0, 0, 0]], speed: 1 })).toThrow();
    expect(() =>
      createRouteTimetable({
        waypoints: [
          [0, 0, 0],
          [1, 0, 0],
        ],
        speed: 0,
      }),
    ).toThrow();
  });
});
