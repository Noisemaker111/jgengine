import type { QuestDef } from "@jgengine/core/mission/quest";

import { enemyById } from "../entities/enemies/catalog";
import { unlock } from "../progression/unlocks";

/** The people who hand out quests, and the entity each one is in the world. */
export const NPCS = {
  bolt: { name: "B0-LT", entity: "bolt_1" },
  sparx: { name: "Dr. Sparx", entity: "npc_sparx" },
  rigg: { name: "Rigg", entity: "npc_rigg" },
  gauge: { name: "Sir Gauge", entity: "npc_gauge" },
} as const;

export type NpcId = keyof typeof NPCS;

export function isNpcId(id: string): id is NpcId {
  return Object.hasOwn(NPCS, id);
}

/** `radio`: the quest turns itself in over the radio the moment its last objective is done. */
export type TurnIn = NpcId | "radio";

/**
 * One thing a quest asks for. `kill` counts kills of an enemy type; `chest` opening a named chest;
 * `pickup` taking a gun into a weapon slot; `reach` entering a zone; `talk` speaking to someone.
 */
export type ScrapObjective =
  | { id: string; kind: "kill"; target: string; count: number }
  | { id: string; kind: "chest"; target: string; count: 1; label: string }
  | { id: string; kind: "pickup"; target: "gun"; count: number; label: string }
  | { id: string; kind: "reach"; target: string; count: 1; label: string }
  | { id: string; kind: "talk"; target: NpcId; count: 1; label: string };

export interface ScrapQuest {
  id: string;
  title: string;
  act: 1 | 2 | 3;
  main: boolean;
  giver: NpcId;
  turnIn: TurnIn;
  requires?: readonly string[];
  /** The level a giver waits for before offering it. */
  minLevel?: number;
  /** What the giver says when handing it over. */
  brief: string;
  /** What is said when it is turned in. */
  done: string;
  objectives: readonly ScrapObjective[];
  reward: { xp: number; cash?: number; cores?: number; unlocks?: readonly string[] };
  /** Unlocks granted the moment the quest is accepted: the road it sends you down. */
  opens?: readonly string[];
  /** The editor marker the giver walks to when the quest is accepted, to wait for the player there. */
  meetAt?: string;
  /** An enemy the quest puts in the world when it is accepted, at an editor marker. */
  spawn?: { catalogId: string; marker: string; instanceId: string };
}

export const CRASH_CHEST = "red_chest_0";

export const QUEST_IDS = {
  firstGun: "q_first_gun",
  targetPractice: "q_target_practice",
  bruiserBash: "q_bruiser_bash",
  oldTusk: "q_old_tusk",
  roadToShelf: "q_road_to_shelf",
  shoreParty: "q_shore_party",
  stolenModules: "q_stolen_modules",
  coretown: "q_welcome_coretown",
  cleanUpThisMess: "q_clean_up",
  crossTheDivide: "q_cross_the_divide",
  supplyInterdiction: "q_supply_interdiction",
  foundrySiege: "q_foundry_siege",
  reactorBreach: "q_reactor_breach",
  ripperControl: "q_ripper_control",
  bruiserSurvey: "q_bruiser_survey",
} as const;

