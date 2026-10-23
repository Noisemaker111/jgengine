import { describe, expect, test } from "bun:test";

import { evaluatePressure, type PressureReading, type PressureRule } from "@jgengine/core/ai/director/pressure";

const calm: PressureReading = { health: 1, progress: 0.8, elapsed: 10 };
const struggling: PressureReading = { health: 0.15, progress: 0.2, elapsed: 200 };

describe("encounter pressure", () => {
  test("a healthy player near the end of the encounter gets the authored composition", () => {
    const plan = evaluatePressure(calm);
    expect(plan.tier).toBe(0);
    expect(plan.countBonus).toBe(0);
    expect(plan.eliteSlots).toBe(0);
    expect(plan.cadenceScale).toBe(1);
    expect(plan.atCap).toBe(false);
  });

  test("a hurt player early in a long fight reaches the top tier", () => {
    const plan = evaluatePressure(struggling, { timeFloorSeconds: 60, timeWindowSeconds: 240 });
    expect(plan.tier).toBe(2);
    expect(plan.countBonus).toBe(2);
    expect(plan.eliteSlots).toBe(1);
    expect(plan.cadenceScale).toBeLessThan(1);
    expect(plan.atCap).toBe(true);
    expect(plan.reason).toContain("health 0.15");
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

  test("a dead player on a stalled clock for an hour sits exactly on the cap", () => {
    const first = evaluatePressure({ health: 0, progress: 0, elapsed: 60 }, { maxTier: 2 });
    const hourLater = evaluatePressure({ health: 0, progress: 0, elapsed: 3600 }, { maxTier: 2 });
    expect(hourLater.tier).toBe(2);
    expect(hourLater.tier).toBe(first.tier);
    expect(hourLater.countBonus).toBe(2);
    expect(hourLater.eliteSlots).toBe(1);
    expect(hourLater.atCap).toBe(true);
  });

  test("a rule with maxTier 0 never escalates", () => {
    for (const health of [0, 0.5, 1]) {
      const plan = evaluatePressure({ health, progress: 0, elapsed: 1e6 }, { maxTier: 0 });
      expect(plan.tier).toBe(0);
      expect(plan.countBonus).toBe(0);
      expect(plan.cadenceScale).toBe(1);
      expect(plan.atCap).toBe(true);
    }
  });

  test("worse readings never lower the tier, and the call is pure", () => {
    const rule: PressureRule = {};
    const reading = { health: 0.6, progress: 0.5, elapsed: 120 };
    const before = JSON.stringify(reading);
    const a = evaluatePressure(reading, rule);
    const b = evaluatePressure(reading, rule);
    expect(a).toEqual(b);
    expect(JSON.stringify(reading)).toBe(before);
    const worse = evaluatePressure({ ...reading, health: 0.2 }, rule);
    expect(worse.tier).toBeGreaterThanOrEqual(a.tier);
    expect(evaluatePressure({ ...reading, progress: 0.9 }, rule).tier).toBeLessThanOrEqual(a.tier);
  });
});
