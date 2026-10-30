import { describe, expect, test } from "bun:test";
import { createAccumulatorMeter } from "@jgengine/core/stats/accumulatorMeter";
import { tierAt } from "@jgengine/core/threshold/thresholds";

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
    expect(tierAt(tiers, 0)).toBeNull();
    expect(tierAt(tiers, 25)?.id).toBe("silver");
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

  test("an over-fill stops at max and reset mode carries only what fits", () => {
    const hold = createAccumulatorMeter({ max: 100 });
    const full = hold.add(140);
    expect(full.value).toBe(100);
    expect(full.overflow).toBe(0);

    const reset = createAccumulatorMeter({ max: 100, mode: "reset" });
    const carried = reset.add(240);
    expect(carried.fired).toBe(true);
    expect(carried.overflow).toBe(140);
    expect(carried.value).toBe(100);
    expect(reset.add(5).value).toBe(5);
  });

  test("decay and draining stop at zero, and restored values clamp to the bounds", () => {
    const meter = createAccumulatorMeter({ max: 100, decayPerSecond: 30 });
    meter.add(10);
    meter.tick(100);
    expect(meter.value()).toBe(0);
    expect(meter.add(-50).value).toBe(0);
    expect(meter.fraction()).toBe(0);

    meter.restore({ value: 500, broken: false, idleMs: -5 });
    expect(meter.value()).toBe(100);
    meter.drain(-1_000);
    expect(meter.value()).toBe(100);
    expect(meter.state().idleMs).toBe(0);
  });

  test("JSON restore preserves the hold latch even after a partial drain", () => {
    const config = { max: 100, decayPerSecond: 10, decayDelayMs: 1000 };
    const original = createAccumulatorMeter(config);
    original.add(100);
    original.drain(30);
    original.tick(0.4);
    const saved = original.state();
    const resumed = createAccumulatorMeter(config);
    resumed.restore(JSON.parse(JSON.stringify(saved)));
    saved.value = 0;
    expect(resumed.state()).toEqual(original.state());
    expect(resumed.broke()).toBe(true);
    resumed.tick(2);
    original.tick(2);
    expect(resumed.state()).toEqual(original.state());
    expect(resumed.value()).toBe(70);
    expect(resumed.add(40)).toEqual(original.add(40));
    expect(resumed.add(1).fired).toBe(false);
  });
});
