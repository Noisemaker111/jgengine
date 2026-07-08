import type { QuestDef } from "@jgengine/core/game/quest";
import { ORE_COAL, ORE_DIAMOND, ORE_GOLD, ORE_IRON } from "./blocks";

export const QUEST_PROSPECTING = "prospecting_101";
export const QUEST_DEEP_DELVE = "deep_delve";

export const quests: Record<string, QuestDef> = {
  [QUEST_PROSPECTING]: {
    id: QUEST_PROSPECTING,
    title: "Prospecting 101",
    description: "Dig past the crust and bring back coal and iron.",
    objectives: [
      { id: ORE_COAL.resourceId, kind: "collect", item: ORE_COAL.resourceId, count: 5 },
      { id: ORE_IRON.resourceId, kind: "collect", item: ORE_IRON.resourceId, count: 3 },
    ],
    rewards: { xp: { amount: 50 }, quests: [QUEST_DEEP_DELVE] },
  },
  [QUEST_DEEP_DELVE]: {
    id: QUEST_DEEP_DELVE,
    title: "Deep Delve",
    description: "Push further down for gold and diamond.",
    requires: [QUEST_PROSPECTING],
    objectives: [
      { id: ORE_GOLD.resourceId, kind: "collect", item: ORE_GOLD.resourceId, count: 2 },
      { id: ORE_DIAMOND.resourceId, kind: "collect", item: ORE_DIAMOND.resourceId, count: 1 },
    ],
    rewards: { xp: { amount: 150 }, unlocks: ["prospector_badge"] },
  },
};
