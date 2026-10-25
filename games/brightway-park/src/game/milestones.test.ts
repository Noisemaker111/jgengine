import { describe, expect, test } from "bun:test";

import { MILESTONES, milestonesCrossed, nextMilestone } from "./milestones";

describe("brightway-park awards", () => {
  test("awards climb in rating and prize, each with its own id", () => {
    expect(new Set(MILESTONES.map((milestone) => milestone.id)).size).toBe(MILESTONES.length);
    for (let i = 1; i < MILESTONES.length; i += 1) {
      expect(MILESTONES[i]!.rating).toBeGreaterThan(MILESTONES[i - 1]!.rating);
      expect(MILESTONES[i]!.prize).toBeGreaterThan(MILESTONES[i - 1]!.prize);
    }
  });

  test("crossing names each award once, and the next one is the first unreached", () => {
    expect(milestonesCrossed(0, 420).map((m) => m.id)).toEqual(["tidy_start", "family_fun"]);
    expect(milestonesCrossed(420, 420)).toEqual([]);
    expect(nextMilestone(420)?.id).toBe("thrill_seekers");
    expect(nextMilestone(10_000)).toBeNull();
  });
});
