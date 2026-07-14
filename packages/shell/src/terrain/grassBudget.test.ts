import { devtools } from "@jgengine/core/devtools/devtools";
import { expect, test } from "bun:test";

import { DEFAULT_GRASS_COUNT, DEFAULT_GRASS_DENSITY, resolveGrassInstanceBudget } from "./grassBudget";
import { resolveGrassBladeGeometryOptions } from "./grassGeometry";

test("default grass count is mid-range friendly", () => {
  expect(DEFAULT_GRASS_COUNT).toBeLessThanOrEqual(2000);
  expect(resolveGrassBladeGeometryOptions({}).count).toBe(DEFAULT_GRASS_COUNT);
});

test("resolveGrassInstanceBudget scales blade count with patch area", () => {
  expect(resolveGrassInstanceBudget(10_000, 1, 10)).toBe(100);
  expect(resolveGrassInstanceBudget(10_000, 2, 10)).toBe(200);
  expect(resolveGrassInstanceBudget(10_000, 1, [20, 5])).toBe(100);
  expect(resolveGrassInstanceBudget(10_000, DEFAULT_GRASS_DENSITY, 10)).toBe(DEFAULT_GRASS_DENSITY * 100);
});

test("resolveGrassInstanceBudget clamps to the perf budget and negative density", () => {
  expect(resolveGrassInstanceBudget(6000, 10, 40, 1500)).toBe(1500);
  expect(resolveGrassInstanceBudget(1000, -1, 10)).toBe(0);
  expect(resolveGrassInstanceBudget(DEFAULT_GRASS_COUNT, 0.01, 4)).toBe(0);
});

test("resolveGrassInstanceBudget warns via devtools when the request is clamped", () => {
  devtools.logs.clear();
  resolveGrassInstanceBudget(500, 4, 40);
  const entries = devtools.logs.list();
  expect(entries.some((entry) => entry.level === "warn" && entry.message.includes("[jgengine:grass]"))).toBe(true);

  devtools.logs.clear();
  resolveGrassInstanceBudget(5000, 1, 10);
  expect(devtools.logs.list().length).toBe(0);
});
