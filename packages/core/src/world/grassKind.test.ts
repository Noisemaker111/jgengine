import { describe, expect, test } from "bun:test";

import { GRASS_DEFAULTS, readGrassRules, resolveGrassObject } from "./grassKind";

describe("readGrassRules", () => {
  test("fills defaults and reads overrides", () => {
    const rules = readGrassRules({ windStrength: 0.5, colorTip: "#fff" });
    expect(rules.windStrength).toBe(0.5);
    expect(rules.colorTip).toBe("#fff");
    expect(rules.density).toBe(GRASS_DEFAULTS.density);
  });
});

describe("resolveGrassObject", () => {
  test("sizes the patch from box half-extents at the box base", () => {
    const resolved = resolveGrassObject({ id: "meadow", kind: "grass_field", center: { x: 0, y: 4, z: 0 }, halfExtents: { x: 15, y: 2, z: 10 } });
    expect(resolved).not.toBeNull();
    expect(resolved!.size).toEqual([30, 20]);
    expect(resolved!.center[1]).toBe(2);
  });

  test("returns null without a center", () => {
    expect(resolveGrassObject({ id: "x", kind: "grass_field" })).toBeNull();
  });
});
