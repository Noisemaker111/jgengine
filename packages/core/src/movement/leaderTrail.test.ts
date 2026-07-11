import { describe, expect, test } from "bun:test";

import { createLeaderTrail } from "@jgengine/core/movement/leaderTrail";

function walkLine(trail: ReturnType<typeof createLeaderTrail>, fromZ: number, toZ: number, step: number) {
  for (let z = fromZ; z <= toZ + 1e-9; z += step) trail.record([0, 0, z]);
}

describe("createLeaderTrail", () => {
  test("followers sit at arc-length spacing behind the leader", () => {
    const trail = createLeaderTrail({ spacing: 2 });
    walkLine(trail, 0, 10, 0.5);
    const first = trail.followerAt(0)!;
    const second = trail.followerAt(1)!;
    expect(first.position[2]).toBeCloseTo(8, 5);
    expect(second.position[2]).toBeCloseTo(6, 5);
    expect(first.heading).toBeCloseTo(0, 5);
  });

  test("returns null until enough trail has been recorded", () => {
    const trail = createLeaderTrail({ spacing: 3 });
    expect(trail.followerAt(0)).toBeNull();
    walkLine(trail, 0, 2, 0.5);
    expect(trail.followerAt(0)).toBeNull();
    walkLine(trail, 2.5, 4, 0.5);
    expect(trail.followerAt(0)).not.toBeNull();
  });

  test("small jitters below sampleDistance are not recorded", () => {
    const trail = createLeaderTrail({ spacing: 2, sampleDistance: 0.5 });
    trail.record([0, 0, 0]);
    for (let i = 0; i < 50; i += 1) trail.record([0, 0, 0.1]);
    expect(trail.length()).toBe(0);
  });

  test("history is capped to what maxFollowers needs", () => {
    const trail = createLeaderTrail({ spacing: 1, maxFollowers: 2 });
    walkLine(trail, 0, 100, 0.25);
    expect(trail.length()).toBeLessThanOrEqual(3.5);
    expect(trail.followerAt(0)).not.toBeNull();
    expect(trail.followerAt(1)).not.toBeNull();
  });

  test("heading follows the trail direction at the follower's segment", () => {
    const trail = createLeaderTrail({ spacing: 1, sampleDistance: 0.25 });
    walkLine(trail, 0, 4, 0.25);
    for (let x = 0.25; x <= 4; x += 0.25) trail.record([x, 0, 4]);
    const nearLeader = trail.followerAt(0)!;
    expect(nearLeader.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  test("reset drops history", () => {
    const trail = createLeaderTrail({ spacing: 1 });
    walkLine(trail, 0, 5, 0.25);
    trail.reset([0, 0, 0]);
    expect(trail.length()).toBe(0);
    expect(trail.followerAt(0)).toBeNull();
  });
});