export const scrapQuests: readonly ScrapQuest[] = [
  {
    id: QUEST_IDS.firstGun,
    title: "My First Gun",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    brief: "You're alive! And unarmed, which on Ferralon is the same as not alive. The bus's red chest still has the crew's spare pistol. Open it and grab it.",
    done: "A gun! Point the loud end at things that aren't me.",
    objectives: [
      { id: "chest", kind: "chest", target: CRASH_CHEST, count: 1, label: "Open the crash chest" },
      { id: "gun", kind: "pickup", target: "gun", count: 1, label: "Take the pistol" },
    ],
    reward: { xp: 40 },
  },
  {
    id: QUEST_IDS.targetPractice,
    title: "Target Practice",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.firstGun],
    brief: "Scrap whelps nest west of the bus. Aim, squeeze, and reload with R before you run dry. Four should do.",
    done: "Four whelps! You're a natural. A natural what, I won't say.",
    objectives: [{ id: "whelps", kind: "kill", target: "bruiser_brat", count: 4 }],
    reward: { xp: 70, cash: 25 },
  },
  {
    id: QUEST_IDS.bruiserBash,
    title: "Bruiser Bash",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.targetPractice],
    brief: "Two bruiser frames guard the convoy south of camp. They're all hide and no plate, so fire roasts them. No fire gun yet? Shoot more.",
    done: "Plate's off, and so are they. My scanners say you're getting stronger. My scanners also say I'm handsome.",
    objectives: [{ id: "bruisers", kind: "kill", target: "bruiser", count: 2 }],
    reward: { xp: 160, cash: 40 },
  },
  {
    id: QUEST_IDS.oldTusk,
    title: "Old Tusk",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.bruiserBash],
    brief: "Old Tusk runs the den north-west of the crash, and he blocks the only road out. If he puts you down, get a kill before your reserve runs dry: that's your second wind.",
    done: "Old Tusk is scrap! Here, a second weapon slot. Carry two guns, feel twice as dangerous.",
    objectives: [{ id: "tusk", kind: "kill", target: "old_tusk", count: 1 }],
    reward: { xp: 240, cash: 80, unlocks: [unlock.slot(2)] },
    spawn: { catalogId: "old_tusk", marker: "poi_monglet_den", instanceId: "boss_old_tusk" },
  },
  {
    id: QUEST_IDS.roadToShelf,
    title: "Road to the Shelf",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "radio",
    requires: [QUEST_IDS.oldTusk],
    brief: "With Tusk gone the road east is open. Breakwater Shelf is level 4 country: husk drones, scav drones and Captain Rusk's crew. I'll meet you at the shelf's travel station.",
    done: "You made it to the Shelf! Touch the travel station and you can warp back here any time.",
    objectives: [{ id: "shelf", kind: "reach", target: "breakwater_shelf", count: 1, label: "Reach Breakwater Shelf" }],
    reward: { xp: 120, cash: 30 },
    opens: [unlock.zone("breakwater_shelf")],
    meetAt: "bolt_shelf",
  },
  {
    id: QUEST_IDS.shoreParty,
    title: "Clear the Landing",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.roadToShelf],
    brief: "Rusk's shore party holds the landing. Clear it so we can reach his perch.",
    done: "Landing's clear. Rusk will have noticed. Good.",
    objectives: [
      { id: "husks", kind: "kill", target: "husk", count: 4 },
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
    ],
    reward: { xp: 320, cash: 140 },
  },
  {
    id: QUEST_IDS.stolenModules,
    title: "Stolen Modules",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.shoreParty],
    brief: "Captain Rusk has my upgrades AND a flair for burning people. End him at his perch east of Switchback Landing!",
    done: "My modules! And a third weapon slot for you. Coretown can hear us now.",
    objectives: [{ id: "rusk", kind: "kill", target: "captain_rusk", count: 1 }],
    reward: { xp: 900, cash: 400, unlocks: [unlock.slot(3)] },
  },
  {
    id: QUEST_IDS.coretown,
    title: "Welcome to Coretown",
    act: 2,
    main: true,
    giver: "bolt",
    turnIn: "sparx",
    requires: [QUEST_IDS.stolenModules],
    brief: "Coretown is south-east, past the shelf. Dr. Sparx runs the clinic there. Rigg sells ammo, and the vault keeps what you can't carry.",
    done: "Bolt's stray! Welcome to Coretown, killer.",
    objectives: [{ id: "sparx", kind: "talk", target: "sparx", count: 1, label: "Talk to Dr. Sparx in Coretown" }],
    reward: { xp: 300, cash: 100 },
    opens: [unlock.zone("arid_badlands")],
  },
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "This Town Ain't Big Enough",
    act: 2,
    main: true,
    giver: "sparx",
    turnIn: "sparx",
    requires: [QUEST_IDS.coretown],
    brief: "Scrapjacks moved into the old camp east of town. Evict 'em. Permanently.",
    done: "Quiet out east. I could get used to quiet.",
    objectives: [
      { id: "husks", kind: "kill", target: "husk", count: 5 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
      { id: "elite", kind: "kill", target: "elite_husk", count: 1 },
    ],
    reward: { xp: 1400, cash: 320 },
  },
  {
    id: QUEST_IDS.crossTheDivide,
    title: "A Road to the Divide",
    act: 2,
    main: true,
    giver: "rigg",
    turnIn: "rigg",
    requires: [QUEST_IDS.cleanUpThisMess],
    brief: "Split Ridge is crawler country now, and Wreck-Maw guards the pass. Punch through, and buy ammo first, obviously.",
    done: "Wreck-Maw's down? Take the fourth slot rack. You've earned the weight.",
    objectives: [
      { id: "crawlers", kind: "kill", target: "crawler", count: 4 },
      { id: "soldiers", kind: "kill", target: "crawler_soldier", count: 2 },
      { id: "wreckmaw", kind: "kill", target: "wreck_maw", count: 1 },
    ],
    reward: { xp: 2600, cash: 600, unlocks: [unlock.slot(4)] },
    opens: [unlock.zone("split_ridge")],
  },
  {
    id: QUEST_IDS.supplyInterdiction,
    title: "Supply Interdiction",
    act: 3,
    main: true,
    giver: "sparx",
    turnIn: "sparx",
    requires: [QUEST_IDS.crossTheDivide],
    brief: "Glasswind Flats hides Apex's supply line. Thin the scrapjacks running cover for it.",
    done: "The line's broken. Apex will come for the Heart's defences next. So should you.",
    objectives: [
      { id: "marauders", kind: "kill", target: "marauder", count: 5 },
      { id: "nomads", kind: "kill", target: "nomad", count: 3 },
      { id: "elite", kind: "kill", target: "elite_husk", count: 1 },
    ],
    reward: { xp: 4200, cash: 900 },
    opens: [unlock.zone("glasswind_flats")],
  },
  {
    id: QUEST_IDS.foundrySiege,
    title: "Foundry Siege",
    act: 3,
    main: true,
    giver: "rigg",
    turnIn: "rigg",
    requires: [QUEST_IDS.supplyInterdiction],
    brief: "Apex loaders guard Ember Gate in the Cores Blight. Shock strips their shields; corrosive melts the rest.",
    done: "The gate's open. What sleeps under it is your problem.",
    objectives: [
      { id: "loaders", kind: "kill", target: "loader", count: 5 },
      { id: "war_loaders", kind: "kill", target: "loader_war", count: 2 },
      { id: "elite_loader", kind: "kill", target: "elite_loader", count: 1 },
    ],
    reward: { xp: 6800, cash: 1400 },
    opens: [unlock.zone("cores_blight")],
  },
  {
    id: QUEST_IDS.reactorBreach,
    title: "Reactor Breach",
    act: 3,
    main: true,
    giver: "rigg",
    turnIn: "radio",
    requires: [QUEST_IDS.foundrySiege],
    brief: "The Foundry Heart sleeps under the Blight. Wake it. Kill it. Open the Reactor.",
    done: "The Reactor is open. Ferralon's signal is yours.",
    objectives: [{ id: "heart", kind: "kill", target: "foundry_heart", count: 1 }],
    reward: { xp: 20000, cash: 5000 },
  },
  {
    id: QUEST_IDS.bruiserSurvey,
    title: "Bruiser Survey",
    act: 2,
    main: false,
    giver: "gauge",
    turnIn: "gauge",
    requires: [QUEST_IDS.coretown],
    brief: "Bag the big bruisers of Rustflat Waste and I shall name something unpleasant after you.",
    done: "Splendid. I shall call my new boil 'Reclaimer'.",
    objectives: [{ id: "bruisers", kind: "kill", target: "bruiser", count: 5 }],
    reward: { xp: 300, cash: 150 },
  },
  {
    id: QUEST_IDS.ripperControl,
    title: "Ripper Control",
    act: 2,
    main: false,
    giver: "gauge",
    turnIn: "gauge",
    requires: [QUEST_IDS.bruiserSurvey],
    brief: "The rippers in the gully west of town have eaten three of my hats. Thin the pack, there's a sport.",
    done: "My hats are avenged. Well. Two of them.",
    objectives: [
      { id: "pups", kind: "kill", target: "ripper_pup", count: 4 },
      { id: "adults", kind: "kill", target: "ripper", count: 2 },
    ],
    reward: { xp: 800, cash: 250 },
  },
];

