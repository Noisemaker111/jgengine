import { describe, expect, test } from "bun:test";

import { collideBarrier, collideDisc, collideFlipper, collideWall, speed } from "./physics";
import type { Ball, Flipper, Wall } from "./types";

const floor: Wall = { ax: 0, ay: 100, bx: 200, by: 100, nx: 0, ny: -1, e: 0.5 };
const leftWall: Wall = { ax: 8, ay: 40, bx: 8, by: 300, nx: 1, ny: 0, e: 0.46 };

function ball(x: number, y: number, vx: number, vy: number): Ball {
  return { x, y, vx, vy, r: 5 };
}

describe("wall reflection", () => {
  test("reflects the normal component with restitution and snaps to the surface", () => {
    const b = ball(100, 96, 0, 50);
    expect(collideWall(b, floor)).toBe(true);
    expect(b.y).toBeCloseTo(95, 5); // signed distance restored to r
    expect(b.vy).toBeLessThan(0); // bounced up
    expect(b.vy).toBeCloseTo(-50 * 0.5, 5); // |v'| = e * |v|
  });

  test("tangential velocity is preserved", () => {
    const b = ball(100, 96, 40, 50);
    collideWall(b, floor);
    expect(b.vx).toBeCloseTo(40, 5);
  });

  test("no contact when clearly separated", () => {
    const b = ball(100, 80, 0, 10);
    expect(collideWall(b, floor)).toBe(false);
  });

  test("a ball that fully crossed the wall is snapped back to the interior side (tunnel-proof)", () => {
    const b = ball(100, 130, 0, 400); // 30 units past the y=100 floor
    expect(collideWall(b, floor)).toBe(true);
    expect(b.y).toBeCloseTo(95, 5); // pushed back to interior, never left behind the wall
    expect(b.vy).toBeLessThan(0);
  });
});

describe("substep no-tunneling at max speed", () => {
  test("a ball fired at the wall at max speed never ends up behind it", () => {
    const b = ball(80, 150, -780, 0); // straight at the left wall (x=8)
    const dt = 1 / 60;
    const steps = 6;
    const h = dt / steps;
    let minX = b.x;
    for (let frame = 0; frame < 8; frame += 1) {
      for (let i = 0; i < steps; i += 1) {
        b.x += b.vx * h;
        b.y += b.vy * h;
        collideWall(b, leftWall);
        minX = Math.min(minX, b.x);
      }
    }
    expect(minX).toBeGreaterThanOrEqual(8); // never crossed to the far side
    expect(b.vx).toBeGreaterThan(0); // reflected back into the field
  });
});

describe("disc (bumper) reflection", () => {
  test("pushes the ball out along the contact normal and adds a kick", () => {
    const b = ball(10, 0, 0, 0);
    const before = speed(b);
    expect(collideDisc(b, 0, 0, 9, 0.4, 100)).toBe(true);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(14, 5); // r + cr
    expect(b.vx).toBeGreaterThan(0); // kicked outward (+x)
    expect(speed(b)).toBeGreaterThan(before);
  });
});

describe("two-sided barrier", () => {
  test("resolves from either side of the capsule", () => {
    const left = ball(4, 50, 6, 0);
    expect(collideBarrier(left, 8, 0, 8, 100, 1.5, 0.42)).toBe(true);
    expect(left.x).toBeLessThan(8); // stayed on its (left) side
    expect(left.vx).toBeLessThan(0);

    const right = ball(12, 50, -6, 0);
    expect(collideBarrier(right, 8, 0, 8, 100, 1.5, 0.42)).toBe(true);
    expect(right.x).toBeGreaterThan(8);
    expect(right.vx).toBeGreaterThan(0);
  });
});

function leftFlipper(angle: number, omega: number): Flipper {
  return { side: "left", px: 68, py: 316, len: 40, capR: 6, rest: 0.733, active: -0.05, angle, omega, up: false, glow: 0 };
}

describe("flipper impulse at contact point", () => {
  test("a moving (upswinging) flipper imparts more energy than a still one", () => {
    // contact point ~ t=0.6 along the resting flipper, ball resting just above it
    const angle = 0.733;
    const qx = 68 + 24 * Math.cos(angle);
    const qy = 316 + 24 * Math.sin(angle);

    const still = ball(qx, qy - 9, 0, 40);
    expect(collideFlipper(still, leftFlipper(angle, 0), 0.34)).toBe(true);
    const stillSpeed = speed(still);

    const moving = ball(qx, qy - 9, 0, 40);
    expect(collideFlipper(moving, leftFlipper(angle, -9), 0.34)).toBe(true);
    const movingSpeed = speed(moving);

    expect(movingSpeed).toBeGreaterThan(stillSpeed);
    expect(moving.vy).toBeLessThan(0); // launched upward
  });

  test("a still flipper only bounces (bounded by restitution)", () => {
    const angle = 0.733;
    const qx = 68 + 24 * Math.cos(angle);
    const qy = 316 + 24 * Math.sin(angle);
    const b = ball(qx, qy - 9, 0, 40);
    collideFlipper(b, leftFlipper(angle, 0), 0.34);
    expect(speed(b)).toBeLessThanOrEqual(40 + 1e-6); // no energy added
  });
});
