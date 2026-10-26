import { describe, expect, test } from "bun:test";
import { trackFraction, type TrackAxis } from "./minimapTrack";

const axis: TrackAxis = { from: [0, 0], to: [0, 10] };

describe("trackFraction", () => {
  test("endpoints map to 0 and 1", () => {
    expect(trackFraction([0, 0], axis)).toBe(0);
    expect(trackFraction([0, 10], axis)).toBe(1);
  });

  test("midpoint maps to 0.5", () => {
    expect(trackFraction([0, 5], axis)).toBeCloseTo(0.5);
  });

  test("clamps beyond both ends", () => {
    expect(trackFraction([0, -5], axis)).toBe(0);
    expect(trackFraction([0, 25], axis)).toBe(1);
  });

  test("an off-axis point projects onto the axis (perpendicular offset ignored)", () => {
    expect(trackFraction([100, 5], axis)).toBeCloseTo(0.5);
  });

  test("projects onto a diagonal axis", () => {
    const diagonal: TrackAxis = { from: [0, 0], to: [10, 10] };
    expect(trackFraction([5, 5], diagonal)).toBeCloseTo(0.5);
    // A point off the line still projects onto the nearest along-axis position.
    expect(trackFraction([10, 0], diagonal)).toBeCloseTo(0.5);
  });

  test("accepts XYZ points (index 2 is z)", () => {
    expect(trackFraction([0, 999, 5], axis)).toBeCloseTo(0.5);
  });

  test("a zero-length axis returns 0", () => {
    expect(trackFraction([3, 4], { from: [2, 2], to: [2, 2] })).toBe(0);
  });
});