/** The words the tracker and the offer card show for one objective. */
export function objectiveLabel(objective: ScrapObjective): string {
  if (objective.kind !== "kill") return objective.label;
  const name = enemyById(objective.target)?.name ?? "hostiles";
  return objective.count > 1 ? `Defeat ${objective.count} ${name}s` : `Defeat ${name}`;
}

const byId = new Map(scrapQuests.map((quest) => [quest.id, quest]));

export function scrapQuestById(id: string): ScrapQuest | undefined {
  return byId.get(id);
}

/** The quest whose acceptance opens the road into `zoneId`. */
export function zoneOpener(zoneId: string): ScrapQuest | undefined {
  const id = unlock.zone(zoneId);
  return scrapQuests.find((quest) => quest.opens?.includes(id) === true);
}

/** The engine's view of the catalog: rewards stay with the game, which pays XP through its own level track. */
export const quests: readonly QuestDef[] = scrapQuests.map((quest) => ({
  id: quest.id,
  title: quest.title,
  description: quest.brief,
  giver: quest.giver,
  ...(quest.turnIn === "radio" ? {} : { turnIn: quest.turnIn }),
  ...(quest.requires === undefined ? {} : { requires: [...quest.requires] }),
  objectives: quest.objectives.map((objective) => ({ id: objective.id, kind: objective.kind, target: objective.target, count: objective.count })),
}));

export const MAIN_QUEST_IDS: readonly string[] = scrapQuests.filter((quest) => quest.main).map((quest) => quest.id);
