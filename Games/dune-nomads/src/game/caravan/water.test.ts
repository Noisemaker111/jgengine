import { describe, expect, test } from "bun:test";
import { createDecayMeterSet } from "@jgengine/core/survival/decayMeter";

import {
  QUICK_TOPUP_AMOUNT,
  WATER_MAX,
  advanceDock,
  computeWaterDrainRate,
  headwindSeverity,
  startDock,
} from "./water";

describe("computeWaterDrainRate", () => {
  test("idle at rest drains only the base rate", () => {
    expect(computeWaterDrainRate({ speed: 0, headwind: 0 })).toBeCloseTo(0.4, 5);
  });

  test("faster travel drains more", () => {
    const slow = computeWaterDrainRate({ speed: 5, headwind: 0 });
    const fast = computeWaterDrainRate({ speed: 25, headwind: 0 });
    expect(fast).toBeGreaterThan(slow);
  });

  test("headwind drains much faster than speed alone", () => {
    const noHeadwind = computeWaterDrainRate({ speed: 15, headwind: 0 });
    const fullHeadwind = computeWaterDrainRate({ speed: 15, headwind: 1 });
    expect(fullHeadwind - noHeadwind).toBeGreaterThan(1);
  });
});

describe("headwindSeverity", () => {
  test("tailwind and crosswind contribute nothing", () => {
    expect(headwindSeverity(1)).toBe(0);
    expect(headwindSeverity(0)).toBe(0);
  });

  test("headwind scales 0..1", () => {
    expect(headwindSeverity(-0.5)).toBeCloseTo(0.5, 5);
    expect(headwindSeverity(-1)).toBe(1);
  });
});

describe("dock lifecycle", () => {
  test("full refill takes 45s and fills to max", () => {
    const dock = startDock("bitter-well", "full");
    const partial = advanceDock(dock, 10);
    expect(partial.completed).toBe(false);
    expect(partial.dock?.elapsed).toBeCloseTo(10, 5);

    const finished = advanceDock({ ...dock, elapsed: 44 }, 2);
    expect(finished.completed).toBe(true);
    expect(finished.dock).toBeNull();
    expect(finished.refillAmount).toBe(WATER_MAX);
  });

  test("quick top-up takes 15s and grants a partial amount", () => {
    const dock = startDock("last-water", "quick");
    const finished = advanceDock({ ...dock, elapsed: 14 }, 2);
    expect(finished.completed).toBe(true);
    expect(finished.refillAmount).toBe(QUICK_TOPUP_AMOUNT);
  });
});

describe("water meter integration", () => {
  test("drains to zero over time and clamps there", () => {
    const meter = createDecayMeterSet([{ id: "water", max: WATER_MAX, start: WATER_MAX, rate: 1 }]);
    meter.setRateModifier("water", 5);
    meter.tick(30);
    expect(meter.value("water")).toBe(0);
  });

  test("refill after a dock restores the meter", () => {
    const meter = createDecayMeterSet([{ id: "water", max: WATER_MAX, start: 10, rate: 1 }]);
    meter.refill("water", QUICK_TOPUP_AMOUNT);
    expect(meter.value("water")).toBeCloseTo(55, 5);
  });
});
