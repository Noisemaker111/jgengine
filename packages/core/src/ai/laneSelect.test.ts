import { describe, expect, test } from "bun:test";

import { corridorCost, pickLane } from "@jgengine/core/ai/laneSelect";

describe("pickLane", () => {
  test("returns the cheapest candidate", () => {
    expect(pickLane([{ id: "a", cost: 5 }, { id: "b", cost: 2 }, { id: "c", cost: 9 }])).toBe("b");
  });

  test("returns null for an empty candidate list", () => {
    expect(pickLane([])).toBeNull();
  });

  test("keeps the current lane when a rival isn't decisively cheaper", () => {
    const result = pickLane([{ id: "cur", cost: 10 }, { id: "rival", cost: 9 }], { current: "cur" });
    expect(result).toBe("cur");
  });

  test("switches lanes when a rival is cheaper than current/stickiness", () => {
    const result = pickLane([{ id: "cur", cost: 10 }, { id: "rival", cost: 5 }], { current: "cur" });
    expect(result).toBe("rival");
  });

  test("tieEpsilon plus a seeded rng picks deterministically among near-ties", () => {
    const candidates = [{ id: "a", cost: 5 }, { id: "b", cost: 5.05 }, { id: "c", cost: 5.1 }];
    expect(pickLane(candidates, { tieEpsilon: 0.2, rng: () => 0.99 })).toBe("c");
    expect(pickLane(candidates, { tieEpsilon: 0.2, rng: () => 0 })).toBe("a");
  });
});

describe("corridorCost", () => {
  test("sums costAt over every sample point", () => {
    const total = corridorCost([[0, 0], [1, 1], [2, 2]], (x, z) => x + z);
    expect(total).toBe(6);
  });
});
