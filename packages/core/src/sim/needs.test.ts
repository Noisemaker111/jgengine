import { describe, expect, test } from "bun:test";

import { createNeedSet } from "./needs";

describe("createNeedSet", () => {
  test("drains at rate * dt and clamps at empty", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 2, start: 10 }]);
    needs.tick(4);
    expect(needs.value("hunger")).toBe(2);
    needs.tick(4);
    expect(needs.value("hunger")).toBe(0);
  });

  test("fraction is 0..1 between min and max", () => {
    const needs = createNeedSet([{ id: "warmth", max: 40, min: 10, rate: 1, start: 25 }]);
    expect(needs.fraction("warmth")).toBeCloseTo(0.5, 6);
    needs.tick(15);
    expect(needs.fraction("warmth")).toBe(0);
  });

  test("index-addressed reads match id reads", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 1, start: 40 },
      { id: "fun", max: 100, rate: 1, start: 90 },
    ]);
    const fun = needs.indexOf("fun");
    expect(needs.indexOf("thirst")).toBe(-1);
    expect(needs.valueAt(fun)).toBe(needs.value("fun"));
    expect(needs.fractionAt(fun)).toBe(needs.fraction("fun"));
    expect(needs.fractionAt(99)).toBe(0);
  });

  test("refill and rate modifiers move one need without touching the others", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 1, start: 50 },
      { id: "energy", max: 100, rate: 1, start: 50 },
    ]);
    needs.refill("hunger", 30);
    needs.setRateModifier("energy", 3);
    needs.tick(2);
    expect(needs.value("hunger")).toBe(78);
    expect(needs.value("energy")).toBe(44);
    needs.setRateModifier(null, 1);
    needs.tick(2);
    expect(needs.value("energy")).toBe(42);
  });

  test("mostUrgent reports the emptiest need and breaks ties in declared order", () => {
    const needs = createNeedSet([
      { id: "hunger", max: 100, rate: 0, start: 60 },
      { id: "energy", max: 100, rate: 0, start: 20 },
      { id: "fun", max: 100, rate: 0, start: 20 },
    ]);
    expect(needs.mostUrgent()).toEqual({ id: "energy", value: 20, fraction: 0.2 });
    expect(createNeedSet([]).mostUrgent()).toBeNull();
  });

  test("snapshot/restore round-trips values, retuned rates and modifiers", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 1, start: 50 }]);
    needs.setRate("hunger", 4);
    needs.setRateModifier("hunger", 2);
    needs.tick(5);
    const saved = needs.snapshot();
    expect(saved).toEqual({ values: { hunger: 10 }, rates: { hunger: 4 }, modifiers: { hunger: 2 } });

    const other = createNeedSet([{ id: "hunger", max: 100, rate: 1, start: 100 }]);
    other.restore(saved);
    expect(other.snapshot()).toEqual(saved);
    other.tick(1);
    expect(other.value("hunger")).toBe(2);
  });

  test("restore clamps saved values and ignores undeclared ids", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 1, start: 100 }]);
    needs.restore({ values: { hunger: 400, thirst: 5 }, rates: {}, modifiers: {} });
    expect(needs.value("hunger")).toBe(100);
    needs.restore({ values: { hunger: Number.NaN }, rates: {}, modifiers: {} });
    expect(needs.value("hunger")).toBe(100);
  });

  test("unknown ids throw rather than silently do nothing", () => {
    const needs = createNeedSet([{ id: "hunger", max: 100, rate: 1 }]);
    expect(() => needs.value("thirst")).toThrow('unknown need "thirst"');
    expect(() => needs.refill("thirst", 10)).toThrow('unknown need "thirst"');
    expect(() => needs.setRate("thirst", 2)).toThrow('unknown need "thirst"');
  });
});
