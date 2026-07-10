import { describe, expect, test } from "bun:test";
import { guardPhaseAt, guardPositionAt, type GuardDef } from "./guardSchedule";

const guard: GuardDef = {
  id: "test_guard",
  name: "Test Guard",
  wing: "servants",
  waypoints: [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 0],
  ],
  speed: 2,
  visionRadius: 6,
  visionAngleDeg: 70,
  loopSeconds: 20,
};

describe("guardPositionAt", () => {
  test("is a pure function of t — same t always yields same pose", () => {
    const a = guardPositionAt(guard, 7.3);
    const b = guardPositionAt(guard, 7.3);
    expect(a).toEqual(b);
  });

  test("preview(t) equals live(t) for the same guard and time", () => {
    for (const t of [0, 3.1, 9.9, 12, 15.4, 40]) {
      expect(guardPositionAt(guard, t)).toEqual(guardPositionAt(guard, t));
    }
  });

  test("starts at the first waypoint at t=0", () => {
    const pose = guardPositionAt(guard, 0);
    expect(pose.position).toEqual([0, 0, 0]);
  });

  test("wraps seamlessly at the loop boundary with no position jump", () => {
    const totalLength = 10 + 10 + Math.hypot(10, 10);
    const loopSeconds = totalLength / guard.speed;
    const justBefore = guardPositionAt(guard, loopSeconds - 0.001);
    const atWrap = guardPositionAt(guard, loopSeconds);
    const dist = Math.hypot(
      justBefore.position[0] - atWrap.position[0],
      justBefore.position[2] - atWrap.position[2],
    );
    expect(dist).toBeLessThan(0.02);
  });

  test("moves along the path over time", () => {
    const early = guardPositionAt(guard, 0.5);
    expect(early.position[0]).toBeGreaterThan(0);
    expect(early.position[2]).toBe(0);
  });
});

describe("guardPhaseAt", () => {
  test("is 0 at t=0 and increases monotonically within one loop", () => {
    expect(guardPhaseAt(guard, 0)).toBe(0);
    const p1 = guardPhaseAt(guard, 1);
    const p2 = guardPhaseAt(guard, 2);
    expect(p2).toBeGreaterThan(p1);
  });

  test("stays within [0, 1)", () => {
    for (const t of [0, 5, 17, 33, 100]) {
      const phase = guardPhaseAt(guard, t);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
