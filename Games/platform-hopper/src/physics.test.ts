import { describe, expect, test } from "bun:test";

import { isSideHit, isStomp, patrolStep, reachedGoal } from "./physics";
import { GOAL_X } from "./tuning";

describe("patrolStep", () => {
  test("bounces off the right bound and reverses direction", () => {
    const next = patrolStep({ x: 4.9, dir: 1 }, 0, 5, 10, 0.1);
    expect(next.x).toBe(5);
    expect(next.dir).toBe(-1);
  });

  test("bounces off the left bound and reverses direction", () => {
    const next = patrolStep({ x: -4.9, dir: -1 }, 0, 5, 10, 0.1);
    expect(next.x).toBe(-5);
    expect(next.dir).toBe(1);
  });

  test("advances within bounds keeping direction", () => {
    const next = patrolStep({ x: 0, dir: 1 }, 0, 5, 2, 0.5);
    expect(next.x).toBeCloseTo(1);
    expect(next.dir).toBe(1);
  });
});

describe("isStomp", () => {
  test("true when descending onto an aligned enemy from above", () => {
    expect(isStomp({ x: 0, y: 0.9 }, -3, { x: 0.2, y: 0 })).toBe(true);
  });

  test("false when rising", () => {
    expect(isStomp({ x: 0, y: 0.9 }, 3, { x: 0, y: 0 })).toBe(false);
  });

  test("false when horizontally misaligned", () => {
    expect(isStomp({ x: 3, y: 0.9 }, -3, { x: 0, y: 0 })).toBe(false);
  });
});

describe("isSideHit", () => {
  test("true at the same level and column", () => {
    expect(isSideHit({ x: 0.3, y: 0.1 }, { x: 0, y: 0 })).toBe(true);
  });

  test("false when the player is well above the enemy", () => {
    expect(isSideHit({ x: 0, y: 1.5 }, { x: 0, y: 0 })).toBe(false);
  });
});

describe("reachedGoal", () => {
  test("true once past the goal line", () => {
    expect(reachedGoal(GOAL_X - 1)).toBe(true);
  });

  test("false before the goal line", () => {
    expect(reachedGoal(GOAL_X + 5)).toBe(false);
  });
});
