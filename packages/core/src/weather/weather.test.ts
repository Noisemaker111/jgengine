import { describe, expect, test } from "bun:test";

import {
  resolveWeather,
  type WeatherModifierTable,
  type WeatherState,
} from "./weather";

const table: WeatherModifierTable = {
  clear: {},
  rain: { grip: 0.6, visibility: 0.7, spread: 0.3, chill: -4 },
  storm: { grip: 0.4, visibility: 0.4, structureDamage: 5, ignition: 0.2, spread: 0.2 },
};

describe("resolveWeather", () => {
  test("clear weather is neutral", () => {
    const out = resolveWeather({ kind: "clear", intensity: 1 }, table);
    expect(out).toEqual({ grip: 1, visibility: 1, structureDamage: 0, chill: 0, ignition: 0, spread: 1 });
  });

  test("multipliers interpolate from neutral by intensity (Grounded mud)", () => {
    const half = resolveWeather({ kind: "rain", intensity: 0.5 }, table);
    expect(half.grip).toBeCloseTo(0.8, 5);
    expect(half.visibility).toBeCloseTo(0.85, 5);
    expect(half.spread).toBeCloseTo(0.65, 5);
  });

  test("rate effects scale linearly (Icarus storm damage)", () => {
    const full = resolveWeather({ kind: "storm", intensity: 1 }, table);
    expect(full.structureDamage).toBe(5);
    expect(full.ignition).toBeCloseTo(0.2, 5);
    const quarter = resolveWeather({ kind: "storm", intensity: 0.25 }, table);
    expect(quarter.structureDamage).toBeCloseTo(1.25, 5);
  });

  test("unknown kind throws with the catalog keys", () => {
    expect(() => resolveWeather({ kind: "fog", intensity: 1 }, table)).toThrow(
      /Unknown weather kind "fog".*Known kinds: clear, rain, storm/,
    );
  });

  test("table keys are the static weather catalog", () => {
    const kinds = Object.keys(table).sort();
    expect(kinds).toEqual(["clear", "rain", "storm"]);
    for (const kind of kinds) {
      expect(resolveWeather({ kind, intensity: 0 }, table).grip).toBe(1);
    }
  });
});
