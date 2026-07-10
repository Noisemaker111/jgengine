import { describe, expect, test } from "bun:test";

import { legProgressFraction, overallProgressFraction } from "./progress";
import { ROUTE } from "./legs";

describe("route progress", () => {
  test("progress is 0 at a leg's start and 1 at its handoff", () => {
    const leg = ROUTE.legs[0]!;
    expect(legProgressFraction(0, leg.startCheckpoint.position[2])).toBe(0);
    expect(legProgressFraction(0, leg.handoffCheckpoint.position[2])).toBe(1);
  });

  test("clamps outside the leg's z span", () => {
    const leg = ROUTE.legs[0]!;
    expect(legProgressFraction(0, leg.startCheckpoint.position[2] - 50)).toBe(0);
    expect(legProgressFraction(0, leg.handoffCheckpoint.position[2] + 50)).toBe(1);
  });

  test("overall progress advances monotonically with leg index", () => {
    const leg2Start = ROUTE.legs[2]!.startCheckpoint.position[2];
    const a = overallProgressFraction(0, leg2Start);
    const b = overallProgressFraction(2, leg2Start);
    expect(b).toBeGreaterThan(a);
  });

  test("overall progress reaches 1 at the finish", () => {
    const finish = ROUTE.legs[ROUTE.legs.length - 1]!;
    expect(overallProgressFraction(ROUTE.legs.length - 1, finish.handoffCheckpoint.position[2])).toBe(1);
  });
});
