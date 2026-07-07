import { describe, expect, test } from "bun:test";
import { createAccumulatorMeter, tierAt } from "@jgengine/core/stats/accumulatorMeter";

describe("accumulatorMeter", () => {
  test("fills toward max and reports fraction", () => {
    const meter = createAccumulatorMeter({ max: 100 });
    meter.add(40);
    expect(meter.value()).toBe(40);
    expect(meter.fraction()).toBeCloseTo(0.4);
  });

  test("hold mode breaks at threshold and stays broken", () => {
    const meter = createAccumulatorMeter({ max: 100, mode: "hold" });
    expect(meter.add(60).fired).toBe(false);
    const result = meter.add(50);
    expect(result.fired).toBe(true);
    expect(meter.broke()).toBe(true);
    expect(meter.value()).toBe(100);
    expect(meter.add(20).fired).toBe(false);
  });

  test("reset mode fires and carries overflow past threshold", () => {
    const meter = createAccumulatorMeter({ max: 100, mode: "reset" });
    const result = meter.add(120);
    expect(result.fired).toBe(true);
    expect(result.overflow).toBe(20);
    expect(meter.value()).toBe(20);
    expect(meter.broke()).toBe(false);
  });

  test("decays after the idle delay elapses", () => {
    const meter = createAccumulatorMeter({ max: 100, decayPerSecond: 10, decayDelayMs: 500 });
    meter.add(50);
    meter.tick(0.4);
    expect(meter.value()).toBe(50);
    meter.tick(0.4);
    expect(meter.value()).toBeCloseTo(46);
  });

  test("broken hold meter does not decay until reset", () => {
    const meter = createAccumulatorMeter({ max: 100, mode: "hold", decayPerSecond: 50 });
    meter.add(100);
    meter.tick(1);
    expect(meter.value()).toBe(100);
    meter.reset();
    expect(meter.broke()).toBe(false);
    expect(meter.value()).toBe(0);
  });

  test("tier lookup and tierChanged reporting", () => {
    const tiers = [
      { id: "bronze", at: 10 },
      { id: "silver", at: 20 },
      { id: "gold", at: 30 },
    ];
    expect(tierAt(0, tiers)).toBeNull();
    expect(tierAt(25, tiers)).toBe("silver");
    const meter = createAccumulatorMeter({ max: 100, tiers });
    expect(meter.add(15).tier).toBe("bronze");
    const jump = meter.add(10);
    expect(jump.tier).toBe("silver");
    expect(jump.tierChanged).toBe(true);
    expect(meter.add(1).tierChanged).toBe(false);
  });

  test("drain lowers value and clears break below zero", () => {
    const meter = createAccumulatorMeter({ max: 100, mode: "hold" });
    meter.add(100);
    meter.drain(100);
    expect(meter.value()).toBe(0);
    expect(meter.broke()).toBe(false);
  });
});
