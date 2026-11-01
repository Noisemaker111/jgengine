import { expect, test } from "bun:test";

import { createMotionTrack } from "../parts";

/**
 * @recipe Thrown item arc
 * A Motion track through points sampled along a parabola; the track reports where the item is and when it lands.
 */
test("thrown item arc", () => {
  const arc = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [12 * t, 1 + 12 * t * (1 - t) - t, 0] satisfies [number, number, number];
  });
  const flight = createMotionTrack({ points: arc, duration: 1.2, startAt: 0 });
  const where: [number, number, number] = [0, 0, 0];

  flight.sampleInto(0.6, where);
  expect(where[1]).toBeGreaterThan(3);
  expect(flight.justArrived(1.1)).toBe(false);
  flight.sampleInto(1.2, where);
  expect(where).toEqual([12, 0, 0]);
  expect(flight.justArrived(1.2)).toBe(true);
});
