import { describe, expect, test } from "bun:test";
import {
  addValue,
  clampValue,
  createPairKeyCodec,
  driftValue,
  getValue,
  setValue,
  towardValue,
  type NumericBounds,
} from "@jgengine/core/relation/keyedValues";
import { crossThresholds, type ThresholdBoundary } from "@jgengine/core/relation/thresholds";

const BOUNDS: NumericBounds = { min: -100, max: 100 };

describe("keyed numeric operations", () => {
  test("get returns the fallback for a missing key", () => {
    const record: Record<string, number> = {};
    expect(getValue(record, "a")).toBe(0);
    expect(getValue(record, "a", 8)).toBe(8);
  });

  test("set and add clamp to bounds and write in place", () => {
    const record: Record<string, number> = {};
    expect(setValue(record, "a", 50, BOUNDS)).toBe(50);
    expect(addValue(record, "a", 999, BOUNDS)).toBe(100);
    expect(addValue(record, "a", -9999, BOUNDS)).toBe(-100);
    expect(record.a).toBe(-100);
  });

  test("clampValue is a pure scalar clamp", () => {
    expect(clampValue(5)).toBe(5);
    expect(clampValue(5, { max: 3 })).toBe(3);
    expect(clampValue(-5, { min: 0 })).toBe(0);
  });

  test("toward steps without overshooting and drift decays to rest", () => {
    const record: Record<string, number> = { a: 10 };
    expect(towardValue(record, "a", 100, 4)).toBe(14);
    expect(towardValue(record, "a", 15, 999)).toBe(15); // clamps to target, no overshoot
    // drift pulls toward 0 by rate.
    const heat: Record<string, number> = { core: 8 };
    expect(driftValue(heat, "core", 3)).toBe(5);
    expect(driftValue(heat, "core", 999)).toBe(0);
    expect(driftValue(heat, "core", 999)).toBe(0); // stays at rest
  });

  test("drift respects a non-zero rest value", () => {
    const record: Record<string, number> = { a: -20 };
    expect(driftValue(record, "a", 5, -10)).toBe(-15);
    expect(driftValue(record, "a", 999, -10)).toBe(-10);
  });
});

describe("pair-key codec", () => {
  test("undirected keys canonicalize regardless of argument order", () => {
    const codec = createPairKeyCodec();
    expect(codec.key("m1", "m0")).toBe(codec.key("m0", "m1"));
    expect(codec.parse(codec.key("m1", "m0"))).toEqual(["m0", "m1"]);
  });

  test("directed keys preserve order", () => {
    const codec = createPairKeyCodec({ directed: true });
    expect(codec.key("a", "b")).not.toBe(codec.key("b", "a"));
    expect(codec.parse(codec.key("b", "a"))).toEqual(["b", "a"]);
  });

  test("ids containing the separator or escape char round-trip without collision", () => {
    const codec = createPairKeyCodec();
    // Naive `${a}|${b}` would make ("a|b","c") collide with ("a","b|c").
    const left = codec.key("a|b", "c");
    const right = codec.key("a", "b|c");
    expect(left).not.toBe(right);
    expect(codec.parse(left)).toEqual(["a|b", "c"].sort() as [string, string]);
    const tricky = codec.key("x\\|y", "z");
    expect(codec.parse(tricky)).toContain("x\\|y");
  });

  test("rejects an invalid separator", () => {
    expect(() => createPairKeyCodec({ separator: "||" })).toThrow();
    expect(() => createPairKeyCodec({ separator: "\\" })).toThrow();
  });
});

describe("serialize -> deserialize round-trip", () => {
  test("a keyed relation record survives JSON and re-reads by codec key", () => {
    const codec = createPairKeyCodec();
    const record: Record<string, number> = {};
    setValue(record, codec.key("m0", "m1"), 42, BOUNDS);
    addValue(record, codec.key("m1|weird", "m2"), 10, BOUNDS);

    const restored = JSON.parse(JSON.stringify(record)) as Record<string, number>;
    expect(getValue(restored, codec.key("m1", "m0"))).toBe(42);
    expect(getValue(restored, codec.key("m2", "m1|weird"))).toBe(10);
    expect(restored).toEqual(record);
  });
});

describe("non-social adopter: reactor pressure meter", () => {
  // Genre-agnostic use: a keyed environmental meter with tier crossings, no relations.
  const BANDS: ThresholdBoundary[] = [
    { id: "nominal", at: 40 },
    { id: "warning", at: 75 },
    { id: "critical", at: 95 },
  ];
  const PRESSURE: NumericBounds = { min: 0, max: 120 };

  test("rising pressure fires alarm tiers once; venting drifts back down", () => {
    const reactors: Record<string, number> = { "reactor:a": 30 };
    const alarms: string[] = [];
    const step = (delta: number) => {
      const before = getValue(reactors, "reactor:a");
      const after = addValue(reactors, "reactor:a", delta, PRESSURE);
      for (const crossing of crossThresholds(BANDS, before, after)) {
        if (crossing.direction === "up") alarms.push(crossing.id);
      }
    };
    step(20); // 30 -> 50 : nominal
    step(30); // 50 -> 80 : warning
    step(40); // 80 -> 120 (clamped) : critical
    expect(alarms).toEqual(["nominal", "warning", "critical"]);

    // Vent: drift toward 0, confirm downward crossings are detectable and ordered top-down.
    const before = getValue(reactors, "reactor:a");
    const after = driftValue(reactors, "reactor:a", 60, 0, PRESSURE);
    const down = crossThresholds(BANDS, before, after).filter((c) => c.direction === "down");
    expect(down.map((c) => c.id)).toEqual(["critical", "warning"]);
    expect(after).toBe(60);
  });
});
