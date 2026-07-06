import type { QuestDef } from "@jgengine/core/game/quest";

export const quest_kobold_cleanup: QuestDef = {
  id: "quest_kobold_cleanup",
  title: "Kobold Camp Cleanup",
  description: "Marshal Redpath wants the kobolds driven from the forest north of town.",
  giver: "npc_marshal",
  turnIn: "npc_marshal",
  objectives: [{ id: "kill_kobolds", kind: "kill", target: "kobold_grunt", count: 3 }],
  rewards: {
    xp: { amount: 250 },
    economy: { gold: 15 },
    items: [{ item: "health_potion", count: 2, inventory: "backpack" }],
    quests: ["quest_kobold_elite"],
  },
};

export const quest_kobold_elite: QuestDef = {
  id: "quest_kobold_elite",
  title: "The Taskmaster",
  description: "Slay the Kobold Taskmaster commanding the camp.",
  giver: "npc_marshal",
  turnIn: "npc_marshal",
  requires: ["quest_kobold_cleanup"],
  objectives: [{ id: "kill_elite", kind: "kill", target: "kobold_elite", count: 1 }],
  rewards: {
    xp: { amount: 800 },
    economy: { gold: 50 },
  },
};

export const quests: QuestDef[] = [quest_kobold_cleanup, quest_kobold_elite];

const byId = new Map(quests.map((quest) => [quest.id, quest]));

export function questById(id: string): QuestDef | undefined {
  return byId.get(id);
}
