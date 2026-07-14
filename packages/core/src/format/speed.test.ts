import { describe, expect, test } from "bun:test";
import { formatSpeed } from "./speed";

describe("formatSpeed", () => {
  test("km/h by default", () => {
    expect(formatSpeed(10)).toBe("36 km/h");
    expect(formatSpeed(0)).toBe("0 km/h");
  });
  test("m/s passthrough", () => {
    expect(formatSpeed(12.345, { unit: "ms", decimals: 1 })).toBe("12.3 m/s");
  });
  test("mph conversion", () => {
    expect(formatSpeed(10, { unit: "mph", decimals: 1 })).toBe("22.4 mph");
  });
  test("knots conversion", () => {
    expect(formatSpeed(10, { unit: "knots", decimals: 1 })).toBe("19.4 kn");
  });
  test("decimals", () => {
    expect(formatSpeed(10, { decimals: 2 })).toBe("36.00 km/h");
  });
  test("showUnit false returns bare number", () => {
    expect(formatSpeed(10, { showUnit: false })).toBe("36");
  });
  test("negative speed clamps to zero", () => {
    expect(formatSpeed(-5)).toBe("0 km/h");
  });
});
