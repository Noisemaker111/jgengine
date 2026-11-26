import { expect, test } from "bun:test";
import { gateTimingMs } from "../../../../../scripts/timing-budget";
import { ACER_SACCHARUM } from "../species/data/acerSaccharum";
import { OPEN_TEMPERATE_SITE } from "./plantEnvironment";
import { createPlantGrowth } from "./plantGrowth";

test("a sugar maple grows from seed to 400 years within budget", () => {
  const started = performance.now();
  const plant = createPlantGrowth(ACER_SACCHARUM, OPEN_TEMPERATE_SITE, "perf");
  plant.step(400);
  const elapsed = performance.now() - started;
  const stats = plant.stats();
  expect(stats.alive).toBe(true);
  // Fastest run 3.6 s on the recording machine (2026-10-28, #2699 target 4 s); the budget is about 2x.
  gateTimingMs("plant growth, Acer saccharum seed to 400 years", [elapsed], 7_500, `${stats.maxNodesSeen} nodes at most`);
}, 120_000);
