import { describe, expect, test } from "bun:test";

import { aabbOverlap, clamp } from "./geometry";

describe("aabb collision", () => {
  const box = { x: 100, y: 100, w: 20, h: 10 };

  test("overlapping rectangles collide", () => {
    expect(aabbOverlap(box, { x: 110, y: 105, w: 20, h: 10 })).toBe(true);
  });

  test("a thin bullet inside the box collides", () => {
    expect(aabbOverlap({ x: 108, y: 102, w: 1, h: 5 }, box)).toBe(true);
  });

  test("separated rectangles do not collide", () => {
    expect(aabbOverlap(box, { x: 200, y: 100, w: 10, h: 10 })).toBe(false);
  });

  test("edge-flush rectangles are treated as not overlapping", () => {
    expect(aabbOverlap(box, { x: 120, y: 100, w: 10, h: 10 })).toBe(false);
  });

  test("a box fully above another does not collide", () => {
    expect(aabbOverlap(box, { x: 100, y: 80, w: 20, h: 10 })).toBe(false);
  });
});

describe("clamp", () => {
  test("clamps below, within, and above the range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});
