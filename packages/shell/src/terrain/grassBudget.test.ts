import { expect, test } from "bun:test";

import { DEFAULT_GRASS_COUNT, resolveGrassInstanceBudget } from "./grassBudget";
import { resolveGrassBladeGeometryOptions } from "./grassGeometry";

test("default grass count is mid-range friendly", () => {
  expect(DEFAULT_GRASS_COUNT).toBeLessThanOrEqual(2000);
  expect(resolveGrassBladeGeometryOptions({}).count).toBe(DEFAULT_GRASS_COUNT);
});

test("resolveGrassInstanceBudget clamps density and budget", () => {
  expect(resolveGrassInstanceBudget(DEFAULT_GRASS_COUNT, 1)).toBe(DEFAULT_GRASS_COUNT);
  expect(resolveGrassInstanceBudget(6000, 1, 1500)).toBe(1500);
  expect(resolveGrassInstanceBudget(1000, 0.25)).toBe(250);
  expect(resolveGrassInstanceBudget(1000, -1)).toBe(0);
});
