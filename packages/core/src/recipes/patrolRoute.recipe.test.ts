import { expect, test } from "bun:test";

import { createMotionTrack } from "../parts";
import type { Vec3 } from "../world/geometry";

/**
 * @recipe Patrol route
 * A Motion track per leg between waypoints; when one arrives the next starts, and the last leg returns to the first.
 */
test("patrol route", () => {
  const stops: Vec3[] = [[0, 0, 0], [10, 0, 0], [10, 0, 10]];
  const leg = (i: number, startAt: number) =>
    createMotionTrack({ points: [stops[i % 3] ?? [0, 0, 0], stops[(i + 1) % 3] ?? [0, 0, 0]], speed: 2, startAt });
  let index = 0;
  let track = leg(0, 0);
  const at = (now: number): Vec3 => {
    if (track.justArrived(now)) track = leg(++index, now);
    const out: [number, number, number] = [0, 0, 0];
    track.sampleInto(now, out);
    return out;
  };

  expect(at(2.5)).toEqual([5, 0, 0]);
  expect(at(5)).toEqual([10, 0, 0]);
  expect(at(7.5)).toEqual([10, 0, 5]);
  expect(at(10)).toEqual([10, 0, 10]);
  expect(at(13.5)[0]).toBeCloseTo(10 - 7 / Math.SQRT2, 5);
});
