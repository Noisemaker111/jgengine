import { expect, test } from "bun:test";

import { createWeatherSeedAttributes, resolveWeatherInstanceCount } from "./weatherMath";

test("resolveWeatherInstanceCount clamps density", () => {
  expect(resolveWeatherInstanceCount(100, -1)).toBe(0);
  expect(resolveWeatherInstanceCount(100, 0.25)).toBe(25);
  expect(resolveWeatherInstanceCount(100, 3)).toBe(100);
  expect(resolveWeatherInstanceCount(100, Number.NaN)).toBe(0);
});

test("createWeatherSeedAttributes is deterministic", () => {
  const first = createWeatherSeedAttributes(3, 1234);
  const second = createWeatherSeedAttributes(3, 1234);
  expect(Array.from(first.spawn)).toEqual(Array.from(second.spawn));
  expect(Array.from(first.drift)).toEqual(Array.from(second.drift));
});
