import { expect, test } from "bun:test";

import { easeInOutCubic } from "../anim/easing";
import { createMotionTrack, evaluatePredicate } from "../parts";

/**
 * @recipe Door that opens over time
 * A Requirement decides who may open it, and a Motion track with easing slides it up and, reversed, back down.
 */
test("door that opens over time", () => {
  const needsKey = { includes: ["keys", "red"] } as const;
  const slide = (up: boolean, startAt: number) =>
    createMotionTrack({ points: up ? [[0, 0, 0], [0, 3, 0]] : [[0, 3, 0], [0, 0, 0]], duration: 1.5, easing: easeInOutCubic, startAt });
  const open = (keys: string[], now: number) => (evaluatePredicate(needsKey, { keys }) ? slide(true, now) : null);
  const height = (door: ReturnType<typeof slide>, now: number) => {
    const out: [number, number, number] = [0, 0, 0];
    door.sampleInto(now, out);
    return out[1];
  };

  expect(open(["blue"], 0)).toBeNull();
  const door = open(["red"], 10);
  expect(door && height(door, 10.75)).toBeCloseTo(1.5, 5);
  expect(door && height(door, 12)).toBe(3);
  expect(height(slide(false, 20), 20.75)).toBeCloseTo(1.5, 5);
});
