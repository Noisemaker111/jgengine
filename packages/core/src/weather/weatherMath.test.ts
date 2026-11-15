import { expect, test } from "bun:test";

import {
  createWeatherSeedAttributes,
  DEFAULT_RAIN_COUNT,
  DEFAULT_SNOW_COUNT,
  resolveWeatherInstanceCount,
  weatherBoundsCoverage,
  weatherBoundsReach,
} from "./weatherMath";

test("resolveWeatherInstanceCount clamps density", () => {
  expect(resolveWeatherInstanceCount(100, -1)).toBe(0);
  expect(resolveWeatherInstanceCount(100, 0.25)).toBe(25);
  expect(resolveWeatherInstanceCount(100, 3)).toBe(100);
  expect(resolveWeatherInstanceCount(100, Number.NaN)).toBe(0);
});

test("resolveWeatherInstanceCount honors budget caps", () => {
  expect(resolveWeatherInstanceCount(8000, 1, 500)).toBe(500);
  expect(resolveWeatherInstanceCount(2000, 0.5, 300)).toBe(150);
});

test("default particle budgets are mid-range friendly", () => {
  expect(DEFAULT_RAIN_COUNT).toBeLessThanOrEqual(2500);
  expect(DEFAULT_SNOW_COUNT).toBeLessThanOrEqual(2000);
  expect(resolveWeatherInstanceCount(DEFAULT_RAIN_COUNT, 0.45)).toBeLessThanOrEqual(1200);
});

test("createWeatherSeedAttributes is deterministic", () => {
  const first = createWeatherSeedAttributes(3, 1234);
  const second = createWeatherSeedAttributes(3, 1234);
  expect(Array.from(first.spawn)).toEqual(Array.from(second.spawn));
  expect(Array.from(first.drift)).toEqual(Array.from(second.drift));
  const other = createWeatherSeedAttributes(3, 1235);
  expect(Array.from(other.spawn)).not.toEqual(Array.from(first.spawn));
  for (const value of [...first.spawn, ...first.drift]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
});

test("lightning envelope freezes, rewinds and repeats from simulation time and seed", async () => {
  const { lightningStrikeEnvelope } = await import("./weatherMath");
  const sampled = lightningStrikeEnvelope(5.05, 5, 0.18, 123);
  expect(sampled).toBeGreaterThan(0);
  expect(lightningStrikeEnvelope(5.05, 5, 0.18, 123)).toBe(sampled);
  expect(lightningStrikeEnvelope(4.9, 5, 0.18, 123)).toBe(0);
  expect(lightningStrikeEnvelope(5.2, 5, 0.18, 123)).toBe(0);
  expect(lightningStrikeEnvelope(5.05, 5, 0.18, 124)).not.toBe(sampled);
});

test("weatherBoundsCoverage is full inside, eases out across the fade and is zero past it", () => {
  const bounds = { minX: -10, minZ: 100, maxX: 10, maxZ: 200, fade: 8 };
  expect(weatherBoundsCoverage(undefined, 5000, 5000)).toBe(1);
  expect(weatherBoundsCoverage(bounds, 0, 150)).toBe(1);
  expect(weatherBoundsCoverage(bounds, 10, 200)).toBe(1);
  expect(weatherBoundsCoverage(bounds, 0, 96)).toBeCloseTo(0.5, 5);
  expect(weatherBoundsCoverage(bounds, 0, 92)).toBe(0);
  expect(weatherBoundsCoverage(bounds, 0, -400)).toBe(0);
  // Corners measure the true distance, not the larger axis.
  expect(weatherBoundsCoverage(bounds, 16, 206)).toBe(0);
  expect(weatherBoundsCoverage(bounds, 13, 203)).toBeGreaterThan(0);
});

test("weatherBoundsReach skips a field whose wrap volume cannot touch its bounds", () => {
  const bounds = { minX: -10, minZ: 100, maxX: 10, maxZ: 200 };
  expect(weatherBoundsReach(undefined, 0, -9000, 60, 60)).toBe(true);
  expect(weatherBoundsReach(bounds, 0, 150, 60, 60)).toBe(true);
  expect(weatherBoundsReach(bounds, 0, 40, 60, 60)).toBe(true);
  expect(weatherBoundsReach(bounds, 0, -100, 60, 60)).toBe(false);
  expect(weatherBoundsReach(bounds, 200, 150, 60, 60)).toBe(false);
});
