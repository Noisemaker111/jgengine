import { describe, expect, test } from "bun:test";

import { CHECKPOINTS, TRACK } from "./checkpoints";
import { BRIDGE_HEIGHT } from "./geometry";

describe("race checkpoints", () => {
  test("declares an ordered ring ending in the finish line", () => {
    expect(CHECKPOINTS.length).toBeGreaterThanOrEqual(6);
    expect(CHECKPOINTS[CHECKPOINTS.length - 1]!.id).toBe("finish");
  });

  test("the finish checkpoint sits at grade and excludes the elevated bridge pass", () => {
    const finish = CHECKPOINTS[CHECKPOINTS.length - 1]!;
    expect(finish.center[1]).toBeCloseTo(0, 5);
    expect(finish.half[1]).toBeLessThan(BRIDGE_HEIGHT);
  });

  test("the race track never auto-finishes in endless mode", () => {
    expect(TRACK.laps).toBeGreaterThan(1000);
  });
});
