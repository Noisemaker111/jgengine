import { describe, expect, test } from "bun:test";
import { formatDistance } from "./distance";

describe("formatDistance", () => {
  test("meters by default", () => {
    expect(formatDistance(42)).toBe("42m");
    expect(formatDistance(0)).toBe("0m");
  });
  test("meters with decimals", () => {
    expect(formatDistance(12.34, { decimals: 1 })).toBe("12.3m");
  });
  test("forced km", () => {
    expect(formatDistance(1500, { unit: "km" })).toBe("1.5km");
  });
  test("auto switches to km at 1000m", () => {
    expect(formatDistance(999, { unit: "auto" })).toBe("999m");
    expect(formatDistance(1000, { unit: "auto" })).toBe("1.0km");
    expect(formatDistance(2500, { unit: "auto", decimals: 2 })).toBe("2.50km");
  });
  test("showUnit false returns bare number", () => {
    expect(formatDistance(42, { showUnit: false })).toBe("42");
    expect(formatDistance(1500, { unit: "km", showUnit: false })).toBe("1.5");
  });
  test("negative distance clamps to zero", () => {
    expect(formatDistance(-5)).toBe("0m");
  });
});
