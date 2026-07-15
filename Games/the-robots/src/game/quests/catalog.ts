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
    speaker: "B0-LT",
    line: "Minion! You're alive! The bruisers took my eye — well, not MY eye, but A eye. Smash five of them and meet me down the shelf.",
  },
  [QUEST_IDS.shoreParty]: {
    speaker: "B0-LT",
    line: "Southern Shelf, dead ahead! It's crawling with Rusk's scrapjacks. Clear the shore party so we can reach the gate.",
  },
  [QUEST_IDS.bestMinionEver]: {
    speaker: "B0-LT",
    line: "Captain Rusk has my upgrades AND a flair for burning people. End him at his perch east of Liar's Berg!",
  },
  [QUEST_IDS.cleanUpThisMess]: {
    speaker: "Dr. Sparx",
    line: "Welcome to Coretown, killer. Scrapjacks moved into the old camp east of town. Evict 'em. Permanently.",
  },
  [QUEST_IDS.aDamFineRescue]: {
    speaker: "Rigg",
    line: "Three Horns is crawler country now, and Wreck-Maw guards the pass. Punch through — and buy ammo first, obviously.",
  },
  [QUEST_IDS.wherAngelsFear]: {
    speaker: "Angel",
    line: "The Dust hides Apex's supply line. Thin the scrapjacks running cover for it. Trust me, Reclaimer.",
  },
  [QUEST_IDS.toilAndTrouble]: {
    speaker: "Angel",
    line: "Apex loaders guard Ember Gate in the Cores Blight. Shock strips their shields; corrosive melts the rest.",
  },
  [QUEST_IDS.talonOfGod]: {
    speaker: "Angel",
    line: "This is it. Jack's Warrior sleeps under the Blight. Wake it. Kill it. Open the Reactor.",
  },
  [QUEST_IDS.skagDogDays]: {
    speaker: "Gauge",
    line: "The rippers in that gully have eaten three of my hats. Thin the pack, there's a sport.",
  },
  [QUEST_IDS.mongHunt]: {
    speaker: "Gauge",
    line: "Bag the big bruisers of Rustflat Waste and I shall name something unpleasant after you.",
  },
};

export const quests: readonly QuestDef[] = [
  {
    id: QUEST_IDS.freshOffTheBus,
    title: "My First Gun",
    description: "Survive the crash site: smash 5 bruisers in Rustflat Waste, then follow the road south-east.",
    objectives: [
      { id: "monglets", kind: "kill", target: "bullymong_brat", count: 3 },
      { id: "bullymongs", kind: "kill", target: "bullymong", count: 2 },
    ],
    rewards: { xp: { amount: 120 }, economy: { cash: 60 }, quests: [QUEST_IDS.shoreParty] },
  },
  {
    id: QUEST_IDS.shoreParty,
    title: "Cleaning Up the Berg",
    description: "Clear Rusk's shore party out of Southern Shelf.",
    objectives: [
      { id: "psychos", kind: "kill", target: "psycho", count: 4 },
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
    ],
    rewards: { xp: { amount: 320 }, economy: { cash: 140 }, quests: [QUEST_IDS.bestMinionEver] },
  },
  {
    id: QUEST_IDS.bestMinionEver,
    title: "Best Minion Ever",
    description: "Kill Captain Rusk at his perch east of Liar's Berg.",
    objectives: [{ id: "rusk", kind: "kill", target: "captain_rusk", count: 1 }],
    rewards: { xp: { amount: 900 }, economy: { cash: 400 }, quests: [QUEST_IDS.cleanUpThisMess] },
  },
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "This Town Ain't Big Enough",
    description: "Coretown's scrapjack camp needs emptying. Sparx is watching. Probably.",
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
    description: "Fight through Three Horns Divide and put down Wreck-Maw.",
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
    description: "Break the scrapjack escort running The Dust.",
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
    description: "Scrap Apex's loader line in the Cores Blight.",
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
    description: "Kill The Colossus at Ember Gate and open the Reactor.",
    objectives: [{ id: "warrior", kind: "kill", target: "the_warrior", count: 1 }],
    rewards: { xp: { amount: 20000 }, economy: { cash: 5000 } },
  },
  {
    id: QUEST_IDS.mongHunt,
    title: "Mong Hunt (side)",
    description: "Gauge wants the Rustflat bruisers culled.",
    objectives: [{ id: "mongs", kind: "kill", target: "bullymong", count: 5 }],
    rewards: { xp: { amount: 300 }, economy: { cash: 150 } },
  },
  {
    id: QUEST_IDS.skagDogDays,
    title: "Ripper Dog Days (side)",
    description: "Thin the ripper pack in the gully west of Coretown.",
    objectives: [
      { id: "pups", kind: "kill", target: "skag_pup", count: 4 },
      { id: "adults", kind: "kill", target: "skag", count: 2 },
    ],
    rewards: { xp: { amount: 800 }, economy: { cash: 250 } },
  },
];
