import { describe, expect, test } from "bun:test";

import {
  encumbranceMoveMultiplier,
  resolveEncumbrance,
  totalLoad,
  type LoadEntry,
} from "./encumbrance";

const MASSES: Record<string, number> = { ingot: 10, plank: 2, feather: 0.1, phantom: 0 };
const massOf = (itemId: string): number => MASSES[itemId] ?? 0;

describe("totalLoad", () => {
  test("sums unit mass times quantity across stacks", () => {
    const entries: LoadEntry[] = [
      { itemId: "ingot", quantity: 3 },
      { itemId: "plank", quantity: 5 },
    ];
    expect(totalLoad(entries, massOf)).toBe(40);
  });

  test("empty inventory weighs nothing", () => {
    expect(totalLoad([], massOf)).toBe(0);
  });

  test("unknown items and zero-mass items contribute nothing", () => {
    const entries: LoadEntry[] = [
      { itemId: "phantom", quantity: 100 },
      { itemId: "unknown", quantity: 10 },
      { itemId: "ingot", quantity: 1 },
    ];
    expect(totalLoad(entries, massOf)).toBe(10);
  });

  test("non-positive quantities are ignored", () => {
    const entries: LoadEntry[] = [
      { itemId: "ingot", quantity: 0 },
      { itemId: "ingot", quantity: -4 },
      { itemId: "ingot", quantity: 2 },
    ];
    expect(totalLoad(entries, massOf)).toBe(20);
  });
});

describe("resolveEncumbrance tiers and gates", () => {
  test("just below soft is unencumbered and unhindered", () => {
    const state = resolveEncumbrance(84, 100);
    expect(state.tier).toBe("unencumbered");
    expect(state.fraction).toBeCloseTo(0.84, 10);
    expect(state.moveMultiplier).toBe(1);
    expect(state.canSprint).toBe(true);
    expect(state.canJump).toBe(true);
    expect(state.immobile).toBe(false);
  });

  test("exactly at soft is encumbered but not yet slowed", () => {
    const state = resolveEncumbrance(85, 100);
    expect(state.tier).toBe("encumbered");
    expect(state.moveMultiplier).toBe(1);
    expect(state.canSprint).toBe(false);
    expect(state.canJump).toBe(false);
    expect(state.immobile).toBe(false);
  });

  test("just above soft is encumbered and progressively slowed", () => {
    const state = resolveEncumbrance(86, 100);
    expect(state.tier).toBe("encumbered");
    expect(state.moveMultiplier).toBeLessThan(1);
    expect(state.moveMultiplier).toBeGreaterThan(0.5);
    expect(state.canSprint).toBe(false);
  });

  test("at capacity is immobile with zero movement", () => {
    const state = resolveEncumbrance(100, 100);
    expect(state.tier).toBe("immobile");
    expect(state.fraction).toBe(1);
    expect(state.moveMultiplier).toBe(0);
    expect(state.immobile).toBe(true);
    expect(state.canSprint).toBe(false);
    expect(state.canJump).toBe(false);
  });

  test("above capacity stays immobile with an overloaded fraction", () => {
    const state = resolveEncumbrance(150, 100);
    expect(state.tier).toBe("immobile");
    expect(state.fraction).toBe(1.5);
    expect(state.moveMultiplier).toBe(0);
    expect(state.immobile).toBe(true);
  });

  test("negative mass clamps to an empty, unencumbered load", () => {
    const state = resolveEncumbrance(-20, 100);
    expect(state.mass).toBe(0);
    expect(state.fraction).toBe(0);
    expect(state.tier).toBe("unencumbered");
    expect(state.moveMultiplier).toBe(1);
  });
});

describe("progressive slow curve", () => {
  test("halfway through the soft..capacity band lands halfway to the floor", () => {
    // soft 0.85, floor 0.5: midpoint fraction 0.925 -> 1 - 0.5*0.5 = 0.75
    const state = resolveEncumbrance(92.5, 100);
    expect(state.fraction).toBeCloseTo(0.925, 10);
    expect(state.moveMultiplier).toBeCloseTo(0.75, 10);
  });

  test("multiplier decreases monotonically as load rises through the band", () => {
    const a = resolveEncumbrance(88, 100).moveMultiplier;
    const b = resolveEncumbrance(94, 100).moveMultiplier;
    const c = resolveEncumbrance(99, 100).moveMultiplier;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(0.5);
  });

  test("helper matches resolveEncumbrance for the same fraction", () => {
    expect(encumbranceMoveMultiplier(0.925)).toBeCloseTo(resolveEncumbrance(92.5, 100).moveMultiplier, 10);
  });

  test("helper is flat below soft and zero at/over capacity", () => {
    expect(encumbranceMoveMultiplier(0)).toBe(1);
    expect(encumbranceMoveMultiplier(0.85)).toBe(1);
    expect(encumbranceMoveMultiplier(1)).toBe(0);
    expect(encumbranceMoveMultiplier(2)).toBe(0);
  });
});

describe("config overrides", () => {
  test("custom soft threshold moves the encumbered boundary", () => {
    expect(resolveEncumbrance(60, 100, { soft: 0.5 }).tier).toBe("encumbered");
    expect(resolveEncumbrance(60, 100, { soft: 0.75 }).tier).toBe("unencumbered");
  });

  test("custom floor changes how hard a near-full load is slowed", () => {
    // fraction 0.9 -> t = (0.9-0.8)/0.2 = 0.5 -> 1 - (1-0.2)*0.5 = 0.6
    const state = resolveEncumbrance(90, 100, { soft: 0.8, floor: 0.2 });
    expect(state.moveMultiplier).toBeCloseTo(0.6, 10);
  });
});

describe("capacity edge cases", () => {
  test("zero capacity pins any positive load as immobile with a finite fraction", () => {
    const state = resolveEncumbrance(5, 0);
    expect(state.fraction).toBe(1);
    expect(state.tier).toBe("immobile");
    expect(state.moveMultiplier).toBe(0);
    expect(Number.isFinite(state.fraction)).toBe(true);
  });

  test("zero capacity with no load is an empty unencumbered state", () => {
    const state = resolveEncumbrance(0, 0);
    expect(state.fraction).toBe(0);
    expect(state.tier).toBe("unencumbered");
  });

  test("state round-trips through JSON unchanged", () => {
    const state = resolveEncumbrance(5, 0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  test("composes with totalLoad end to end", () => {
    const entries: LoadEntry[] = [
      { itemId: "ingot", quantity: 9 },
      { itemId: "plank", quantity: 3 },
    ];
    const state = resolveEncumbrance(totalLoad(entries, massOf), 100);
    expect(state.mass).toBe(96);
    expect(state.tier).toBe("encumbered");
  });
});
