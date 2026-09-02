import { describe, expect, test } from "bun:test";
import { pixelPerfectFrustum, snapPixelPerfectPosition } from "./pixelPerfect";

describe("pixelPerfectFrustum", () => {
  test("maps viewport pixels to world units", () => {
    expect(pixelPerfectFrustum({ width: 320, height: 180 }, 16)).toEqual({
      left: -10,
      right: 10,
      top: 5.625,
      bottom: -5.625,
      zoom: 16,
      scale: 1,
    });
  });

  test("uses the largest integer density multiplier", () => {
    const result = pixelPerfectFrustum({ width: 640, height: 360 }, 16, true);
    expect(result.scale).toBe(22);
    expect(result.zoom).toBe(352);
    expect(result.right - result.left).toBeCloseTo(640 / 352);
  });
});

test("snapPixelPerfectPosition rounds every camera axis to the pixel grid", () => {
  expect(snapPixelPerfectPosition({ x: 0.11, y: 1.24, z: -2.17 }, 10)).toEqual({ x: 0.1, y: 1.2, z: -2.2 });
});
