import { describe, expect, test } from "bun:test";

import {
  bandFogColor,
  bearingFromDirection,
  DEFAULT_DAY_AMBIENT_INTENSITY,
  DEFAULT_SUN_ELEVATION_DEG,
  sunDirectionFromBearing,
  DEFAULT_DAY_SUN_INTENSITY,
  daylightStateAt,
  overcastDaylight,
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

describe("sun, moon and fog through the day", () => {
  const channels = (hex: string) => [0, 2, 4].map((offset) => Number.parseInt(hex.slice(1 + offset, 3 + offset), 16));
  const luma = (hex: string) => {
    const [r, g, b] = channels(hex);
    return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  };

  test("the moon is up whenever the sun is down and vice versa", () => {
    for (const fraction of [0, 0.1, 0.9, 0.5, 0.25, 0.75]) {
      const state = daylightStateAt(fraction);
      expect(state.moonPosition[1] * state.sunPosition[1]).toBeLessThanOrEqual(0);
    }
    expect(daylightStateAt(0).moonPosition[1]).toBeGreaterThan(150);
    expect(daylightStateAt(0.5).moonPosition[1]).toBeLessThan(0);
  });

  test("midnight is moonlit, starry and fogged dark", () => {
    const midnight = daylightStateAt(0);
    expect(midnight.moonIntensity).toBeGreaterThan(0.05);
    expect(midnight.moonIntensity).toBeLessThan(0.4);
    expect(midnight.starOpacity).toBe(1);
    expect(luma(midnight.fogColor)).toBeLessThan(0.12);
    expect(channels(midnight.moonColor)[2]!).toBeGreaterThan(channels(midnight.moonColor)[0]!);
  });

  test("noon has no moon, no stars and the authored fog color", () => {
    const noon = daylightStateAt(0.5, { fogColor: "#b9cfd8", sunColor: "#fff0cf" });
    expect(noon.moonIntensity).toBe(0);
    expect(noon.starOpacity).toBe(0);
    expect(noon.fogColor).toBe("#b9cfd8");
    expect(noon.sunColor).toBe("#fff0cf");
  });

  test("the sun reddens toward the horizon while keeping its intensity", () => {
    const noon = daylightStateAt(0.5);
    const dusk = daylightStateAt(0.75);
    expect(channels(noon.sunColor)[2]!).toBeGreaterThan(channels(dusk.sunColor)[2]!);
    expect(channels(dusk.sunColor)[0]!).toBeGreaterThan(channels(dusk.sunColor)[2]!);
    expect(dusk.fogColor).toBe(dusk.skyBottom);
  });

  test("fog follows the sky at every hour instead of staying at its noon value", () => {
    const authored = { fogColor: "#b9cfd8" };
    const values = [0, 0.25, 0.5, 0.75].map((fraction) => daylightStateAt(fraction, authored).fogColor);
    expect(luma(values[0]!)).toBeLessThan(luma(values[2]!) / 3);
    expect(values[1]).not.toBe(values[2]);
    expect(luma(values[2]!)).toBeGreaterThan(luma(values[3]!));
  });

  test("config scales the moonlight with the authored sun", () => {
    const dim = daylightStateAt(0, { sunIntensity: 1 });
    const bright = daylightStateAt(0, { sunIntensity: 2 });
    expect(bright.moonIntensity).toBeCloseTo(dim.moonIntensity * 2, 6);
  });
});

describe("authored sun bearing", () => {
  const unit = (v: readonly [number, number, number]) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len] as const;
  };

  test("bearing 0 points toward -Z and 90 toward +X", () => {
    const north = sunDirectionFromBearing(0, 0);
    expect(north[0]).toBeCloseTo(0, 6);
    expect(north[2]).toBeCloseTo(-1, 6);
    const east = sunDirectionFromBearing(90, 0);
    expect(east[0]).toBeCloseTo(1, 6);
    expect(east[2]).toBeCloseTo(0, 6);
    expect(sunDirectionFromBearing(45, 90)[1]).toBeCloseTo(1, 6);
  });

  test("bearingFromDirection inverts sunDirectionFromBearing", () => {
    for (const [az, el] of [[129, 29], [0, 68], [270, 5], [359, 80]] as const) {
      const dir = sunDirectionFromBearing(az, el);
      const back = bearingFromDirection([dir[0] * 120, dir[1] * 120, dir[2] * 120]);
      expect(back.azimuth).toBeCloseTo(az, 4);
      expect(back.elevation).toBeCloseTo(el, 4);
    }
    expect(bearingFromDirection([0, 0, 0])).toEqual({ azimuth: 0, elevation: 90 });
  });

  test("a fixed sun lands the noon preset exactly on the authored bearing", () => {
    const noon = daylightStateAt(0.5, { sun: { azimuth: 129, elevation: 29 } });
    const expected = sunDirectionFromBearing(129, 29);
    const got = unit(noon.sunPosition);
    expect(got[0]).toBeCloseTo(expected[0], 6);
    expect(got[1]).toBeCloseTo(expected[1], 6);
    expect(got[2]).toBeCloseTo(expected[2], 6);
  });

  test("the day arc swings around the authored noon: dawn and dusk sit on the horizon 90 degrees away", () => {
    const sun = { azimuth: 129, elevation: 29 };
    const noon = unit(daylightStateAt(0.5, { sun }).sunPosition);
    const dawn = unit(daylightStateAt(0.25, { sun }).sunPosition);
    const dusk = unit(daylightStateAt(0.75, { sun }).sunPosition);
    expect(dawn[1]).toBeCloseTo(0, 6);
    expect(dusk[1]).toBeCloseTo(0, 6);
    const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(dawn, noon)).toBeCloseTo(0, 6);
    expect(dot(dawn, dusk)).toBeCloseTo(-1, 6);
    expect(daylightStateAt(0, { sun }).sunPosition[1]).toBeLessThan(0);
  });

  test("the default elevation reproduces the legacy noon height", () => {
    const legacy = unit(daylightStateAt(0.5).sunPosition);
    const authored = unit(daylightStateAt(0.5, { sun: { azimuth: 180, elevation: DEFAULT_SUN_ELEVATION_DEG } }).sunPosition);
    expect(authored[1]).toBeCloseTo(legacy[1], 6);
  });
});

