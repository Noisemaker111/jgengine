import { describe, expect, test } from "bun:test";
import { createBuildupMeter, createStaggerMeter } from "@jgengine/core/combat/breakMeters";

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
