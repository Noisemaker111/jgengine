import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QuestTracker } from "./questTracker";
import { describeTrackedQuest, type QuestDef, type QuestInstance, type TrackedQuestView } from "@jgengine/core/game/quest";

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

function view(): TrackedQuestView {
  return describeTrackedQuest(DEF, INSTANCE);
}

describe("QuestTracker", () => {
  test("renders a quest with labelled objectives and progress", () => {
    const html = renderToStaticMarkup(createElement(QuestTracker, { quests: [view()] }));
    expect(html).toContain('data-quest="cull-the-pack"');
    expect(html).toContain('data-status="active"');
    expect(html).toContain("Cull the Pack");
    expect(html).toContain("Defeat 3 wolf");
    expect(html).toContain("1/3"); // in-progress objective shows count
    expect(html).toContain('data-complete="true"'); // the collected objective
  });

  test("empty list shows the empty label", () => {
    const html = renderToStaticMarkup(createElement(QuestTracker, { quests: [], emptyLabel: "Nothing tracked" }));
    expect(html).toContain("Nothing tracked");
  });

  test("a completed quest is marked DONE", () => {
    const completed: TrackedQuestView = { ...view(), status: "completed" };
    const html = renderToStaticMarkup(createElement(QuestTracker, { quests: [completed] }));
    expect(html).toContain('data-status="completed"');
    expect(html).toContain("DONE");
  });

  test("maxObjectives truncates with a +N more line", () => {
    const html = renderToStaticMarkup(createElement(QuestTracker, { quests: [view()], maxObjectives: 1 }));
    expect(html).toContain("+1 more");
  });
});
