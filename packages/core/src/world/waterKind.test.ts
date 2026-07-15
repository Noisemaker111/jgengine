import { describe, expect, test } from "bun:test";

import { readWaterRules, resolveWaterObject, WATER_DEFAULTS } from "./waterKind";

describe("readWaterRules", () => {
  test("fills defaults and clamps opacity", () => {
    const rules = readWaterRules({ opacity: 5, color: "#000" });
    expect(rules.opacity).toBe(1);
    expect(rules.color).toBe("#000");
    expect(rules.waveHeight).toBe(WATER_DEFAULTS.waveHeight);
  });
});

describe("resolveWaterObject", () => {
  test("sizes the plane from box half-extents and lifts to the box top", () => {
    const resolved = resolveWaterObject({
      id: "pond",
      kind: "water",
      center: { x: 5, y: 2, z: -3 },
      halfExtents: { x: 8, y: 1, z: 6 },
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.size).toEqual([16, 12]);
    expect(resolved!.center).toEqual([5, 3, -3]);
  });

  test("falls back to radius footprint", () => {
    const resolved = resolveWaterObject({ id: "p", kind: "water", center: { x: 0, y: 0, z: 0 }, radius: 5 });
    expect(resolved!.size).toEqual([10, 10]);
  });

  test("returns null without a center", () => {
    expect(resolveWaterObject({ id: "p", kind: "water" })).toBeNull();
  });
});
