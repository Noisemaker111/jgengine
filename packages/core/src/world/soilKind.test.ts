import { describe, expect, test } from "bun:test";

import { SOIL_DEFAULTS, readSoilRules, resolveSoilObject } from "./soilKind";

describe("readSoilRules", () => {
  test("fills defaults and reads overrides", () => {
    const rules = readSoilRules({ crackIntensity: 0.9, mossColor: "#0f0" });
    expect(rules.crackIntensity).toBe(0.9);
    expect(rules.mossColor).toBe("#0f0");
    expect(rules.crackScale).toBe(SOIL_DEFAULTS.crackScale);
  });

  test("clamps crackIntensity and mossCoverage to 0..1", () => {
    expect(readSoilRules({ crackIntensity: 5 }).crackIntensity).toBe(1);
    expect(readSoilRules({ crackIntensity: -5 }).crackIntensity).toBe(0);
    expect(readSoilRules({ mossCoverage: 5 }).mossCoverage).toBe(1);
  });
});

describe("resolveSoilObject", () => {
  test("sizes the patch from box half-extents at the box base", () => {
    const resolved = resolveSoilObject({ id: "cracked", kind: "soil", center: { x: 0, y: 4, z: 0 }, halfExtents: { x: 8, y: 1, z: 5 } });
    expect(resolved).not.toBeNull();
    expect(resolved!.size).toEqual([16, 10]);
    expect(resolved!.center[1]).toBe(3);
  });

  test("returns null without a center", () => {
    expect(resolveSoilObject({ id: "x", kind: "soil" })).toBeNull();
  });
});
