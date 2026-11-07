import { expect, test } from "bun:test";

import { emptyPlot, growPlot, PLOT } from "./farm";

const planted = { ...emptyPlot(), seed: "mejoberry_seed" };

test("a planted seed grows only with both water and fertilizer, and uses them as it grows", () => {
  expect(growPlot({ ...planted, water: 50 }, 60, 0).growth).toBe(0);
  expect(growPlot({ ...planted, fertilizer: 50 }, 60, 0).growth).toBe(0);
  const fed = growPlot({ ...planted, water: 50, fertilizer: 50 }, 60, 0);
  expect(fed.growth).toBeCloseTo(60 / PLOT.growSeconds);
  expect(fed.water).toBeCloseTo(50 - PLOT.waterUse * 60);
  expect(fed.fertilizer).toBeCloseTo(50 - PLOT.fertilizerUse * 60);
});

test("rain fills a plot's water up to its limit, planted or not, and bare soil never grows", () => {
  expect(growPlot(emptyPlot(), 10, 1).water).toBe(PLOT.rainFill * 10);
  expect(growPlot(emptyPlot(), 1000, 1).water).toBe(PLOT.waterMax);
  expect(growPlot({ ...emptyPlot(), water: 50, fertilizer: 50 }, 60, 0).growth).toBe(0);
});

test("a ripe crop stops growing and stops drinking", () => {
  const ripe = growPlot({ ...planted, water: 50, fertilizer: 50, growth: 1 }, 60, 0);
  expect(ripe).toEqual({ ...planted, water: 50, fertilizer: 50, growth: 1 });
});
