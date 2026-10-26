import { describe, expect, test } from "bun:test";

import {
  airMass,
  elevationOf,
  MOONLIGHT_COLOR,
  MOONLIGHT_PEAK,
  moonIllumination,
  starOpacity,
  sunlightColor,
  sunTransmission,
} from "./physicalSky";

const luma = (rgb: readonly number[]) => 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;

describe("airMass", () => {
  test("is 1 at the zenith and grows toward the horizon", () => {
    expect(airMass(90)).toBeCloseTo(1, 2);
    expect(airMass(45)).toBeGreaterThan(1.3);
    expect(airMass(45)).toBeLessThan(1.6);
    expect(airMass(5)).toBeGreaterThan(10);
    expect(airMass(0)).toBeGreaterThan(airMass(5));
  });

  test("clamps below the horizon instead of diverging", () => {
    expect(Number.isFinite(airMass(-20))).toBe(true);
    expect(airMass(-20)).toBe(airMass(0));
  });
});

describe("sunTransmission", () => {
  test("high sun keeps the most light in every channel", () => {
    const zenith = sunTransmission(90);
    const low = sunTransmission(2);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(zenith[channel]!).toBeGreaterThan(low[channel]!);
      expect(zenith[channel]!).toBeGreaterThan(0.7);
    }
  });

  test("a low sun loses blue before green before red", () => {
    const low = sunTransmission(2);
    expect(low[0]!).toBeGreaterThan(low[1]!);
    expect(low[1]!).toBeGreaterThan(low[2]!);
    expect(low[2]!).toBeLessThan(0.1);
  });
});

const channels = (hex: string) => [0, 2, 4].map((offset) => Number.parseInt(hex.slice(1 + offset, 3 + offset), 16));

describe("sunlightColor", () => {
  test("is near white overhead", () => {
    const [r, g, b] = channels(sunlightColor(90));
    expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThan(60);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(180);
  });

  test("turns orange at the horizon and reddens monotonically as it drops", () => {
    const at = (elevation: number) => channels(sunlightColor(elevation));
    const high = at(60);
    const low = at(4);
    expect(low[0]!).toBeGreaterThan(low[1]!);
    expect(low[1]!).toBeGreaterThan(low[2]!);
    expect(low[0]! - low[2]!).toBeGreaterThan(high[0]! - high[2]!);
    expect(at(15)[2]!).toBeGreaterThan(at(4)[2]!);
  });

  test("reads as moon blue once the sun is well under the horizon", () => {
    expect(sunlightColor(-10)).toBe(MOONLIGHT_COLOR);
  });
});

describe("moonIllumination", () => {
  test("is dark while the moon is below the horizon and peaks overhead", () => {
    expect(moonIllumination(-5)).toBe(0);
    expect(moonIllumination(0)).toBe(0);
    expect(moonIllumination(90)).toBeCloseTo(MOONLIGHT_PEAK, 6);
    expect(moonIllumination(30)).toBeGreaterThan(0);
    expect(moonIllumination(30)).toBeLessThan(moonIllumination(60));
  });

  test("stays far below the sun so night never reads as day", () => {
    expect(moonIllumination(90)).toBeLessThan(0.2);
  });
});

describe("starOpacity", () => {
  test("is zero in daylight, full once the sun is 6 degrees under", () => {
    expect(starOpacity(20)).toBe(0);
    expect(starOpacity(0)).toBe(0);
    expect(starOpacity(-6)).toBe(1);
    expect(starOpacity(-3)).toBeGreaterThan(0);
    expect(starOpacity(-3)).toBeLessThan(1);
  });
});

describe("elevationOf", () => {
  test("reads the y component of a direction in degrees", () => {
    expect(elevationOf([0, 1, 0])).toBeCloseTo(90, 6);
    expect(elevationOf([1, 0, 0])).toBeCloseTo(0, 6);
    expect(elevationOf([0, 0, 0])).toBe(90);
    expect(luma([255, 255, 255])).toBeCloseTo(255, 6);
  });
});
