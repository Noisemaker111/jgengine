import { expect, test } from "bun:test";

import type { TrackedQuestView } from "@jgengine/core/mission/quest";
import { onboardingWindow } from "@jgengine/core/onboarding/onboarding.view";

const quest: TrackedQuestView = {
  id: "first-day",
  title: "Path",
  status: "active",
  objectives: ["a", "b", "c", "d"].map((id, index) => ({ id, label: id, count: 1, progress: index === 0 ? 1 : 0, complete: index === 0 })),
};

test("a window shows the current step and the steps ahead, counting where the player is", () => {
  const shown = onboardingWindow(quest, "b", 1);
  expect(shown.objectives.map((objective) => objective.id)).toEqual(["b", "c"]);
  expect(shown.title).toBe("Path · 2 of 4");
  expect(onboardingWindow(quest, "d", 3).objectives.map((objective) => objective.id)).toEqual(["d"]);
});

test("no window, or no current step, keeps every step", () => {
  expect(onboardingWindow(quest, "b", undefined)).toBe(quest);
  expect(onboardingWindow(quest, undefined, 1)).toBe(quest);
});
