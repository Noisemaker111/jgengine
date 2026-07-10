import { describe, expect, test } from "bun:test";

import {
  AI_TABLE,
  BALL_MAX_VERTICAL_SPEED,
  MAX_BOUNCE_ANGLE,
  MAX_SPEED,
  PADDLE_HALF,
  SERVE_SPEED,
} from "../rules";
import {
  clampPaddleY,
  isMatchPoint,
  matchWinner,
  paddleBounce,
  serverFor,
  speedUp,
  stepToward,
} from "./sim";

const magnitude = (vx: number, vy: number): number => Math.hypot(vx, vy);

describe("paddleBounce", () => {
  test("a dead-center hit returns the ball flat and preserves speed", () => {
    const v = paddleBounce(60, 60, PADDLE_HALF, 100, 1);
    expect(v.vy).toBeCloseTo(0, 6);
    expect(v.vx).toBeCloseTo(100, 6);
    expect(magnitude(v.vx, v.vy)).toBeCloseTo(100, 6);
  });

  test("hit offset above center sends the ball upward, below center downward", () => {
    const up = paddleBounce(60 - PADDLE_HALF, 60, PADDLE_HALF, 100, 1);
    const down = paddleBounce(60 + PADDLE_HALF, 60, PADDLE_HALF, 100, 1);
    expect(up.vy).toBeCloseTo(-100 * Math.sin(MAX_BOUNCE_ANGLE), 5);
    expect(down.vy).toBeCloseTo(100 * Math.sin(MAX_BOUNCE_ANGLE), 5);
    expect(magnitude(up.vx, up.vy)).toBeCloseTo(100, 6);
  });

  test("direction sets the horizontal sign and offset clamps at the paddle edge", () => {
    const left = paddleBounce(60, 60, PADDLE_HALF, 120, 1);
    const right = paddleBounce(60, 60, PADDLE_HALF, 120, -1);
    expect(left.vx).toBeGreaterThan(0);
    expect(right.vx).toBeLessThan(0);
    const edge = paddleBounce(60 + PADDLE_HALF, 60, PADDLE_HALF, 120, 1);
    const beyond = paddleBounce(60 + PADDLE_HALF * 4, 60, PADDLE_HALF, 120, 1);
    expect(beyond.vy).toBeCloseTo(edge.vy, 6);
    expect(beyond.vx).toBeCloseTo(edge.vx, 6);
  });

  test("speed carries through the bounce at every offset", () => {
    for (const y of [40, 55, 60, 66, 78]) {
      const v = paddleBounce(y, 60, PADDLE_HALF, 140, 1);
      expect(magnitude(v.vx, v.vy)).toBeCloseTo(140, 5);
    }
  });
});

describe("speedUp", () => {
  test("each volley speeds the ball up and caps at MAX_SPEED", () => {
    expect(speedUp(SERVE_SPEED)).toBeGreaterThan(SERVE_SPEED);
    expect(speedUp(MAX_SPEED)).toBe(MAX_SPEED);
    let s = SERVE_SPEED;
    for (let i = 0; i < 200; i += 1) s = speedUp(s);
    expect(s).toBe(MAX_SPEED);
  });
});

describe("scoring and deuce", () => {
  test("first to 11 wins when leading by two or more", () => {
    expect(matchWinner(11, 5)).toBe("L");
    expect(matchWinner(6, 11)).toBe("R");
    expect(matchWinner(11, 9)).toBe("L");
    expect(matchWinner(9, 9)).toBeNull();
    expect(matchWinner(0, 0)).toBeNull();
  });

  test("deuce requires a two-point lead past 10-10", () => {
    expect(matchWinner(10, 10)).toBeNull();
    expect(matchWinner(11, 10)).toBeNull();
    expect(matchWinner(12, 10)).toBe("L");
    expect(matchWinner(10, 12)).toBe("R");
    expect(matchWinner(15, 13)).toBe("L");
    expect(matchWinner(14, 13)).toBeNull();
  });

  test("match point is exactly when one more point would win", () => {
    expect(isMatchPoint(10, 5)).toBe(true);
    expect(isMatchPoint(10, 9)).toBe(true);
    expect(isMatchPoint(9, 5)).toBe(false);
    expect(isMatchPoint(10, 10)).toBe(false);
    expect(isMatchPoint(11, 10)).toBe(true);
    expect(isMatchPoint(10, 11)).toBe(false);
  });

  test("serve alternates every five total points", () => {
    expect(serverFor(0, "L")).toBe("L");
    expect(serverFor(4, "L")).toBe("L");
    expect(serverFor(5, "L")).toBe("R");
    expect(serverFor(9, "L")).toBe("R");
    expect(serverFor(10, "L")).toBe("L");
    expect(serverFor(5, "R")).toBe("L");
  });
});

describe("AI difficulty clamps", () => {
  test("paddle speed rises with difficulty but stays below the ball's max vertical speed so every tier is beatable", () => {
    expect(AI_TABLE.easy.speed).toBeLessThan(AI_TABLE.medium.speed);
    expect(AI_TABLE.medium.speed).toBeLessThan(AI_TABLE.hard.speed);
    expect(AI_TABLE.hard.speed).toBeLessThan(BALL_MAX_VERTICAL_SPEED);
  });

  test("aim error and reaction delay shrink as difficulty rises", () => {
    expect(AI_TABLE.easy.aimError).toBeGreaterThan(AI_TABLE.medium.aimError);
    expect(AI_TABLE.medium.aimError).toBeGreaterThan(AI_TABLE.hard.aimError);
    expect(AI_TABLE.easy.reaction).toBeGreaterThan(AI_TABLE.medium.reaction);
    expect(AI_TABLE.medium.reaction).toBeGreaterThan(AI_TABLE.hard.reaction);
    expect(AI_TABLE.hard.aimError).toBeGreaterThan(0);
    expect(AI_TABLE.hard.reaction).toBeGreaterThan(0);
  });

  test("stepToward never moves more than the per-frame cap and snaps on arrival", () => {
    expect(stepToward(0, 100, 10)).toBe(10);
    expect(stepToward(0, -100, 10)).toBe(-10);
    expect(stepToward(0, 4, 10)).toBe(4);
    const capped = stepToward(60, 200, AI_TABLE.hard.speed * (1 / 60));
    expect(Math.abs(capped - 60)).toBeLessThanOrEqual(AI_TABLE.hard.speed * (1 / 60) + 1e-9);
  });

  test("clampPaddleY keeps the paddle fully inside the court", () => {
    expect(clampPaddleY(-50)).toBe(PADDLE_HALF);
    expect(clampPaddleY(9999)).toBe(120 - PADDLE_HALF);
    expect(clampPaddleY(60)).toBe(60);
  });
});
