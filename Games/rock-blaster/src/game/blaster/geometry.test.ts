import { describe, expect, test } from "bun:test";

import { applyThrust, headingX, headingY, stepPosition, wrap, wrapDelta } from "./geometry";

describe("wrap math", () => {
  test("wraps below zero and above max into [0, max)", () => {
    expect(wrap(-5, 800)).toBeCloseTo(795);
    expect(wrap(805, 800)).toBeCloseTo(5);
    expect(wrap(400, 800)).toBe(400);
    expect(wrap(800, 800)).toBe(0);
    expect(wrap(0, 800)).toBe(0);
  });

  test("toroidal shortest delta stays within +/- half the axis", () => {
    expect(wrapDelta(10, 790, 800)).toBeCloseTo(-20);
    expect(wrapDelta(790, 10, 800)).toBeCloseTo(20);
    expect(wrapDelta(400, 500, 800)).toBeCloseTo(100);
  });

  test("heading vector points up at angle 0", () => {
    expect(headingX(0)).toBeCloseTo(0);
    expect(headingY(0)).toBeCloseTo(-1);
  });
});

describe("inertia integration", () => {
  test("thrust adds velocity along the heading", () => {
    const [vx, vy] = applyThrust(0, 0, 0, 340, 0.1, 360);
    expect(vx).toBeCloseTo(0, 5);
    expect(vy).toBeCloseTo(-34, 3);
  });

  test("speed is clamped to the gentle cap", () => {
    const [vx, vy] = applyThrust(360, 0, Math.PI / 2, 340, 1, 360);
    expect(Math.hypot(vx, vy)).toBeCloseTo(360, 3);
  });

  test("drag-free drift keeps momentum: position advances linearly with constant velocity", () => {
    let x = 10;
    let y = 10;
    [x, y] = stepPosition(x, y, 100, 0, 0.1, 800, 600);
    expect(x).toBeCloseTo(20);
    [x, y] = stepPosition(x, y, 100, 0, 0.1, 800, 600);
    expect(x).toBeCloseTo(30);
    expect(y).toBeCloseTo(10);
  });

  test("drift wraps across the screen edge", () => {
    const [wx] = stepPosition(795, 300, 100, 0, 0.1, 800, 600);
    expect(wx).toBeCloseTo(5);
  });
});
