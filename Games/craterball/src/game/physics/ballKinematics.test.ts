import { describe, expect, test } from "bun:test";
import { bounceOffWall, createRestingBall, stepBall } from "./ballKinematics";
import { PITCH_RX } from "../arena/geometry";

describe("craterball ball kinematics", () => {
  test("open-ground friction slows a moving ball over time", () => {
    let ball = { x: 0, z: 0, vx: 10, vz: 0 };
    for (let i = 0; i < 30; i += 1) ball = stepBall(ball, 1 / 30, []);
    expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(10);
  });

  test("a resting ball with no craters nearby stays put", () => {
    const ball = createRestingBall(5, 5);
    const next = stepBall(ball, 1 / 30, []);
    expect(next).toEqual(ball);
  });

  test("crater pull curves a passing ball toward the crater center", () => {
    const crater = { x: 5, z: 0, radius: 3, depth: 1 };
    let ball = { x: 0, z: 1, vx: 6, vz: 0 };
    for (let i = 0; i < 60; i += 1) ball = stepBall(ball, 1 / 30, [crater]);
    expect(Math.abs(ball.z)).toBeLessThan(1);
  });

  test("inside a crater the ball slows faster than on open ground", () => {
    const crater = { x: 0, z: 0, radius: 4, depth: 1 };
    const openBall = stepBall({ x: 0, z: 0, vx: 5, vz: 0 }, 1, []);
    const craterBall = stepBall({ x: 0, z: 0, vx: 5, vz: 0 }, 1, [crater]);
    expect(Math.hypot(craterBall.vx, craterBall.vz)).toBeLessThan(Math.hypot(openBall.vx, openBall.vz));
  });

  test("bounceOffWall reflects a ball crossing the sideline back inward", () => {
    const outside = { x: 0, z: 20, vx: 0, vz: 8 };
    const bounced = bounceOffWall(outside);
    expect(bounced.vz).toBeLessThan(0);
    expect(Math.abs(bounced.z)).toBeLessThanOrEqual(20);
  });

  test("bounceOffWall leaves a ball inside the pitch untouched", () => {
    const inside = { x: 0, z: 0, vx: 3, vz: 3 };
    expect(bounceOffWall(inside)).toEqual(inside);
  });

  test("bounceOffWall loses energy on impact", () => {
    const outside = { x: PITCH_RX + 5, z: 0, vx: 10, vz: 0 };
    const bounced = bounceOffWall(outside);
    expect(Math.abs(bounced.vx)).toBeLessThan(10);
  });
});
