import { describe, expect, test } from "bun:test";

import { createDecayMeterSet } from "./decayMeter";

describe("createDecayMeterSet", () => {
  test("drains at rate * dt on game time", () => {
    const meters = createDecayMeterSet([{ id: "hunger", max: 100, rate: 2 }]);
    meters.tick(5);
    expect(meters.value("hunger")).toBe(90);
  });

  test("clamps at min and max", () => {
    const meters = createDecayMeterSet([{ id: "oxygen", max: 10, rate: 5, start: 4 }]);
    meters.tick(10);
    expect(meters.value("oxygen")).toBe(0);
    meters.refill("oxygen", 999);
    expect(meters.value("oxygen")).toBe(10);
  });

  test("refill tops up after a consumable", () => {
    const meters = createDecayMeterSet([{ id: "thirst", max: 100, rate: 1, start: 30 }]);
    meters.refill("thirst", 50);
    expect(meters.value("thirst")).toBe(80);
  });

  test("rate modifier persists across ticks until cleared", () => {
    const meters = createDecayMeterSet([{ id: "warmth", max: 100, rate: 1 }]);
    meters.setRateModifier("warmth", 4);
    meters.tick(1);
    expect(meters.value("warmth")).toBe(96);
    meters.tick(1);
    expect(meters.value("warmth")).toBe(92);
    meters.setRateModifier("warmth", 1);
    meters.tick(1);
    expect(meters.value("warmth")).toBe(91);
  });

  test("setRate overrides the base drain", () => {
    const meters = createDecayMeterSet([{ id: "sanity", max: 100, rate: 1 }]);
    meters.setRate("sanity", 10);
    meters.tick(2);
    expect(meters.value("sanity")).toBe(80);
  });

  test("negative rate recovers toward max", () => {
    const meters = createDecayMeterSet([{ id: "warmth", max: 100, rate: -5, start: 50 }]);
    meters.tick(4);
    expect(meters.value("warmth")).toBe(70);
  });

  test("thresholds raise moodles when crossed", () => {
    const meters = createDecayMeterSet([
      {
        id: "hunger",
        max: 100,
        rate: 10,
        thresholds: [
          { id: "peckish", label: "Peckish", at: 50, when: "below", severity: "neutral" },
          { id: "starving", label: "Starving", at: 15, when: "below", severity: "critical" },
        ],
      },
    ]);
    expect(meters.moodles()).toHaveLength(0);
    meters.tick(6);
    expect(meters.moodles().map((m) => m.id)).toEqual(["peckish"]);
    meters.tick(4);
    expect(meters.moodles().map((m) => m.id).sort()).toEqual(["peckish", "starving"]);
  });

  test("above thresholds fire for heat/radiation meters", () => {
    const meters = createDecayMeterSet([
      {
        id: "temperature",
        max: 120,
        min: -40,
        start: 20,
        rate: -20,
        thresholds: [{ id: "overheating", label: "Overheating", at: 60, when: "above" }],
      },
    ]);
    meters.tick(3);
    expect(meters.value("temperature")).toBe(80);
    expect(meters.moodles().map((m) => m.id)).toEqual(["overheating"]);
  });

  test("unknown meter id throws", () => {
    const meters = createDecayMeterSet([{ id: "hunger", max: 100, rate: 1 }]);
    expect(() => meters.value("nope")).toThrow();
  });
});
