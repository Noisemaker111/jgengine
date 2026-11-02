import { describe, expect, test } from "bun:test";
import { BASE_MODELS } from "@llmville/game/models/baseModels";
import { MODEL_TIER_BENCHMARK_BONUS } from "@llmville/game/models/servingStats";
import {
  computeEffectiveFrontierBenchmark,
  computeFrontierBenchmark,
  computeFrontierDecayMultiplier,
  FRONTIER_BASELINE,
  FRONTIER_CATALOG_BENCHMARK_CEILING,
  FRONTIER_DECAY_FLOOR,
  FRONTIER_MAX_BENCHMARK,
  FRONTIER_RISE_PER_DAY,
} from "@llmville/game/economy/frontier";

const DAY_MS = 24 * 60 * 60 * 1000;
const WORLD_CREATED_AT = Date.UTC(2030, 5, 1);
const STARTER_BENCHMARK = 62 + MODEL_TIER_BENCHMARK_BONUS.common;

function frontierAtDay(day: number, frontierOffset = 0): number {
  return computeEffectiveFrontierBenchmark({
    nowMs: WORLD_CREATED_AT + day * DAY_MS,
    gameCreatedAtMs: WORLD_CREATED_AT,
    frontierOffset,
  });
}

describe("frontier", () => {
  test("starts at the baseline for a brand new world", () => {
    expect(frontierAtDay(0)).toBe(FRONTIER_BASELINE);
    expect(computeFrontierBenchmark(WORLD_CREATED_AT, WORLD_CREATED_AT)).toBe(FRONTIER_BASELINE);
  });

  test("rises with the world's age, not with wall-clock history", () => {
    expect(frontierAtDay(10)).toBe(FRONTIER_BASELINE + 10 * FRONTIER_RISE_PER_DAY);
  });

  test("a first model trained at world start keeps full income", () => {
    expect(computeFrontierDecayMultiplier(STARTER_BENCHMARK, frontierAtDay(0))).toBe(1);
    expect(computeFrontierDecayMultiplier(STARTER_BENCHMARK, frontierAtDay(0))).toBeGreaterThanOrEqual(0.6);
  });

  test("a stale first model drifts toward the floor over about two weeks", () => {
    expect(computeFrontierDecayMultiplier(STARTER_BENCHMARK, frontierAtDay(7))).toBeGreaterThan(0.6);
    expect(computeFrontierDecayMultiplier(STARTER_BENCHMARK, frontierAtDay(14))).toBeLessThan(0.5);
    expect(computeFrontierDecayMultiplier(STARTER_BENCHMARK, frontierAtDay(21))).toBe(FRONTIER_DECAY_FLOOR);
  });

  test("global release offsets cannot push the frontier past the cap", () => {
    expect(frontierAtDay(0, 10_000)).toBe(FRONTIER_MAX_BENCHMARK);
    expect(frontierAtDay(10_000)).toBe(FRONTIER_MAX_BENCHMARK);
  });

  test("no catalog model outranks the ceiling the cap is built on", () => {
    const best = Math.max(...BASE_MODELS.map((model) => model.benchmarkScore ?? 0));
    expect(best).toBeLessThanOrEqual(FRONTIER_CATALOG_BENCHMARK_CEILING);
  });

  test("a per-world override wins over the curve", () => {
    expect(
      computeEffectiveFrontierBenchmark({
        nowMs: WORLD_CREATED_AT + 100 * DAY_MS,
        gameCreatedAtMs: WORLD_CREATED_AT,
        gameOverride: 55,
      }),
    ).toBe(55);
  });
});

describe("frontier on Modifiers", () => {
  test("clamp and release offset match the closed form across a sweep", () => {
    for (let day = 0; day <= 60; day += 0.75) {
      for (const offset of [-20, 0, 3, 5, 40]) {
        const raw = FRONTIER_BASELINE + day * FRONTIER_RISE_PER_DAY + offset;
        expect(frontierAtDay(day, offset)).toBe(Math.min(FRONTIER_MAX_BENCHMARK, Math.max(FRONTIER_BASELINE, raw)));
      }
    }
  });

  test("decay matches the closed form across a sweep", () => {
    for (let step = -5; step <= 40; step += 0.37) {
      const frontier = 60 + step;
      const gap = frontier - 60;
      const expected = gap <= 0 ? 1 : Math.max(FRONTIER_DECAY_FLOOR, 1 - gap * 0.04);
      expect(computeFrontierDecayMultiplier(60, frontier)).toBe(expected);
    }
  });
});
