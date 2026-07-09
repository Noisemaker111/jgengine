import { describe, expect, test } from "bun:test";

import {
  cellFromPosition,
  countdownPip,
  countdownRemaining,
  easeInFall,
  easeOutRise,
  isLanded,
  outwardDir,
} from "./phase";

describe("mine-drop phase helpers", () => {
  test("countdown remaining never goes negative", () => {
    expect(countdownRemaining(10, 8, 1.6)).toBe(0);
    expect(countdownRemaining(8.4, 8, 1.6)).toBeCloseTo(1.2, 5);
  });

  test("countdown pip walks 3 -> GO", () => {
    expect(countdownPip(0, 0, 1.5)).toBe("3");
    expect(countdownPip(0.6, 0, 1.5)).toBe("2");
    expect(countdownPip(1.1, 0, 1.5)).toBe("1");
    expect(countdownPip(1.6, 0, 1.5)).toBe("GO!");
  });

  test("landing detection triggers at the floor", () => {
    expect(isLanded(5, 0)).toBe(false);
    expect(isLanded(0.1, 0)).toBe(true);
    expect(isLanded(0.05, 0)).toBe(true);
  });

  test("fall eases from table top to floor and clamps", () => {
    expect(easeInFall(0, 0, 1, 5, 0)).toBe(5);
    expect(easeInFall(1, 0, 1, 5, 0)).toBe(0);
    expect(easeInFall(2, 0, 1, 5, 0)).toBe(0);
    expect(easeInFall(0.5, 0, 1, 5, 0)).toBeLessThan(5);
  });

  test("rise eases from floor to table top", () => {
    expect(easeOutRise(0, 0, 1, 0, 5)).toBe(0);
    expect(easeOutRise(1, 0, 1, 0, 5)).toBe(5);
  });

  test("cellFromPosition snaps to pitched cells and rejects cracks", () => {
    const pitch = 10;
    const half = 3.5;
    expect(cellFromPosition(30, 30, 10, pitch, half)).toEqual({ col: 3, row: 3, index: 33 });
    expect(cellFromPosition(30.4, 29.6, 10, pitch, half)).toEqual({ col: 3, row: 3, index: 33 });
    expect(cellFromPosition(35, 30, 10, pitch, half)).toBeNull();
    expect(cellFromPosition(-5, 30, 10, pitch, half)).toBeNull();
    expect(cellFromPosition(100, 30, 10, pitch, half)).toBeNull();
  });

  test("outwardDir points away from centre and is unit length", () => {
    const d = outwardDir(60, 30, 30, 30);
    expect(d.dx).toBeGreaterThan(0);
    expect(Math.hypot(d.dx, d.dz)).toBeCloseTo(1, 5);
    const dead = outwardDir(30, 30, 30, 30);
    expect(Math.hypot(dead.dx, dead.dz)).toBeCloseTo(1, 5);
  });
});
