import { describe, expect, it } from "bun:test";
import {
  adaptExposure,
  DEFAULT_AUTO_EXPOSURE,
  exposureForKey,
  keyLuminanceFromSamples,
  METERING_HIGHLIGHT_CEILING,
  MID_GREY,
  WHITE_POINT,
} from "./colorPipeline";

describe("white point calibration", () => {
  it("prints white at exposure 1 and meters to an 18% grey card", () => {
    expect(WHITE_POINT).toBe(1);
    expect(MID_GREY).toBe(0.18);
    // A frame already sitting on 18% grey needs no correction.
    expect(exposureForKey(MID_GREY)).toBeCloseTo(1, 6);
  });
});

describe("exposureForKey", () => {
  it("lifts a dark interior to the top of the authored range instead of running away", () => {
    expect(exposureForKey(0.005)).toBe(DEFAULT_AUTO_EXPOSURE.max);
    expect(exposureForKey(0.02, { min: 0.5, max: 4 })).toBeCloseTo(4, 6);
  });

  it("pulls a blown-out exterior down to the bottom of the range", () => {
    expect(exposureForKey(6)).toBe(DEFAULT_AUTO_EXPOSURE.min);
    expect(exposureForKey(MID_GREY * 20, { min: 0.25, max: 2.5 })).toBe(0.25);
  });

  it("survives a zero or non-finite key by asking for the ceiling", () => {
    expect(exposureForKey(0)).toBe(DEFAULT_AUTO_EXPOSURE.max);
    expect(exposureForKey(Number.NaN)).toBe(DEFAULT_AUTO_EXPOSURE.max);
  });
});

describe("adaptExposure", () => {
  it("moves toward the target and settles there", () => {
    const once = adaptExposure(1, 2, 0.6, 0.6);
    expect(once).toBeGreaterThan(1);
    expect(once).toBeLessThan(2);
    let value = 1;
    for (let step = 0; step < 600; step += 1) value = adaptExposure(value, 2, 1 / 60, 0.6);
    expect(value).toBeCloseTo(2, 2);
  });

  it("keeps the current value for a zero-length step and jumps for a zero adaptation time", () => {
    expect(adaptExposure(1.2, 0.4, 0)).toBe(1.2);
    expect(adaptExposure(1.2, 0.4, 0.016, 0)).toBe(0.4);
  });
});

describe("keyLuminanceFromSamples", () => {
  it("reports the median so one bright patch does not set the key", () => {
    const key = keyLuminanceFromSamples([0.1, 0.1, 0.1, 8]);
    expect(key).toBe(0.1);
    const mixed = keyLuminanceFromSamples([0.05, 0.08, 0.2, 0.3, 9, 12, 14]);
    expect(mixed).toBe(0.3);
  });

  it("ignores pixels above the metering ceiling and empty or invalid samples", () => {
    expect(keyLuminanceFromSamples([METERING_HIGHLIGHT_CEILING, METERING_HIGHLIGHT_CEILING * 1000])).toBeCloseTo(METERING_HIGHLIGHT_CEILING, 6);
    expect(keyLuminanceFromSamples([0, Number.NaN, -1])).toBe(0);
    expect(keyLuminanceFromSamples([])).toBe(MID_GREY);
  });
});
