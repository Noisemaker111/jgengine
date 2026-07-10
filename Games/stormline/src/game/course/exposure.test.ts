import { describe, expect, test } from "bun:test";
import { OUTER_BAND_METERS } from "./catalog";
import { advanceExposure, EXPOSURE_MAX } from "./exposure";

describe("stormline exposure meter", () => {
  test("decays toward zero when the lead is outside the outer band", () => {
    let exposure = 40;
    for (let i = 0; i < 20; i += 1) exposure = advanceExposure(exposure, OUTER_BAND_METERS + 200, 0.5);
    expect(exposure).toBe(0);
  });

  test("rises when the lead is inside the outer band", () => {
    const next = advanceExposure(10, OUTER_BAND_METERS - 30, 1);
    expect(next).toBeGreaterThan(10);
  });

  test("rises faster the deeper inside the band the lead falls", () => {
    const shallow = advanceExposure(0, OUTER_BAND_METERS - 10, 1);
    const deep = advanceExposure(0, 0, 1);
    expect(deep).toBeGreaterThan(shallow);
  });

  test("clamps at the max and represents the lose trigger", () => {
    let exposure = 0;
    for (let i = 0; i < 200; i += 1) exposure = advanceExposure(exposure, -50, 1);
    expect(exposure).toBe(EXPOSURE_MAX);
  });

  test("never drops below zero", () => {
    let exposure = 5;
    for (let i = 0; i < 50; i += 1) exposure = advanceExposure(exposure, 10_000, 1);
    expect(exposure).toBe(0);
  });
});
