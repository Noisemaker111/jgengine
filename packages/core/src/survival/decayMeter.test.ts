import { describe, expect, test } from "bun:test";

import { createNeedSet } from "../sim/needs";
import {
  decayMeterMoodles,
  decayMeterSnapshot,
  decayMeterState,
  decayMeters,
  initDecayMeters,
  refillMeter,
  type DecayMeterConfig,
} from "./decayMeter";

describe("createNeedSet as survival meters", () => {
  test("drains at rate * dt on game time", () => {
    const meters = createNeedSet([{ id: "hunger", max: 100, rate: 2 }]);
    meters.tick(5);
    expect(meters.value("hunger")).toBe(90);
  });

  test("clamps at min and max", () => {
    const meters = createNeedSet([{ id: "oxygen", max: 10, rate: 5, start: 4 }]);
    meters.tick(10);
    expect(meters.value("oxygen")).toBe(0);
    meters.refill("oxygen", 999);
    expect(meters.value("oxygen")).toBe(10);
  });

  test("refill tops up after a consumable", () => {
    const meters = createNeedSet([{ id: "thirst", max: 100, rate: 1, start: 30 }]);
    meters.refill("thirst", 50);
    expect(meters.value("thirst")).toBe(80);
  });

  test("rate modifier persists across ticks until cleared", () => {
    const meters = createNeedSet([{ id: "warmth", max: 100, rate: 1 }]);
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
    const meters = createNeedSet([{ id: "sanity", max: 100, rate: 1 }]);
    meters.setRate("sanity", 10);
    meters.tick(2);
    expect(meters.value("sanity")).toBe(80);
  });

  test("negative rate recovers toward max", () => {
    const meters = createNeedSet([{ id: "warmth", max: 100, rate: -5, start: 50 }]);
    meters.tick(4);
    expect(meters.value("warmth")).toBe(70);
  });

  test("thresholds raise moodles when crossed", () => {
    const meters = createNeedSet([
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
    const meters = createNeedSet([
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
    const meters = createNeedSet([{ id: "hunger", max: 100, rate: 1 }]);
    expect(() => meters.value("nope")).toThrow();
  });
});

describe("pure decay meters", () => {
  const defs: readonly DecayMeterConfig[] = [
    { id: "hunger", max: 100, rate: 2 },
    { id: "warmth", max: 100, min: 0, start: 50, rate: -5 },
  ];

  test("initDecayMeters seeds start ?? max clamped", () => {
    expect(initDecayMeters(defs)).toEqual({ hunger: 100, warmth: 50 });
  });

  test("decayMeters drains/fills by rate * dt and returns a new record", () => {
    const start = initDecayMeters(defs);
    const next = decayMeters(start, defs, 5);
    expect(next).toEqual({ hunger: 90, warmth: 75 });
    expect(start).toEqual({ hunger: 100, warmth: 50 });
  });

  test("scalar modifier scales every meter (e.g. metabolism)", () => {
    const next = decayMeters({ hunger: 100, warmth: 50 }, defs, 1, 2);
    expect(next).toEqual({ hunger: 96, warmth: 60 });
  });

  test("per-meter modifier record scales only named meters", () => {
    const next = decayMeters({ hunger: 100, warmth: 50 }, defs, 1, { hunger: 3 });
    expect(next).toEqual({ hunger: 94, warmth: 55 });
  });

  test("dt <= 0 returns the same record reference", () => {
    const start = { hunger: 100, warmth: 50 };
    expect(decayMeters(start, defs, 0)).toBe(start);
  });

  test("values clamp to each meter range", () => {
    const drained = decayMeters({ hunger: 3, warmth: 50 }, defs, 10);
    expect(drained.hunger).toBe(0);
    const filled = decayMeters({ hunger: 100, warmth: 98 }, defs, 10);
    expect(filled.warmth).toBe(100);
  });

  test("a meter stops exactly at each bound, including a negative min", () => {
    const bounded: readonly DecayMeterConfig[] = [
      { id: "oxygen", max: 10, rate: 60 },
      { id: "temperature", max: 40, min: -20, start: 30, rate: 50 },
    ];
    let values = decayMeters(initDecayMeters(bounded), bounded, 2);
    expect(values).toEqual({ oxygen: 0, temperature: -20 });
    values = refillMeter(values, bounded, "temperature", 1_000);
    expect(values.temperature).toBe(40);
    values = refillMeter(values, bounded, "oxygen", -1_000);
    expect(values.oxygen).toBe(0);
    expect(refillMeter(values, bounded, "oxygen", 3).oxygen).toBe(3);
  });

  test("a start outside the meter range is clamped into it", () => {
    const outOfRange: readonly DecayMeterConfig[] = [
      { id: "overfull", max: 10, start: 40, rate: 0 },
      { id: "underfull", max: 10, min: 5, start: 0, rate: 0 },
    ];
    expect(initDecayMeters(outOfRange)).toEqual({ overfull: 10, underfull: 5 });
  });

  test("refillMeter tops up one meter, clamped, immutably", () => {
    const values = { hunger: 30, warmth: 50 };
    expect(refillMeter(values, defs, "hunger", 50)).toEqual({ hunger: 80, warmth: 50 });
    expect(refillMeter(values, defs, "hunger", 999).hunger).toBe(100);
    expect(values.hunger).toBe(30);
    expect(() => refillMeter(values, defs, "nope", 1)).toThrow();
  });

  test("decayMeterState reports fraction and snapshot covers every meter", () => {
    const values = { hunger: 50, warmth: 25 };
    expect(decayMeterState(values, defs, "hunger").fraction).toBe(0.5);
    expect(Object.keys(decayMeterSnapshot(values, defs))).toEqual(["hunger", "warmth"]);
  });

  test("decayMeterMoodles raises crossed thresholds worst-first", () => {
    const threshDefs: readonly DecayMeterConfig[] = [
      {
        id: "hunger",
        max: 100,
        rate: 1,
        thresholds: [
          { id: "peckish", label: "Peckish", at: 50, when: "below", severity: "neutral" },
          { id: "starving", label: "Starving", at: 15, when: "below", severity: "critical" },
        ],
      },
    ];
    expect(decayMeterMoodles({ hunger: 40 }, threshDefs).map((m) => m.id)).toEqual(["peckish"]);
    expect(decayMeterMoodles({ hunger: 10 }, threshDefs).map((m) => m.id).sort()).toEqual([
      "peckish",
      "starving",
    ]);
  });

  test("state serializes and round-trips through JSON without a closure", () => {
    let values = initDecayMeters(defs);
    values = decayMeters(values, defs, 3);
    const restored = JSON.parse(JSON.stringify(values)) as typeof values;
    expect(restored).toEqual(values);
    // Continuing the sim from the deserialized record is identical to never serializing.
    expect(decayMeters(restored, defs, 2)).toEqual(decayMeters(values, defs, 2));
  });

  test("the closure form is observably equivalent to the pure form", () => {
    const set = createNeedSet(defs);
    set.tick(5);
    set.refill("hunger", 10);
    let values = decayMeters(initDecayMeters(defs), defs, 5);
    values = refillMeter(values, defs, "hunger", 10);
    expect(set.states()).toEqual(decayMeterSnapshot(values, defs));
  });
});

describe("need set save state", () => {
  const configs: DecayMeterConfig[] = [
    { id: "warmth", max: 100, rate: 1, start: 80 },
    { id: "hunger", max: 100, rate: 2 },
  ];

  test("a tuned rate and modifier survive the trip through a save", () => {
    const meters = createNeedSet(configs);
    meters.setRate("hunger", 5);
    meters.setRateModifier("warmth", 4);
    meters.tick(2); // warmth 80 - 1*4*2 = 72, hunger 100 - 5*2 = 90

    const saved = JSON.parse(JSON.stringify(meters.snapshot())) as ReturnType<typeof meters.snapshot>;
    expect(saved.values).toEqual({ warmth: 72, hunger: 90 });
    expect(saved.rates).toEqual({ warmth: 1, hunger: 5 });
    expect(saved.modifiers).toEqual({ warmth: 4 });

    const resumed = createNeedSet(configs);
    resumed.restore(saved);
    meters.tick(3);
    resumed.tick(3);
    expect(resumed.value("warmth")).toBe(meters.value("warmth"));
    expect(resumed.value("hunger")).toBe(meters.value("hunger"));
  });

  test("restore clears a modifier the saved state does not carry", () => {
    const meters = createNeedSet([{ id: "oxygen", max: 100, rate: 1 }]);
    meters.setRateModifier("oxygen", 5);
    meters.restore({ values: { oxygen: 100 }, rates: { oxygen: 1 }, modifiers: {} });
    meters.tick(1);
    expect(meters.value("oxygen")).toBe(99);
  });
});

describe("decayMeters rate stack", () => {
  test("a named stat-op stack scales the base rate like a pre-multiplied number", () => {
    const defs = [{ id: "food", max: 100, rate: 2 }];
    const stacked = decayMeters({ food: 100 }, defs, 1, { food: [{ source: "cold", op: "mul", value: 1.5 }] });
    expect(stacked.food).toBe(decayMeters({ food: 100 }, defs, 1, { food: 1.5 }).food);
    expect(stacked.food).toBe(97);
  });
});
