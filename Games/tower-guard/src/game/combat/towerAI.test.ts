import { describe, expect, test } from "bun:test";

import { chooseTarget, type TargetCandidate } from "./towerAI";

const CANDIDATES: TargetCandidate[] = [
  { id: "near-low-progress", position: [1, 0, 0], progress: 2 },
  { id: "far-high-progress", position: [8, 0, 0], progress: 40 },
  { id: "out-of-range", position: [50, 0, 0], progress: 100 },
];

describe("chooseTarget", () => {
  test("first policy picks the candidate furthest along the path within range", () => {
    const picked = chooseTarget("first", [0, 0, 0], 10, CANDIDATES);
    expect(picked).toBe("far-high-progress");
  });

  test("nearest policy picks the closest candidate within range", () => {
    const picked = chooseTarget("nearest", [0, 0, 0], 10, CANDIDATES);
    expect(picked).toBe("near-low-progress");
  });

  test("candidates outside range are excluded", () => {
    const picked = chooseTarget("first", [0, 0, 0], 10, CANDIDATES);
    expect(picked).not.toBe("out-of-range");
  });

  test("returns null when nothing is in range", () => {
    const picked = chooseTarget("first", [0, 0, 0], 3, [CANDIDATES[2]!]);
    expect(picked).toBeNull();
  });

  test("returns null with no candidates", () => {
    expect(chooseTarget("first", [0, 0, 0], 10, [])).toBeNull();
  });
});
