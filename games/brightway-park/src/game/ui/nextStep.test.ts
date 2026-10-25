import { describe, expect, test } from "bun:test";

import { MILESTONES } from "../milestones";
import { nextMilestone, nextStepText } from "./nextStep";

describe("objective next step", () => {
  test("starts with the first award", () => {
    expect(nextMilestone(0)?.id).toBe("tidy_start");
    expect(nextStepText(0)).toBe("Reach a 250 ★ rating for the Promising Newcomer award ($500)");
  });

  test("a rating exactly on an award moves on to the next one", () => {
    expect(nextMilestone(250)?.rating).toBe(400);
  });

  test("text names the target rating, the award and its prize", () => {
    for (const m of MILESTONES) {
      const text = nextStepText(m.rating - 1)!;
      expect(text).toContain(`${m.rating} ★`);
      expect(text).toContain(m.label);
      expect(text).toContain(`$${m.prize.toLocaleString()}`);
    }
  });

  test("returns null once every award is won", () => {
    const top = MILESTONES[MILESTONES.length - 1]!;
    expect(nextMilestone(top.rating)).toBeNull();
    expect(nextStepText(top.rating + 100)).toBeNull();
  });
});
