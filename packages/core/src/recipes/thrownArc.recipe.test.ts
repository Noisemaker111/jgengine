import { expect, test } from "bun:test";

import { createMotionTrack } from "../parts";

/**
 * @recipe Thrown item arc
 * A Motion track through points sampled along a parabola; the track reports where the item is and when it lands.
 */
test("thrown item arc", () => {
  const from = [0, 1, 0];
  const to = [12, 0, 0];
  const arc = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [(from[0] ?? 0) + ((to[0] ?? 0) - (from[0] ?? 0)) * t, 1 + 4 * 3 * t * (1 - t) - t, 0] as [number, number, number];
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
