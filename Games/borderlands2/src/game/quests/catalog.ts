import type { QuestDef } from "@jgengine/core/game/quest";

export const QUEST_IDS = {
  freshOffTheBus: "q_fresh_off_the_bus",
  shoreParty: "q_shore_party",
  bestMinionEver: "q_best_minion",
  cleanUpThisMess: "q_clean_up",
  aDamFineRescue: "q_dam_fine_rescue",
  wherAngelsFear: "q_where_angels_fear",
  toilAndTrouble: "q_toil_and_trouble",
  talonOfGod: "q_talon_of_god",
  skagDogDays: "q_skag_dog_days",
  mongHunt: "q_mong_hunt",
} as const;

export const MAIN_QUEST_IDS: readonly string[] = [
  QUEST_IDS.freshOffTheBus,
  QUEST_IDS.shoreParty,
  QUEST_IDS.bestMinionEver,
  QUEST_IDS.cleanUpThisMess,
  QUEST_IDS.aDamFineRescue,
  QUEST_IDS.wherAngelsFear,
  QUEST_IDS.toilAndTrouble,
  QUEST_IDS.talonOfGod,
];

export interface EchoLine {
  speaker: string;
  line: string;
}

export const QUEST_ECHOES: Record<string, EchoLine> = {
  [QUEST_IDS.freshOffTheBus]: {
    speaker: "CL4P-TP",
    line: "Minion! You're alive! The bullymongs took my eye — well, not MY eye, but A eye. Smash five of them and meet me down the shelf.",
  },
  [QUEST_IDS.shoreParty]: {
    speaker: "CL4P-TP",
    line: "Southern Shelf, dead ahead! It's crawling with Flynt's bandits. Clear the shore party so we can reach the gate.",
  },
  [QUEST_IDS.bestMinionEver]: {
    speaker: "CL4P-TP",
    line: "Captain Flynt has my upgrades AND a flair for burning people. End him at his perch east of Liar's Berg!",
  },
  [QUEST_IDS.cleanUpThisMess]: {
    speaker: "Dr. Zed",
    line: "Welcome to Fyrestone, killer. Bandits moved into the old camp east of town. Evict 'em. Permanently.",
  },
  [QUEST_IDS.aDamFineRescue]: {
    speaker: "Marcus",
    line: "Three Horns is spiderant country now, and Bad Maw guards the pass. Punch through — and buy ammo first, obviously.",
  },
  [QUEST_IDS.wherAngelsFear]: {
    speaker: "Angel",
    line: "The Dust hides Hyperion's supply line. Thin the bandits running cover for it. Trust me, Vault Hunter.",
  },
  [QUEST_IDS.toilAndTrouble]: {
    speaker: "Angel",
    line: "Hyperion loaders guard Hero's Pass in the Eridium Blight. Shock strips their shields; corrosive melts the rest.",
  },
  [QUEST_IDS.talonOfGod]: {
    speaker: "Angel",
    line: "This is it. Jack's Warrior sleeps under the Blight. Wake it. Kill it. Open the Vault.",
  },
  [QUEST_IDS.skagDogDays]: {
    speaker: "Hammerlock",
    line: "The skags in that gully have eaten three of my hats. Thin the pack, there's a sport.",
  },
  [QUEST_IDS.mongHunt]: {
    speaker: "Hammerlock",
    line: "Bag the big bullymongs of Windshear Waste and I shall name something unpleasant after you.",
  },
};

