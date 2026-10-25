import type { QuestDef } from "@jgengine/core/game/quest";

export const QUEST_IDS = {
  crashRecovery: "q_crash_recovery",
  shoreParty: "q_shore_party",
  stolenModules: "q_stolen_modules",
  cleanUpThisMess: "q_clean_up",
  crossTheDivide: "q_cross_the_divide",
  supplyInterdiction: "q_supply_interdiction",
  foundrySiege: "q_foundry_siege",
  reactorBreach: "q_reactor_breach",
  ripperControl: "q_ripper_control",
  bruiserSurvey: "q_bruiser_survey",
} as const;

export const MAIN_QUEST_IDS: readonly string[] = [
  QUEST_IDS.crashRecovery,
  QUEST_IDS.shoreParty,
  QUEST_IDS.stolenModules,
  QUEST_IDS.cleanUpThisMess,
  QUEST_IDS.crossTheDivide,
  QUEST_IDS.supplyInterdiction,
  QUEST_IDS.foundrySiege,
  QUEST_IDS.reactorBreach,
];

export interface EchoLine {
  speaker: string;
  line: string;
}

export const QUEST_ECHOES: Record<string, EchoLine> = {
  [QUEST_IDS.crashRecovery]: {
    speaker: "B0-LT",
    line: "Your beacon is live. Bruisers scattered the survey crew across Rustflat Waste. Clear a route and meet me at the relay.",
  },
  [QUEST_IDS.shoreParty]: {
    speaker: "B0-LT",
    line: "Breakwater Shelf, dead ahead! It's crawling with Rusk's scrapjacks. Clear the shore party so we can reach the gate.",
  },
  [QUEST_IDS.stolenModules]: {
    speaker: "B0-LT",
    line: "Captain Rusk has my upgrades AND a flair for burning people. End him at his perch east of Switchback Landing!",
  },
  [QUEST_IDS.cleanUpThisMess]: {
    speaker: "Dr. Sparx",
    line: "Welcome to Coretown, killer. Scrapjacks moved into the old camp east of town. Evict 'em. Permanently.",
  },
  [QUEST_IDS.crossTheDivide]: {
    speaker: "Rigg",
    line: "Split Ridge is crawler country now, and Wreck-Maw guards the pass. Punch through — and buy ammo first, obviously.",
  },
  [QUEST_IDS.supplyInterdiction]: {
    speaker: "Relay",
    line: "Glasswind Flats hides Apex's supply line. Thin the scrapjacks running cover for it. Trust me, Reclaimer.",
  },
  [QUEST_IDS.foundrySiege]: {
    speaker: "Relay",
    line: "Apex loaders guard Ember Gate in the Cores Blight. Shock strips their shields; corrosive melts the rest.",
  },
  [QUEST_IDS.reactorBreach]: {
    speaker: "Relay",
    line: "This is it. the Foundry Heart sleeps under the Blight. Wake it. Kill it. Open the Reactor.",
  },
  [QUEST_IDS.ripperControl]: {
    speaker: "Gauge",
    line: "The rippers in that gully have eaten three of my hats. Thin the pack, there's a sport.",
  },
  [QUEST_IDS.bruiserSurvey]: {
    speaker: "Gauge",
    line: "Bag the big bruisers of Rustflat Waste and I shall name something unpleasant after you.",
  },
};

