import type { QuestDef } from "@jgengine/core/game/quest";

export const QUEST_IDS = {
  cleanUpThisMess: "q_clean_up",
  skagDogDays: "q_skag_dog_days",
  bestMinionEver: "q_best_minion",
} as const;

export const quests: readonly QuestDef[] = [
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "This Town Ain't Big Enough",
    description: "Claptrap wants the bandit camp east of Fyrestone cleaned out. Kill 8 bandits.",
    objectives: [
      { id: "psychos", kind: "kill", target: "psycho", count: 4 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
    ],
    rewards: { xp: { amount: 220 }, economy: { cash: 120 } },
  },
  {
    id: QUEST_IDS.skagDogDays,
    title: "Skag Dog Days",
    description: "The skags in the gully are eating everything that moves. Thin the pack: 6 skags.",
    objectives: [
      { id: "pups", kind: "kill", target: "skag_pup", count: 4 },
      { id: "adults", kind: "kill", target: "skag", count: 2 },
    ],
    rewards: { xp: { amount: 260 }, economy: { cash: 150 } },
  },
  {
    id: QUEST_IDS.bestMinionEver,
    title: "Best Minion Ever",
    description: "Captain Flynt holds the perch north-east of the badlands. End him.",
    objectives: [{ id: "flynt", kind: "kill", target: "captain_flynt", count: 1 }],
    rewards: { xp: { amount: 900 }, economy: { cash: 500 } },
  },
];
