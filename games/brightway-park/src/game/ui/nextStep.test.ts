import { describe, expect, test } from "bun:test";

import { MILESTONES } from "../milestones";
import { nextMilestone, nextStepText } from "./nextStep";

describe("objective next step", () => {
  test("starts with the first award", () => {
    expect(nextMilestone(0)?.id).toBe("campfire_story");
    expect(nextStepText(0)).toBe("Spread the rumor to 250 for Campfire Story (500 ecto)");
  });

  test("a rating exactly on an award moves on to the next one", () => {
    expect(nextMilestone(250)?.rating).toBe(400);
  });

  test("text names the target rumor, the award and its prize", () => {
    for (const m of MILESTONES) {
      const text = nextStepText(m.rating - 1)!;
      expect(text).toContain(`rumor to ${m.rating}`);
      expect(text).toContain(m.label);
      expect(text).toContain(`${m.prize.toLocaleString()} ecto`);
    }
  });

  test("returns null once every award is won", () => {
    const top = MILESTONES[MILESTONES.length - 1]!;
    expect(nextMilestone(top.rating)).toBeNull();
    expect(nextStepText(top.rating + 100)).toBeNull();
  });
});
