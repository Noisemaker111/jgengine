import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DAY_AMBIENT_INTENSITY,
  DEFAULT_DAY_SUN_INTENSITY,
  daylightStateAt,
  lerpHexColor,
} from "./daylightCycle";

describe("daylightStateAt", () => {
  test("noon is the brightest point with the sun high overhead", () => {
    const noon = daylightStateAt(0.5);
    expect(noon.sunIntensity).toBeCloseTo(DEFAULT_DAY_SUN_INTENSITY, 6);
    expect(noon.ambientIntensity).toBeCloseTo(DEFAULT_DAY_AMBIENT_INTENSITY, 6);
    expect(noon.sunPosition[1]).toBeGreaterThan(150);
    expect(Math.abs(noon.sunPosition[0])).toBeLessThan(1);
  });

  test("midnight puts the sun below the horizon with night colors", () => {
    const midnight = daylightStateAt(0);
    expect(midnight.sunPosition[1]).toBeLessThan(0);
    expect(midnight.sunIntensity).toBeLessThan(0.1);
    expect(midnight.ambientIntensity).toBeLessThan(0.15);
    expect(midnight.skyTop).toBe("#02030a");
    expect(midnight.skyBottom).toBe("#05070f");
    expect(midnight.background).toBe(midnight.skyBottom);
  });

  test("dawn and dusk sit strictly between midnight and noon", () => {
    const midnight = daylightStateAt(0);
    const noon = daylightStateAt(0.5);
    const dawn = daylightStateAt(0.25);
    const dusk = daylightStateAt(0.75);

    for (const twilight of [dawn, dusk]) {
      expect(twilight.sunIntensity).toBeGreaterThan(midnight.sunIntensity);
      expect(twilight.sunIntensity).toBeLessThan(noon.sunIntensity);
      expect(twilight.ambientIntensity).toBeGreaterThan(midnight.ambientIntensity);
      expect(twilight.ambientIntensity).toBeLessThan(noon.ambientIntensity);
      expect(Math.abs(twilight.sunPosition[1])).toBeLessThan(5);
    }
  });

  test("the sun sweeps from below horizon to zenith and back through the day", () => {
    const samples = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(
      (dayFraction) => daylightStateAt(dayFraction).sunPosition[1],
    );
    for (let index = 1; index < 5; index += 1) {
      expect(samples[index]!).toBeGreaterThan(samples[index - 1]!);
    }
    for (let index = 5; index < samples.length; index += 1) {
      expect(samples[index]!).toBeLessThan(samples[index - 1]!);
    }
    expect(samples[0]).toBeCloseTo(samples[8]!, 6);
  });

  test("wraps dayFraction outside [0, 1)", () => {
    expect(daylightStateAt(1.5)).toEqual(daylightStateAt(0.5));
    expect(daylightStateAt(-0.25)).toEqual(daylightStateAt(0.75));
  });

  test("config overrides drive the noon peak colors and intensities", () => {
    const noon = daylightStateAt(0.5, {
      horizonColor: "#ff0000",
      zenithColor: "#0000ff",
      sunIntensity: 2,
      ambientIntensity: 0.9,
    });
    expect(noon.skyBottom).toBe("#ff0000");
    expect(noon.skyTop).toBe("#0000ff");
    expect(noon.sunIntensity).toBeCloseTo(2, 6);
    expect(noon.ambientIntensity).toBeCloseTo(0.9, 6);

    const midnight = daylightStateAt(0, {
      horizonColor: "#ff0000",
      zenithColor: "#0000ff",
      sunIntensity: 2,
      ambientIntensity: 0.9,
    });
    expect(midnight.skyBottom).toBe("#05070f");
    expect(midnight.sunIntensity).toBeCloseTo(0.02, 6);
  });
});

describe("lerpHexColor", () => {
  test("interpolates channel-by-channel", () => {
    expect(lerpHexColor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpHexColor("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(lerpHexColor("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
