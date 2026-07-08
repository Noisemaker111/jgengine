import { describe, expect, test } from "bun:test";

import { goalProgress, isCoinCollected, isHazardHit, isSideHit, isStomp, patrolStep, reachedGoal } from "./physics";
import { COIN_RADIUS, GOAL_X, HAZARD_HALF_X, HAZARD_HALF_Y, SPAWN } from "./tuning";

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

describe("isHazardHit", () => {
  test("true when standing on a spike", () => {
    expect(isHazardHit({ x: -4, y: 0 }, { x: -4, y: 0 })).toBe(true);
  });

  test("true within the hazard's half extents", () => {
    expect(
      isHazardHit({ x: -4 + HAZARD_HALF_X - 0.1, y: HAZARD_HALF_Y - 0.1 }, { x: -4, y: 0 }),
    ).toBe(true);
  });

  test("false once cleared by a jump above the spike", () => {
    expect(isHazardHit({ x: -4, y: HAZARD_HALF_Y + 0.5 }, { x: -4, y: 0 })).toBe(false);
  });

  test("false when horizontally clear of the spike", () => {
    expect(isHazardHit({ x: -4 + HAZARD_HALF_X + 1, y: 0 }, { x: -4, y: 0 })).toBe(false);
  });
});

describe("isCoinCollected", () => {
  test("true when overlapping the coin within its pickup radius", () => {
    expect(isCoinCollected({ x: -1, y: 0.9 }, { x: -1, y: 0.9 })).toBe(true);
  });

  test("false when the player has not reached the coin's height", () => {
    expect(isCoinCollected({ x: -1, y: 0.9 - COIN_RADIUS - 0.3 }, { x: -1, y: 0.9 })).toBe(false);
  });

  test("false just outside the pickup radius", () => {
    expect(isCoinCollected({ x: -1 + COIN_RADIUS + 0.1, y: 0.9 }, { x: -1, y: 0.9 })).toBe(false);
  });
});

describe("goalProgress", () => {
  test("zero at spawn", () => {
    expect(goalProgress(SPAWN[0])).toBeCloseTo(0);
  });

  test("one at the goal line", () => {
    expect(goalProgress(GOAL_X)).toBeCloseTo(1);
  });

  test("clamps past the goal line", () => {
    expect(goalProgress(GOAL_X - 10)).toBe(1);
  });

  test("midpoint is roughly half progress", () => {
    const midpoint = (SPAWN[0] + GOAL_X) / 2;
    expect(goalProgress(midpoint)).toBeCloseTo(0.5);
  });
});
