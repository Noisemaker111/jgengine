import { describe, expect, test } from "bun:test";

import { evaluatePressure, type PressureReading, type PressureRule } from "@jgengine/core/ai/director/pressure";

const opening: PressureReading = { health: 1, progress: 0, elapsed: 0 };
const deep: PressureReading = { health: 1, progress: 0.85, elapsed: 260 };
const hurting: PressureReading = { health: 0.1, progress: 0.85, elapsed: 260 };

describe("encounter pressure", () => {
  test("a healthy player at the opening gets the authored composition", () => {
    const plan = evaluatePressure(opening);
    expect(plan.tier).toBe(0);
    expect(plan.countBonus).toBe(0);
    expect(plan.eliteSlots).toBe(0);
    expect(plan.cadenceScale).toBe(1);
    expect(plan.atCap).toBe(false);
  });

  test("a healthy player deep into a long run reaches the top tier", () => {
    const plan = evaluatePressure(deep, { timeFloorSeconds: 60, timeWindowSeconds: 300 });
    expect(plan.tier).toBe(2);
    expect(plan.countBonus).toBe(2);
    expect(plan.eliteSlots).toBe(1);
    expect(plan.cadenceScale).toBeLessThan(1);
    expect(plan.atCap).toBe(true);
    expect(plan.reason).toContain("health 1.00");
  });

  test("a hurt player is leaned on less than a healthy one at the same point", () => {
    const rule: PressureRule = { timeFloorSeconds: 60, timeWindowSeconds: 300 };
    expect(evaluatePressure(hurting, rule).tier).toBeLessThan(evaluatePressure(deep, rule).tier);
    expect(evaluatePressure({ ...deep, health: 0 }, rule).tier).toBeLessThanOrEqual(
      evaluatePressure(deep, rule).tier,
    );
  });

  test("the plan never exceeds the rule's documented bound", () => {
    const rule: PressureRule = { maxTier: 3, timeFloorSeconds: 30, timeWindowSeconds: 120 };
    const bound = 1 / (1 + (rule.maxTier ?? 2) / 2);
    const elapsedValues = [0, 30, 60, 119, 120, 600, 1e9];
    for (let health = 0; health <= 1.0001; health += 0.05) {
      for (let progress = 0; progress <= 1.0001; progress += 0.1) {
        for (const elapsed of elapsedValues) {
          const plan = evaluatePressure({ health, progress, elapsed }, rule);
          expect(plan.tier).toBeGreaterThanOrEqual(0);
          expect(plan.tier).toBeLessThanOrEqual(3);
          expect(plan.countBonus).toBeLessThanOrEqual(3);
          expect(plan.eliteSlots).toBeLessThanOrEqual(3);
          expect(plan.cadenceScale).toBeGreaterThanOrEqual(bound - 1e-9);
          expect(plan.cadenceScale).toBeLessThanOrEqual(1);
          expect(plan.index).toBeGreaterThanOrEqual(0);
          expect(plan.index).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test("a full-health player on a very long run sits exactly on the cap", () => {
    const early = evaluatePressure({ health: 1, progress: 1, elapsed: 200 }, { maxTier: 2 });
    const hourLater = evaluatePressure({ health: 1, progress: 1, elapsed: 3600 }, { maxTier: 2 });
    expect(hourLater.tier).toBe(2);
    expect(hourLater.tier).toBe(early.tier);
    expect(hourLater.countBonus).toBe(2);
    expect(hourLater.eliteSlots).toBe(1);
    expect(hourLater.atCap).toBe(true);
  });

  test("a rule with maxTier 0 never escalates", () => {
    for (const health of [0, 0.5, 1]) {
      const plan = evaluatePressure({ health, progress: 1, elapsed: 1e6 }, { maxTier: 0 });
      expect(plan.tier).toBe(0);
      expect(plan.countBonus).toBe(0);
      expect(plan.cadenceScale).toBe(1);
      expect(plan.atCap).toBe(true);
    }
  });

  test("better play never lowers the tier, and the call is pure", () => {
    const rule: PressureRule = {};
    const reading = { health: 0.6, progress: 0.5, elapsed: 120 };
    const before = JSON.stringify(reading);
    const a = evaluatePressure(reading, rule);
    const b = evaluatePressure(reading, rule);
    expect(a).toEqual(b);
    expect(JSON.stringify(reading)).toBe(before);
    expect(evaluatePressure({ ...reading, health: 0.9 }, rule).tier).toBeGreaterThanOrEqual(a.tier);
    expect(evaluatePressure({ ...reading, progress: 0.2 }, rule).tier).toBeLessThanOrEqual(a.tier);
  });
});