export const quests: readonly QuestDef[] = [
  {
    id: QUEST_IDS.crashRecovery,
    title: "My First Gun",
    description: "Survive the crash site: smash 5 bruisers in Rustflat Waste, then follow the road south-east.",
    objectives: [
      { id: "small_bruisers", kind: "kill", target: "bruiser_brat", count: 3 },
      { id: "bruisers", kind: "kill", target: "bruiser", count: 2 },
    ],
    rewards: { xp: { amount: 120 }, economy: { cash: 60 }, quests: [QUEST_IDS.shoreParty] },
  },
  {
    id: QUEST_IDS.shoreParty,
    title: "Clear the Landing",
    description: "Clear Rusk's shore party out of Breakwater Shelf.",
    objectives: [
      { id: "husks", kind: "kill", target: "husk", count: 4 },
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
    ],
    rewards: { xp: { amount: 320 }, economy: { cash: 140 }, quests: [QUEST_IDS.stolenModules] },
  },
  {
    id: QUEST_IDS.stolenModules,
    title: "Stolen Modules",
    description: "Kill Captain Rusk at his perch east of Switchback Landing.",
    objectives: [{ id: "rusk", kind: "kill", target: "captain_rusk", count: 1 }],
    rewards: { xp: { amount: 900 }, economy: { cash: 400 }, quests: [QUEST_IDS.cleanUpThisMess] },
  },
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "This Town Ain't Big Enough",
    description: "Coretown's scrapjack camp needs emptying. Sparx is watching. Probably.",
    objectives: [
      { id: "husks", kind: "kill", target: "husk", count: 5 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
      { id: "elite", kind: "kill", target: "elite_husk", count: 1 },
    ],
    rewards: { xp: { amount: 1400 }, economy: { cash: 320 }, quests: [QUEST_IDS.crossTheDivide] },
  },
  {
    id: QUEST_IDS.crossTheDivide,
    title: "A Road to the Divide",
    description: "Fight through Split-Ridge Pass and put down Wreck-Maw.",
    objectives: [
      { id: "crawlers", kind: "kill", target: "crawler", count: 4 },
      { id: "soldiers", kind: "kill", target: "crawler_soldier", count: 2 },
      { id: "wreckmaw", kind: "kill", target: "wreck_maw", count: 1 },
    ],
    rewards: { xp: { amount: 2600 }, economy: { cash: 600 }, quests: [QUEST_IDS.supplyInterdiction] },
  },
  {
    id: QUEST_IDS.supplyInterdiction,
    title: "Supply Interdiction",
    description: "Break the scrapjack escort running Glasswind Flats.",
    objectives: [
      { id: "marauders", kind: "kill", target: "marauder", count: 5 },
      { id: "nomads", kind: "kill", target: "nomad", count: 3 },
      { id: "elite", kind: "kill", target: "elite_husk", count: 1 },
    ],
    rewards: { xp: { amount: 4200 }, economy: { cash: 900 }, quests: [QUEST_IDS.foundrySiege] },
  },
  {
    id: QUEST_IDS.foundrySiege,
    title: "Foundry Siege",
    description: "Scrap Apex's loader line in the Cores Blight.",
    objectives: [
      { id: "loaders", kind: "kill", target: "loader", count: 5 },
      { id: "war_loaders", kind: "kill", target: "loader_war", count: 2 },
      { id: "elite_loader", kind: "kill", target: "elite_loader", count: 1 },
    ],
    rewards: { xp: { amount: 6800 }, economy: { cash: 1400 }, quests: [QUEST_IDS.reactorBreach] },
  },
  {
    id: QUEST_IDS.reactorBreach,
    title: "Reactor Breach",
    description: "Kill The Colossus at Ember Gate and open the Reactor.",
    objectives: [{ id: "warrior", kind: "kill", target: "foundry_heart", count: 1 }],
    rewards: { xp: { amount: 20000 }, economy: { cash: 5000 } },
  },
  {
    id: QUEST_IDS.bruiserSurvey,
    title: "Bruiser Survey (side)",
    description: "Gauge wants the Rustflat bruisers culled.",
    objectives: [{ id: "bruisers", kind: "kill", target: "bruiser", count: 5 }],
    rewards: { xp: { amount: 300 }, economy: { cash: 150 } },
  },
  {
    id: QUEST_IDS.ripperControl,
    title: "Ripper Control (side)",
    description: "Thin the ripper pack in the gully west of Coretown.",
    objectives: [
      { id: "pups", kind: "kill", target: "ripper_pup", count: 4 },
      { id: "adults", kind: "kill", target: "ripper", count: 2 },
    ],
    rewards: { xp: { amount: 800 }, economy: { cash: 250 } },
  },
];
