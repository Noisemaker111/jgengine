import { describe, expect, test } from "bun:test";

import { createMultiRegionHealth, type MultiRegionHealthConfig } from "./regionHealth";

const config: MultiRegionHealthConfig = {
  regions: [
    { id: "head", label: "Head", max: 35, vital: true, vulnerability: 2 },
    { id: "thorax", label: "Thorax", max: 85, vital: true },
    { id: "leftLeg", label: "Left Leg", max: 65 },
    { id: "rightLeg", label: "Right Leg", max: 65 },
  ],
  ailments: {
    bleed: { id: "bleed", label: "Bleeding", region: "thorax", severity: "critical", drainPerSecond: 2, stacking: true, treatedBy: ["bandage"] },
    fracture: { id: "fracture", label: "Fractured", region: "leftLeg", severity: "warning", treatedBy: ["splint"] },
  },
};

describe("createMultiRegionHealth", () => {
  test("damage is localized and scaled by vulnerability", () => {
    const health = createMultiRegionHealth(config);
    const result = health.damage("head", 10);
    expect(result.applied).toBe(20);
    expect(health.region("head").current).toBe(15);
    expect(health.region("thorax").current).toBe(85);
  });

  test("emptying a vital part kills; a limb does not", () => {
    const health = createMultiRegionHealth(config);
    health.damage("leftLeg", 999);
    expect(health.region("leftLeg").current).toBe(0);
    expect(health.dead).toBe(false);
    health.damage("thorax", 999);
    expect(health.dead).toBe(true);
  });

  test("overall aggregates across parts", () => {
    const health = createMultiRegionHealth(config);
    expect(health.overall()).toBeCloseTo(1, 5);
    health.damage("thorax", 85);
    const expected = (35 + 0 + 65 + 65) / (35 + 85 + 65 + 65);
    expect(health.overall()).toBeCloseTo(expected, 5);
  });

  test("stacking ailment drains its region over game time and can kill", () => {
    const health = createMultiRegionHealth(config);
    health.applyAilment("bleed");
    health.applyAilment("bleed");
    expect(health.ailments()).toEqual([{ id: "bleed", stacks: 2 }]);
    health.tick(10);
    expect(health.region("thorax").current).toBe(85 - 2 * 2 * 10);
  });

  test("treatment item clears one stack of matching ailments", () => {
    const health = createMultiRegionHealth(config);
    health.applyAilment("bleed");
    health.applyAilment("bleed");
    health.applyAilment("fracture");
    const treated = health.treat("bandage");
    expect(treated.treated).toEqual(["bleed"]);
    expect(health.ailments()).toEqual([
      { id: "bleed", stacks: 1 },
      { id: "fracture", stacks: 1 },
    ]);
    health.treat("splint");
    expect(health.ailments()).toEqual([{ id: "bleed", stacks: 1 }]);
  });

  test("non-stacking ailment refreshes instead of stacking", () => {
    const health = createMultiRegionHealth(config);
    health.applyAilment("fracture");
    health.applyAilment("fracture");
    expect(health.ailments()).toEqual([{ id: "fracture", stacks: 1 }]);
  });

  test("ailment moodles carry stacks and treatment note", () => {
    const health = createMultiRegionHealth(config);
    health.applyAilment("bleed");
    health.applyAilment("bleed");
    const moodles = health.ailmentMoodles();
    expect(moodles).toHaveLength(1);
    expect(moodles[0]!.stacks).toBe(2);
    expect(moodles[0]!.source).toBe("ailment");
    expect(moodles[0]!.note).toBe("needs bandage");
  });

  test("unknown region or ailment throws", () => {
    const health = createMultiRegionHealth(config);
    expect(() => health.damage("tail", 1)).toThrow();
    expect(() => health.applyAilment("plague")).toThrow();
  });
});
