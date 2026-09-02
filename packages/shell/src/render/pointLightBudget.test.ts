import { describe, expect, test } from "bun:test";

import { POINT_LIGHT_BUDGET, resolvePointLightBudget } from "./SceneLighting";

describe("point light budget", () => {
  test("keeps authored lights under the budget", () => {
    const lights = Array.from({ length: POINT_LIGHT_BUDGET }, (_, i) => ({ position: [i, 2, i] as [number, number, number] }));
    expect(resolvePointLightBudget(lights)).toBe(lights);
  });

  test("clamps over-budget lights", () => {
    const lights = Array.from({ length: POINT_LIGHT_BUDGET + 2 }, (_, i) => ({ position: [i, 2, i] as [number, number, number] }));
    expect(resolvePointLightBudget(lights)).toHaveLength(POINT_LIGHT_BUDGET);
  });
});
