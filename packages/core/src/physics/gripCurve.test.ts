import { describe, expect, test } from "bun:test";

import { DEFAULT_GRIP_CURVE, gripCurvePeak, sampleGripCurve } from "./gripCurve";

describe("sampleGripCurve", () => {
  test("peaks at low slip and falls off as the tire slides", () => {
    const peak = sampleGripCurve(DEFAULT_GRIP_CURVE, 0.1);
    const slide = sampleGripCurve(DEFAULT_GRIP_CURVE, 0.9);
    expect(peak).toBeGreaterThan(slide);
    expect(peak).toBeCloseTo(1, 5);
  });

  test("grip is symmetric in slip magnitude and clamps past the ends", () => {
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, 0)).toBe(1);
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, -5)).toBe(0.55);
    expect(sampleGripCurve(DEFAULT_GRIP_CURVE, 5)).toBe(0.55);
  });

  test("an empty curve grips fully", () => {
    expect(sampleGripCurve({ points: [] }, 0.4)).toBe(1);
  });
});

describe("gripCurvePeak", () => {
  test("reads the far end of the plateau as the breakaway slip", () => {
    expect(gripCurvePeak(DEFAULT_GRIP_CURVE)).toEqual({ peakGrip: 1, peakSlip: 0.2, slideGrip: 0.55 });
  });
});
