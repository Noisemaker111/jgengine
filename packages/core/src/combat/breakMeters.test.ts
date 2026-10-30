import { describe, expect, test } from "bun:test";
import { createBuildupMeter, createStaggerMeter } from "@jgengine/core/combat/breakMeters";

describe("saved state", () => {
  test("a restored stagger meter keeps its value, break and decay delay", () => {
    const meter = createStaggerMeter({ max: 100, decayPerSecond: 10, decayDelayMs: 1000 });
    meter.add(100);
    const copy = createStaggerMeter({ max: 100, decayPerSecond: 10, decayDelayMs: 1000 });
    copy.restore(JSON.parse(JSON.stringify(meter.snapshot())));
    expect(copy.value()).toBe(100);
    expect(copy.broke()).toBe(true);
    const config = { max: 100, decayPerSecond: 10, decayDelayMs: 1000 };
    const straight = createStaggerMeter(config);
    const resumed = createStaggerMeter(config);
    straight.add(50);
    resumed.add(50);
    straight.tick(0.6);
    resumed.tick(0.6);
    const saved = JSON.parse(JSON.stringify(resumed.snapshot()));
    resumed.tick(3);
    resumed.restore(saved);
    for (const meter of [straight, resumed]) meter.tick(0.6);
    expect(resumed.value()).toBe(straight.value());
    expect(resumed.value()).toBeLessThan(50);
  });

  test("a restored buildup meter keeps its fill", () => {
    const meter = createBuildupMeter({ status: "bleed", max: 10, durationMs: 1000 });
    meter.add(7);
    const copy = createBuildupMeter({ status: "bleed", max: 10, durationMs: 1000 });
    copy.restore(JSON.parse(JSON.stringify(meter.snapshot())));
    expect(copy.value()).toBe(7);
    expect(copy.add(3)).toEqual({ status: "bleed", durationMs: 1000 });
  });
});

describe("stagger meter", () => {
  test("fills from hits and breaks at threshold, then recovers", () => {
    const meter = createStaggerMeter({ max: 100 });
    expect(meter.add(60)).toBe(false);
    expect(meter.add(50)).toBe(true);
    expect(meter.broke()).toBe(true);
    meter.recover();
    expect(meter.broke()).toBe(false);
    expect(meter.value()).toBe(0);
  });

  test("decays over time when not hit", () => {
    const meter = createStaggerMeter({ max: 100, decayPerSecond: 20 });
    meter.add(40);
    meter.tick(1);
    expect(meter.value()).toBeCloseTo(20);
  });
});

describe("buildup meter", () => {
  test("procs a timed status at threshold and resets", () => {
    const meter = createBuildupMeter({ status: "bleed", max: 100, durationMs: 4000 });
    expect(meter.add(50)).toBeNull();
    const proc = meter.add(60);
    expect(proc).toEqual({ status: "bleed", durationMs: 4000 });
    expect(meter.value()).toBe(10);
  });

  test("decays between hits", () => {
    const meter = createBuildupMeter({ status: "frost", max: 100, durationMs: 3000, decayPerSecond: 10 });
    meter.add(30);
    meter.tick(2);
    expect(meter.value()).toBeCloseTo(10);
  });
});
