import { describe, expect, test } from "bun:test";

import { defaultObjectiveLabel, describeTrackedQuest, type QuestDef, type QuestInstance } from "./quest";

const DEF: QuestDef = {
  id: "cull-the-pack",
  title: "Cull the Pack",
  objectives: [
    { id: "o1", kind: "kill", target: "wolf", count: 3 },
    { id: "o2", kind: "collect", item: "pelt", count: 2 },
  ],
};

const INSTANCE: QuestInstance = {
  questId: "cull-the-pack",
  status: "active",
  objectives: [
    { id: "o1", kind: "kill", count: 3, progress: 1, complete: false },
    { id: "o2", kind: "collect", count: 2, progress: 2, complete: true },
  ],
};

describe("defaultObjectiveLabel", () => {
  test("derives a readable verb/count/noun", () => {
    expect(defaultObjectiveLabel(DEF.objectives[0]!)).toBe("Defeat 3 wolf");
    expect(defaultObjectiveLabel(DEF.objectives[1]!)).toBe("Collect 2 pelt");
    expect(defaultObjectiveLabel({ id: "o3", kind: "escort", count: 1 })).toBe("escort 1 o3");
  });
});

describe("describeTrackedQuest", () => {
  test("joins def + instance into a labelled, progress-carrying view", () => {
    const view = describeTrackedQuest(DEF, INSTANCE);
    expect(view).toEqual({
      id: "cull-the-pack",
      title: "Cull the Pack",
      status: "active",
      objectives: [
        { id: "o1", label: "Defeat 3 wolf", count: 3, progress: 1, complete: false },
        { id: "o2", label: "Collect 2 pelt", count: 2, progress: 2, complete: true },
      ],
    });
  });

  test("honors a label override and falls back to the id for unknown objectives", () => {
    const view = describeTrackedQuest(DEF, INSTANCE, (o) => `${o.kind}!`);
    expect(view.objectives[0]!.label).toBe("kill!");

    const orphan: QuestInstance = {
      questId: "cull-the-pack",
      status: "active",
      objectives: [{ id: "ghost", kind: "kill", count: 1, progress: 0, complete: false }],
    };
    expect(describeTrackedQuest(DEF, orphan).objectives[0]!.label).toBe("ghost");
  });
});
