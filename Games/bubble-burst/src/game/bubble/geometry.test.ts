import { describe, expect, test } from "bun:test";

import { AIM_MAX, AIM_MIN, FIELD_W, R, SHOOTER_X, SHOOTER_Y } from "./constants";
import { aimFromPoint, aimToDir, bounceX, clampAim } from "./geometry";

describe("geometry", () => {
  test("reflects off the left wall", () => {
    expect(bounceX(-5, -3)).toEqual({ x: R, vx: 3 });
  });

  test("reflects off the right wall", () => {
    expect(bounceX(FIELD_W + 5, 4)).toEqual({ x: FIELD_W - R, vx: -4 });
  });

  test("leaves an in-bounds step untouched", () => {
    expect(bounceX(100, 5)).toEqual({ x: 100, vx: 5 });
  });

  test("straight-up aim points up", () => {
    const dir = aimToDir(0);
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(-1);
  });

  test("clamps the cannon arc", () => {
    expect(clampAim(10)).toBe(AIM_MAX);
    expect(clampAim(-10)).toBe(AIM_MIN);
    expect(clampAim(0.2)).toBe(0.2);
  });

  test("aim toward a point above the shooter", () => {
    expect(aimFromPoint(SHOOTER_X, SHOOTER_Y - 100, SHOOTER_X, SHOOTER_Y)).toBeCloseTo(0);
    expect(aimFromPoint(SHOOTER_X + 100, SHOOTER_Y - 100, SHOOTER_X, SHOOTER_Y)).toBeCloseTo(Math.PI / 4);
  });
});
