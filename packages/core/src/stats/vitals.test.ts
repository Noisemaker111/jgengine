import { describe, expect, test } from "bun:test";

import { createVitals, type VitalDef } from "./vitals";

const DEFS: VitalDef[] = [
  { id: "health", max: 100, rate: 1, regenCost: [{ vital: "food", perPoint: 0.5 }] },
  { id: "stamina", max: 100, rate: 10, regenDelay: 1 },
  { id: "food", max: 100, rate: -1, whenEmpty: [{ vital: "health", rate: -2 }] },
  { id: "torpor", max: 50, start: 0, rate: -5, flags: [{ id: "unconscious", when: "atLeast", on: 0.9, off: 0.1 }] },
];

describe("createVitals", () => {
  test("drains and refuses a spend it cannot cover", () => {
    const vitals = createVitals(DEFS);
    vitals.tick(10);
    expect(vitals.value("food")).toBe(90);
    expect(vitals.spend("stamina", 150)).toBe(false);
    expect(vitals.spend("stamina", 40)).toBe(true);
    expect(vitals.value("stamina")).toBe(60);
  });

  test("regen waits out its delay and charges its payer", () => {
    const vitals = createVitals(DEFS);
    vitals.spend("stamina", 50);
    vitals.tick(0.5);
    expect(vitals.value("stamina")).toBe(50);
    vitals.tick(0.5);
    vitals.tick(1);
    expect(vitals.value("stamina")).toBe(60);
    vitals.change("health", -20);
    vitals.tick(4);
    expect(vitals.value("health")).toBe(84);
    expect(vitals.value("food")).toBeCloseTo(100 - 6 - 2, 5);
  });

  test("an empty vital drains its link", () => {
    const vitals = createVitals(DEFS);
    vitals.change("food", -100);
    vitals.tick(5);
    expect(vitals.value("health")).toBe(90);
  });

  test("a flag latches until the off level", () => {
    const vitals = createVitals(DEFS);
    vitals.change("torpor", 60);
    expect(vitals.tick(0.01)).toEqual([{ id: "unconscious", raised: true }]);
    expect(vitals.has("unconscious")).toBe(true);
    vitals.tick(5);
    expect(vitals.has("unconscious")).toBe(true);
    const cleared = vitals.tick(10);
    expect(cleared).toEqual([{ id: "unconscious", raised: false }]);
  });

  test("state round-trips and setMax levels a vital", () => {
    const vitals = createVitals(DEFS);
    vitals.setMax("health", 110, true);
    vitals.change("food", -30);
    const copy = createVitals(DEFS);
    copy.restore(JSON.parse(JSON.stringify(vitals.state())));
    expect(copy.max("health")).toBe(110);
    expect(copy.value("health")).toBe(110);
    expect(copy.value("food")).toBe(70);
    copy.reset();
    expect(copy.max("health")).toBe(100);
  });
});
