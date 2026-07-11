import { describe, expect, test } from "bun:test";

import { normalizePointerToAxis, pointerAxisValue, type PointerAxisState } from "@jgengine/core/input/pointerAxis";

const rect = { left: 100, top: 50, width: 800, height: 600 };

function state(x: number, y: number, active = true): PointerAxisState {
  return { x, y, active };
}

describe("normalizePointerToAxis", () => {
  test("center of the rect maps to the origin", () => {
    const result = normalizePointerToAxis(500, 350, rect);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.active).toBe(true);
  });

  test("edges map to the unit range with screen-convention y", () => {
    expect(normalizePointerToAxis(100, 50, rect)).toEqual({ x: -1, y: -1, active: true });
    expect(normalizePointerToAxis(900, 650, rect)).toEqual({ x: 1, y: 1, active: true });
  });

  test("coordinates outside the rect clamp to the unit range", () => {
    const result = normalizePointerToAxis(2000, -400, rect);
    expect(result.x).toBe(1);
    expect(result.y).toBe(-1);
  });

  test("degenerate rect does not divide by zero", () => {
    const result = normalizePointerToAxis(10, 10, { left: 0, top: 0, width: 0, height: 0 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe("pointerAxisValue", () => {
  test("reads the bound source axis", () => {
    expect(pointerAxisValue({ source: "x" }, state(0.5, -0.25))).toBeCloseTo(0.5);
    expect(pointerAxisValue({ source: "y" }, state(0.5, -0.25))).toBeCloseTo(-0.25);
  });

  test("returns null for a missing or inactive pointer", () => {
    expect(pointerAxisValue({ source: "x" }, null)).toBeNull();
    expect(pointerAxisValue({ source: "x" }, undefined)).toBeNull();
    expect(pointerAxisValue({ source: "x" }, state(0.5, 0, false))).toBeNull();
  });

  test("invert flips the sign", () => {
    expect(pointerAxisValue({ source: "y", invert: true }, state(0, 0.6))).toBeCloseTo(-0.6);
  });

  test("deadzone zeroes the center and rescales the remainder to full range", () => {
    const binding = { source: "x" as const, deadzone: 0.2 };
    expect(pointerAxisValue(binding, state(0.1, 0))).toBe(0);
    expect(pointerAxisValue(binding, state(-0.15, 0))).toBe(0);
    expect(pointerAxisValue(binding, state(1, 0))).toBeCloseTo(1);
    expect(pointerAxisValue(binding, state(-1, 0))).toBeCloseTo(-1);
    expect(pointerAxisValue(binding, state(0.6, 0))).toBeCloseTo(0.5);
  });

  test("curve shapes the magnitude while preserving sign", () => {
    expect(pointerAxisValue({ source: "x", curve: 2 }, state(0.5, 0))).toBeCloseTo(0.25);
    expect(pointerAxisValue({ source: "x", curve: 2 }, state(-0.5, 0))).toBeCloseTo(-0.25);
    expect(pointerAxisValue({ source: "x", curve: 2 }, state(1, 0))).toBeCloseTo(1);
  });
});
