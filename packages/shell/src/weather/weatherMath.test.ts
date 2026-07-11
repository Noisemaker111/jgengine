import { expect, test } from "bun:test";

import {
  createWeatherSeedAttributes,
  DEFAULT_RAIN_COUNT,
  DEFAULT_SNOW_COUNT,
  resolveWeatherInstanceCount,
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
});
