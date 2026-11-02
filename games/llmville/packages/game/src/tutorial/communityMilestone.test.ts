import { describe, expect, test } from "bun:test";
import { communityMilestone, COMMUNITY_LAUNCH_TARGET } from "@llmville/game/tutorial/communityMilestone";

describe("neighbourhood goal", () => {
  test("progress counts launched labs up to the target and completes at it", () => {
    for (const launched of [-2, 0, 1, 4, 5, 6, 40, 2.5]) {
      const milestone = communityMilestone(launched);
      expect(milestone.target).toBe(COMMUNITY_LAUNCH_TARGET);
      expect(milestone.progress).toBe(Math.min(COMMUNITY_LAUNCH_TARGET, Math.max(0, launched)));
      expect(milestone.complete).toBe(launched >= COMMUNITY_LAUNCH_TARGET);
    }
  });
});