describe("bandFogColor", () => {
  test("a static sky's banded fog follows the band, not the sky's authored fog", () => {
    expect(bandFogColor({ timeOfDay: false, cycle: "#000000", band: "#0e1224" })).toBe("#0e1224");
  });

  test("under a day cycle the sky owns the fog color, and an authored fog color is its noon", () => {
    expect(bandFogColor({ timeOfDay: true, cycle: "#101010", band: "#0e1224" })).toBe("#101010");
    expect(daylightStateAt(0.5, { fog: { color: "#7a4a24" } }).fogColor).toBe("#7a4a24");
    expect(daylightStateAt(0, { fog: { color: "#7a4a24" } }).fogColor).not.toBe("#7a4a24");
  });
});

describe("dayHold", () => {
  const noon = daylightStateAt(0.5);
  test("the noon sky holds through the afternoon, then dusk comes on its own clock", () => {
    const held = daylightStateAt(0.68, { dayHold: 0.2 });
    expect(held.skyTop).toBe(noon.skyTop);
    expect(held.sunIntensity).toBe(noon.sunIntensity);
    // Without a hold the afternoon is already most of the way to dusk.
    expect(daylightStateAt(0.68).skyTop).not.toBe(noon.skyTop);
    // Dusk and midnight are the same with or without a hold.
    expect(daylightStateAt(0.75, { dayHold: 0.2 }).skyTop).toBe(daylightStateAt(0.75).skyTop);
    expect(daylightStateAt(0, { dayHold: 0.2 }).skyTop).toBe(daylightStateAt(0).skyTop);
  });
});

describe("overcastDaylight", () => {
  const channelSpread = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const rgb = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
    return Math.max(...rgb) - Math.min(...rgb);
  };
  const brightness = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return ((value >> 16) & 0xff) + ((value >> 8) & 0xff) + (value & 0xff);
  };

  test("a clear sky is untouched; a storm greys the blue and dims the sun", () => {
    const noon = daylightStateAt(0.5);
    expect(overcastDaylight(noon, 0)).toBe(noon);
    const storm = overcastDaylight(noon, 1);
    expect(channelSpread(storm.skyTop)).toBeLessThan(channelSpread(noon.skyTop) / 3);
    expect(storm.sunIntensity).toBeCloseTo(noon.sunIntensity * 0.2, 6);
    expect(storm.ambientIntensity).toBeLessThan(noon.ambientIntensity);
    expect(storm.background).toBe(storm.skyBottom);
    // Half the cloud is half way.
    expect(overcastDaylight(noon, 0.5).sunIntensity).toBeCloseTo(noon.sunIntensity * 0.6, 6);
  });

  test("a stormy night stays as dark as the night, and hides the stars", () => {
    const night = daylightStateAt(0);
    const storm = overcastDaylight(night, 1);
    expect(brightness(storm.skyTop)).toBeLessThanOrEqual(brightness(night.skyTop));
    expect(storm.starOpacity).toBe(0);
  });
});

describe("night between twilights", () => {
  test("dusk's reds are gone by the small hours and dawn's start only shortly before sunrise", () => {
    const midnight = daylightStateAt(0);
    for (const fraction of [0.05, 0.12, 0.85, 0.95]) {
      const state = daylightStateAt(fraction, { dayHold: 0.2 });
      expect(state.skyBottom).toBe(midnight.skyBottom);
      expect(state.fogColor).toBe(midnight.fogColor);
    }
    expect(daylightStateAt(0.78).skyBottom).not.toBe(midnight.skyBottom);
    expect(daylightStateAt(0.22).skyBottom).not.toBe(midnight.skyBottom);
  });
});