export const quests: readonly QuestDef[] = [
  {
    id: QUEST_IDS.freshOffTheBus,
    title: "My First Gun",
    description: "Survive the crash site: smash 5 bullymongs in Windshear Waste, then follow the road south-east.",
    objectives: [
      { id: "monglets", kind: "kill", target: "bullymong_brat", count: 3 },
      { id: "bullymongs", kind: "kill", target: "bullymong", count: 2 },
    ],
    rewards: { xp: { amount: 120 }, economy: { cash: 60 }, quests: [QUEST_IDS.shoreParty] },
  },
  {
    id: QUEST_IDS.shoreParty,
    title: "Cleaning Up the Berg",
    description: "Clear Flynt's shore party out of Southern Shelf.",
    objectives: [
      { id: "psychos", kind: "kill", target: "psycho", count: 4 },
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
    ],
    rewards: { xp: { amount: 320 }, economy: { cash: 140 }, quests: [QUEST_IDS.bestMinionEver] },
  },
  {
    id: QUEST_IDS.bestMinionEver,
    title: "Best Minion Ever",
    description: "Kill Captain Flynt at his perch east of Liar's Berg.",
    objectives: [{ id: "flynt", kind: "kill", target: "captain_flynt", count: 1 }],
    rewards: { xp: { amount: 900 }, economy: { cash: 400 }, quests: [QUEST_IDS.cleanUpThisMess] },
  },
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "This Town Ain't Big Enough",
    description: "Fyrestone's bandit camp needs emptying. Zed is watching. Probably.",
    objectives: [
      { id: "psychos", kind: "kill", target: "psycho", count: 5 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
      { id: "badass", kind: "kill", target: "badass_psycho", count: 1 },
    ],
    rewards: { xp: { amount: 1400 }, economy: { cash: 320 }, quests: [QUEST_IDS.aDamFineRescue] },
  },
  {
    id: QUEST_IDS.aDamFineRescue,
    title: "A Road to the Divide",
    description: "Fight through Three Horns Divide and put down Bad Maw.",
    objectives: [
      { id: "spiderants", kind: "kill", target: "spiderant", count: 4 },
      { id: "soldiers", kind: "kill", target: "spiderant_soldier", count: 2 },
      { id: "badmaw", kind: "kill", target: "bad_maw", count: 1 },
    ],
    rewards: { xp: { amount: 2600 }, economy: { cash: 600 }, quests: [QUEST_IDS.wherAngelsFear] },
  },
  {
    id: QUEST_IDS.wherAngelsFear,
    title: "Where Angels Fear to Tread",
    description: "Break the bandit escort running The Dust.",
    objectives: [
      { id: "marauders", kind: "kill", target: "marauder", count: 5 },
      { id: "nomads", kind: "kill", target: "nomad", count: 3 },
      { id: "badass", kind: "kill", target: "badass_psycho", count: 1 },
    ],
    rewards: { xp: { amount: 4200 }, economy: { cash: 900 }, quests: [QUEST_IDS.toilAndTrouble] },
  },
  {
    id: QUEST_IDS.toilAndTrouble,
    title: "Toil and Trouble",
    description: "Scrap Hyperion's loader line in the Eridium Blight.",
    objectives: [
      { id: "loaders", kind: "kill", target: "loader", count: 5 },
      { id: "war_loaders", kind: "kill", target: "loader_war", count: 2 },
      { id: "badass_loader", kind: "kill", target: "badass_loader", count: 1 },
    ],
    rewards: { xp: { amount: 6800 }, economy: { cash: 1400 }, quests: [QUEST_IDS.talonOfGod] },
  },
  {
    id: QUEST_IDS.talonOfGod,
    title: "The Talon of God",
    description: "Kill The Warrior at Hero's Pass and open the Vault.",
    objectives: [{ id: "warrior", kind: "kill", target: "the_warrior", count: 1 }],
    rewards: { xp: { amount: 20000 }, economy: { cash: 5000 } },
  },
  {
    id: QUEST_IDS.mongHunt,
    title: "Mong Hunt (side)",
    description: "Hammerlock wants the Windshear bullymongs culled.",
    objectives: [{ id: "mongs", kind: "kill", target: "bullymong", count: 5 }],
    rewards: { xp: { amount: 300 }, economy: { cash: 150 } },
  },
  {
    id: QUEST_IDS.skagDogDays,
    title: "Skag Dog Days (side)",
    description: "Thin the skag pack in the gully west of Fyrestone.",
    objectives: [
      { id: "pups", kind: "kill", target: "skag_pup", count: 4 },
      { id: "adults", kind: "kill", target: "skag", count: 2 },
    ],
    rewards: { xp: { amount: 800 }, economy: { cash: 250 } },
  },
];
