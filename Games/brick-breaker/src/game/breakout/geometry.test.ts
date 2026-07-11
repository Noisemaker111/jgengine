import { describe, expect, test } from "bun:test";

import { MAX_BOUNCE_DEG, MIN_VERTICAL_DIR } from "./constants";
import { circleRectHit, enforceVertical, normalize, paddleBounceDir, reflect, rotate } from "./geometry";

describe("paddle reflection", () => {
  test("centre hit bounces nearly straight up", () => {
    const dir = paddleBounceDir(0);
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.y).toBeCloseTo(-1, 6);
  });

  test("edge hit is steeper (more horizontal) than a centre hit", () => {
    const near = paddleBounceDir(0.1);
    const edge = paddleBounceDir(1);
    expect(Math.abs(edge.x)).toBeGreaterThan(Math.abs(near.x));
    expect(edge.x).toBeGreaterThan(0);
    expect(edge.y).toBeLessThan(0);
    const angleFromVertical = Math.atan2(edge.x, -edge.y) * (180 / Math.PI);
    expect(angleFromVertical).toBeCloseTo(MAX_BOUNCE_DEG, 1);
  });

  test("left half of the paddle steers the ball left", () => {
    expect(paddleBounceDir(-1).x).toBeLessThan(0);
  });

  test("offset is clamped beyond the paddle edge", () => {
    expect(paddleBounceDir(5).x).toBeCloseTo(paddleBounceDir(1).x, 8);
  });

  test("always returns a unit direction", () => {
    for (const offset of [-1, -0.4, 0, 0.25, 1]) {
      const dir = paddleBounceDir(offset);
      expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
    }
  });
});

describe("circle vs brick collision", () => {
  const brick = { x: 100, y: 100, w: 40, h: 20 };

  test("no hit when the ball is far away", () => {
    expect(circleRectHit(10, 10, 6.5, brick.x, brick.y, brick.w, brick.h).hit).toBe(false);
  });

  test("ball under the brick hits the bottom face (normal points down)", () => {
    const hit = circleRectHit(120, 124, 6.5, brick.x, brick.y, brick.w, brick.h);
    expect(hit.hit).toBe(true);
    expect(hit.nx).toBe(0);
    expect(hit.ny).toBe(1);
  });

  test("ball left of the brick hits the side face (normal points left)", () => {
    const hit = circleRectHit(96, 110, 6.5, brick.x, brick.y, brick.w, brick.h);
    expect(hit.hit).toBe(true);
    expect(hit.nx).toBe(-1);
    expect(hit.ny).toBe(0);
  });

  test("deep overlap near an edge resolves along the shallow axis", () => {
    const hit = circleRectHit(102, 110, 6.5, brick.x, brick.y, brick.w, brick.h);
    expect(hit.hit).toBe(true);
    expect(hit.nx).toBe(-1);
    expect(hit.ny).toBe(0);
  });
});

describe("reflection helpers", () => {
  test("reflecting off a bottom face sends an upward ball downward, staying unit", () => {
    const dir = reflect(normalize(0.3, -0.95), 0, 1);
    expect(dir.y).toBeGreaterThan(0);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
  });

  test("reflecting off a side flips the horizontal component", () => {
    const dir = reflect(normalize(0.6, -0.8), -1, 0);
    expect(dir.x).toBeLessThan(0);
  });

  test("enforceVertical lifts a near-horizontal direction above the floor", () => {
    const dir = enforceVertical({ x: 1, y: 0.01 });
    expect(Math.abs(dir.y)).toBeGreaterThanOrEqual(MIN_VERTICAL_DIR - 1e-6);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
  });

  test("rotate preserves magnitude and turns the vector", () => {
    const dir = rotate({ x: 0, y: -1 }, 30);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
    expect(dir.x).not.toBe(0);
  });
});
