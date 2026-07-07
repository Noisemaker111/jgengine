import { describe, expect, test } from "bun:test";

import { buildBenchWorld } from "./benchState";
import { DEFAULT_PARAMS, resolveParams } from "./params";

describe("resolveParams", () => {
  test("falls back to defaults on an empty query", () => {
    expect(resolveParams("")).toEqual(DEFAULT_PARAMS);
  });

  test("reads URL overrides and rejects garbage", () => {
    const p = resolveParams("?small=500&large=12&chaos=3&seed=9");
    expect(p.small).toBe(500);
    expect(p.large).toBe(12);
    expect(p.chaos).toBe(3);
    expect(p.seed).toBe(9);
    expect(resolveParams("?small=notanumber").small).toBe(DEFAULT_PARAMS.small);
  });
});

describe("buildBenchWorld", () => {
  const params = { small: 800, large: 10, chaos: 4, layers: 2, seed: 7, gravity: -20, cellSize: 1 };

  test("populates every requested body with capacity to match", () => {
    const state = buildBenchWorld(params);
    expect(state.world.count).toBe(params.small + params.large + params.chaos);
    expect(state.world.capacity).toBe(state.world.count);
    expect(state.chaosCount).toBe(params.chaos);
    expect(state.baseColors.length).toBe(state.world.capacity * 3);
  });

  test("the bed starts asleep and the chaos cubes start awake", () => {
    const state = buildBenchWorld(params);
    let sleeping = 0;
    for (let i = 0; i < params.small; i += 1) if (state.world.isSleeping(i)) sleeping += 1;
    expect(sleeping).toBe(params.small);
    for (let i = state.chaosStart; i < state.chaosStart + state.chaosCount; i += 1) {
      expect(state.world.isSleeping(i)).toBe(false);
    }
  });

  test("bodies fit inside the container bounds", () => {
    const state = buildBenchWorld(params);
    for (let i = 0; i < state.world.count; i += 1) {
      expect(state.world.posX[i]!).toBeGreaterThanOrEqual(state.bounds.min[0]);
      expect(state.world.posX[i]!).toBeLessThanOrEqual(state.bounds.max[0]);
      expect(state.world.posZ[i]!).toBeGreaterThanOrEqual(state.bounds.min[2]);
      expect(state.world.posZ[i]!).toBeLessThanOrEqual(state.bounds.max[2]);
    }
  });

  test("the seeded scene is reproducible", () => {
    const a = buildBenchWorld(params);
    const b = buildBenchWorld(params);
    for (let i = 0; i < a.world.count; i += 1) {
      expect(a.world.posX[i]!).toBe(b.world.posX[i]!);
      expect(a.world.velX[i]!).toBe(b.world.velX[i]!);
    }
  });
});
