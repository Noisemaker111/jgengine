import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { createRefillSlots } from "./refillSlots";

describe("refill slots", () => {
  test("every slot starts empty and ready at time 0, in config order, and a filled one is not ready", () => {
    const slots = createRefillSlots({ slots: ["den", "burrow", "nest"], refillSeconds: [10, 20] }, seededRng("start"));
    expect(slots.ready(0)).toEqual(["den", "burrow", "nest"]);
    expect(slots.isFilled("den")).toBe(false);
    slots.fill("burrow");
    expect(slots.isFilled("burrow")).toBe(true);
    expect(slots.ready(1e6)).toEqual(["den", "nest"]);
  });

  test("an empty slot is ready again only once its wait from refillSeconds has passed", () => {
    const shortest = createRefillSlots({ slots: ["den"], refillSeconds: [10, 20] }, () => 0);
    shortest.fill("den");
    shortest.empty("den", 100);
    expect(shortest.ready(109.9)).toEqual([]);
    expect(shortest.ready(110)).toEqual(["den"]);
    const longest = createRefillSlots({ slots: ["den"], refillSeconds: [10, 20] }, () => 1);
    longest.empty("den", 100);
    expect(longest.ready(119.9)).toEqual([]);
    expect(longest.ready(120)).toEqual(["den"]);
  });

  test("the same seed draws the same waits, and each waits inside refillSeconds", () => {
    const waits = (seed: string): number[] => {
      const slots = createRefillSlots({ slots: ["a", "b", "c"], refillSeconds: [600, 1800] }, seededRng(seed));
      for (const slot of ["a", "b", "c"]) slots.empty(slot, 0);
      const saved = slots.snapshot().slots;
      return ["a", "b", "c"].map((slot) => saved[slot]?.readyAt ?? -1);
    };
    expect(waits("fern")).toEqual(waits("fern"));
    expect(waits("fern")).not.toEqual(waits("moss"));
    for (const wait of waits("fern")) {
      expect(wait).toBeGreaterThanOrEqual(600);
      expect(wait).toBeLessThanOrEqual(1800);
    }
  });

  test("readyAt sets an empty slot's ready time, for spreading a world's first fills", () => {
    const slots = createRefillSlots({ slots: ["den"], refillSeconds: [10, 20] }, seededRng("at"));
    slots.readyAt("den", 500);
    expect(slots.ready(499.9)).toEqual([]);
    expect(slots.ready(500)).toEqual(["den"]);
  });

  test("a save carries which slots are filled and when the empty ones are ready", () => {
    const slots = createRefillSlots({ slots: ["den", "burrow"], refillSeconds: [10, 20] }, seededRng("save"));
    slots.fill("den");
    slots.empty("burrow", 40);
    const saved = slots.snapshot();
    const other = createRefillSlots({ slots: ["den", "burrow"], refillSeconds: [10, 20] }, seededRng("other"));
    other.fill("burrow");
    other.restore(saved);
    expect(other.isFilled("den")).toBe(true);
    expect(other.isFilled("burrow")).toBe(false);
    expect(other.snapshot()).toEqual(saved);
    expect(other.ready(0)).toEqual(slots.ready(0));
    expect(other.ready(1e6)).toEqual(slots.ready(1e6));
  });

  test("reset empties every slot and makes them ready at time 0", () => {
    const slots = createRefillSlots({ slots: ["den", "burrow"], refillSeconds: [10, 20] }, seededRng("reset"));
    slots.fill("den");
    slots.empty("burrow", 40);
    slots.readyAt("den", 900);
    slots.reset();
    expect(slots.ready(0)).toEqual(["den", "burrow"]);
    expect(slots.isFilled("den")).toBe(false);
    expect(slots.snapshot()).toEqual(createRefillSlots({ slots: ["den", "burrow"], refillSeconds: [10, 20] }, seededRng("fresh")).snapshot());
  });

  test("retune changes the wait later empties draw", () => {
    const slots = createRefillSlots({ slots: ["den"], refillSeconds: [10, 20] }, () => 0);
    slots.empty("den", 0);
    expect(slots.ready(10)).toEqual(["den"]);
    slots.retune({ refillSeconds: [100, 100] });
    slots.empty("den", 0);
    expect(slots.ready(99.9)).toEqual([]);
    expect(slots.ready(100)).toEqual(["den"]);
  });

  test("an unknown slot throws on a write and reads as unfilled", () => {
    const slots = createRefillSlots({ slots: ["den"], refillSeconds: [10, 20] }, seededRng("unknown"));
    expect(slots.isFilled("burrow")).toBe(false);
    expect(() => slots.fill("burrow")).toThrow('no slot named "burrow"');
    expect(() => slots.empty("burrow", 0)).toThrow('no slot named "burrow"');
    expect(() => slots.readyAt("burrow", 0)).toThrow('no slot named "burrow"');
    expect(slots.ready(1e6)).toEqual(["den"]);
  });
});
