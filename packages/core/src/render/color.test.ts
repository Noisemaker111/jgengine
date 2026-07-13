import { describe, expect, test } from "bun:test";
import { hexToRgb, mixHex, rgbToHex } from "./color";

describe("color", () => {
  test("hexToRgb splits channels", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });
  test("rgbToHex round-trips", () => {
    expect(rgbToHex(255, 128, 0)).toBe("#ff8000");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
  });
  test("mixHex interpolates and clamps ends", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#123456", "#abcdef", 0)).toBe("#123456");
    expect(mixHex("#123456", "#abcdef", 1)).toBe("#abcdef");
  });
});
