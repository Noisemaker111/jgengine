import { describe, expect, test } from "bun:test";

import { compareLocomotion, formatLocomotionComparison, measureLocomotion, referenceLocomotion } from "./compareLocomotion";
import { RECREATIONAL_SPRINT_PROFILE, sprintTopSpeed, timeToSpeed, turnaroundTime } from "./humanEnvelope";

describe("locomotion compare", () => {
  test("a person at walking speed starts, stops and turns within everyday limits", () => {
    const walk = referenceLocomotion(1.4);
    expect(walk.topSpeed).toBe(1.4);
    expect(walk.startTime).toBeGreaterThan(0.35);
    expect(walk.startTime).toBeLessThan(1);
    expect(walk.stopDistance).toBeGreaterThan(0.3);
    expect(walk.stopDistance).toBeLessThan(1);
    expect(walk.turnRadius).toBeLessThan(1);
    expect(walk.uphillSpeedRatio).toBeLessThan(1);
    expect(walk.jumpHeight).toBeGreaterThan(0.3);
  });

  test("the reference caps speed below the human's top speed, where it can still turn", () => {
    const fast = referenceLocomotion(20);
    expect(fast.topSpeed).toBeCloseTo(0.95 * sprintTopSpeed(RECREATIONAL_SPRINT_PROFILE), 6);
    expect(Number.isFinite(fast.turnRadius)).toBe(true);
    expect(fast.turnRadius).toBeGreaterThan(referenceLocomotion(4).turnRadius);
  });

  test("turnaround is braking to rest plus the sprint back up", () => {
    const speed = 5;
    expect(turnaroundTime(RECREATIONAL_SPRINT_PROFILE, speed)).toBeCloseTo(speed / 6 + timeToSpeed(RECREATIONAL_SPRINT_PROFILE, speed), 9);
    expect(timeToSpeed(RECREATIONAL_SPRINT_PROFILE, 100)).toBeLessThan(30);
  });

  test("a game character is measured on the movement model", () => {
    const game = measureLocomotion({ walkSpeed: 4, physics: { gravity: -24, jumpVelocity: 8 }, movement: { maxClimbGrade: 0.05 } });
    expect(game.topSpeed).toBeGreaterThan(4);
    expect(game.turnRadius).toBeGreaterThan(0);
    expect(game.landingSpeed).toBeCloseTo(Math.sqrt(2 * 24 * game.jumpHeight), 9);
    expect(game.uphillSpeedRatio).toBe(0);
    expect(measureLocomotion({ walkSpeed: 4 }).uphillSpeedRatio).toBe(1);
  });

  test("compare rows divide game by reference and format as a table", () => {
    const rows = compareLocomotion({ walkSpeed: 1.4 });
    expect(rows.map((r) => r.metric)).toEqual(["topSpeed", "startTime", "stopDistance", "turnAroundTime", "turnRadius", "jumpHeight", "airTime", "landingSpeed", "uphillSpeedRatio"]);
    for (const row of rows) if (row.reference !== 0) expect(row.ratio).toBeCloseTo(row.game / row.reference, 9);
    const table = formatLocomotionComparison(rows);
    expect(table.split("\n")).toHaveLength(rows.length + 2);
  });
});
