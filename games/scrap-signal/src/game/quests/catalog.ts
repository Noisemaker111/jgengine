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
  /** `near`: a side camp (`SIDE_POIS` id) the marker leads to, for a job about one place's pack. */
  | { id: string; kind: "kill"; target: string; count: number; near?: string }
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
  /** `gun`: a quest-reward unique (`UNIQUE_GUNS`), rolled at the player's level and set down at their feet. */
  reward: { xp: number; cash?: number; cores?: number; unlocks?: readonly string[]; gun?: string };
  /** Unlocks granted the moment the quest is accepted: the road it sends you down. */
  opens?: readonly string[];
  /** The editor marker the giver walks to when the quest is accepted, to wait for the player there. */
  meetAt?: string;
  /** An enemy the quest puts in the world when it is accepted, at an editor marker. */
  spawn?: { catalogId: string; marker: string; instanceId: string };
}

export const CRASH_CHEST = "red_chest_0";
/** The red crate on the bruisers' convoy: Rustflat's second red chest. */
export const CONVOY_CHEST = "red_chest_1";

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

/** A wanted poster: kill one named target, which the quest puts at its editor marker. */
function wanted(
  quest: Omit<ScrapQuest, "act" | "main" | "objectives" | "spawn"> & { act: ScrapQuest["act"]; target: string },
): ScrapQuest {
  const { target, ...rest } = quest;
  return {
    ...rest,
    main: false,
    objectives: [{ id: target, kind: "kill", target, count: 1 }],
    spawn: { catalogId: target, marker: `named_${target}`, instanceId: `named_${target}` },
  };
}

/**
 * Side jobs, one at a time per giver like the story: Bolt's on Breakwater Shelf, then Coretown's
 * three. Each sits behind a story beat and a level, so the next one waits until the player can take it.
 */
const SIDE_QUESTS: readonly ScrapQuest[] = [
  // B0-LT on Breakwater Shelf (level 4-7), while Captain Rusk waits for a level 6 Reclaimer.
  {
    id: "q_scorched_earth", title: "Scorched Earth", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: [QUEST_IDS.shoreParty], minLevel: 4,
    brief: "Rusk's crew sets husk drones on fire and lets them run. Put the burning ones out. With bullets.",
    done: "Smoke's clearing. Here, this pistol was in a scorched husk. Still warm.",
    objectives: [{ id: "scorched", kind: "kill", target: "scorch_husk", count: 2 }],
    reward: { xp: 260, cash: 80, gun: "Kindler" },
  },
  {
    id: "q_shield_breakers", title: "Shield Breakers", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_scorched_earth"], minLevel: 4,
    brief: "Shelf raiders carry shields. Shields short out under shock, or under a lot of lead. Break two.",
    done: "Shields down, raiders down. Take the shock SMG I found; it'll make the next ones easier.",
    objectives: [{ id: "raiders", kind: "kill", target: "shelf_raider", count: 2 }],
    reward: { xp: 300, cash: 90, gun: "Static Cling" },
  },
  {
    id: "q_salvage_rights", title: "Salvage Rights", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_shield_breakers"], minLevel: 4,
    brief: "Everything on this shelf drops guns. Try two new ones in your hands. Read the card first: damage, fire rate, element.",
    done: "See? Every gun is a little different. That's the whole planet's economy.",
    objectives: [{ id: "guns", kind: "pickup", target: "gun", count: 2, label: "Take 2 new guns" }],
    reward: { xp: 220, cash: 120 },
  },
  {
    id: "q_tidewater", title: "Tidewater", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_salvage_rights"], minLevel: 5,
    brief: "Tide bruisers wear armour plate. Corrosive eats plate; anything else just tickles. Clear the bruiser beach.",
    done: "The beach is ours. This rifle washed up there, if you can stand the smell.",
    objectives: [
      { id: "tide", kind: "kill", target: "tide_bruiser", count: 1 },
      { id: "bruisers", kind: "kill", target: "bruiser", count: 2 },
    ],
    reward: { xp: 380, cash: 110, gun: "Undertow" },
  },
  {
    id: "q_nomads_toll", title: "Nomad's Toll", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_tidewater"], minLevel: 5,
    brief: "Two nomad drones charge a toll on the shelf road. We don't pay tolls. We collect them.",
    done: "Toll collected. Their shotgun, too.",
    objectives: [{ id: "nomads", kind: "kill", target: "nomad", count: 2 }],
    reward: { xp: 360, cash: 160, gun: "Toll Booth" },
  },
  wanted({
    id: "q_wanted_scald", title: "Wanted: Scald", act: 1, giver: "bolt", turnIn: "bolt",
    requires: ["q_nomads_toll"], minLevel: 5, target: "scald",
    brief: "Scald is the husk that started the fires. He's out north-west of the station now, burning brighter than ever. Put him out.",
    done: "Scald's cold. His shotgun isn't. Mind your eyebrows.",
    reward: { xp: 520, cash: 200, gun: "Scald's Kiss" },
  }),
  {
    id: "q_shore_leave", title: "Shore Leave", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: [QUEST_IDS.stolenModules], minLevel: 6,
    brief: "With Rusk gone his husks have nobody to obey. Thin them out before they elect a new captain.",
    done: "No new captain. Democracy saved. Have a rifle.",
    objectives: [{ id: "husks", kind: "kill", target: "husk", count: 4 }],
    reward: { xp: 600, cash: 220, gun: "Shore Leave" },
  },
  wanted({
    id: "q_wanted_vex", title: "Wanted: Gunner Vex", act: 1, giver: "bolt", turnIn: "bolt",
    requires: ["q_shore_leave"], minLevel: 7, target: "gunner_vex",
    brief: "Rusk's gunner survived. Vex sits behind a fat shield south-east of the station. Shock first, then everything else.",
    done: "Vex is done, and so is Rusk's crew. His sniper is yours.",
    reward: { xp: 800, cash: 300, gun: "Vexer" },
  }),

  // Dr. Sparx in Coretown (level 8+): the clinic needs parts, samples and quiet.
  {
    id: "q_field_medicine", title: "Field Medicine", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.coretown], minLevel: 8,
    brief: "Dust rippers have flesh, and flesh burns. Bring me two ripper glands. The rippers won't need them.",
    done: "Lovely glands. Here, a pistol that heals the soul by melting the enemy.",
    objectives: [{ id: "rippers", kind: "kill", target: "dust_ripper", count: 2 }],
    reward: { xp: 900, cash: 260, gun: "Triage" },
  },
  {
    id: "q_matriarch", title: "Matriarch", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_field_medicine"], minLevel: 9,
    brief: "The ripper pups out west have a mother. She's large, she's angry, and she's the reason my clinic is full.",
    done: "Clinic's emptier already. This shotgun ends broods; use it wisely.",
    objectives: [{ id: "matriarch", kind: "kill", target: "ripper_matriarch", count: 1 }],
    reward: { xp: 1100, cash: 300, gun: "Brood Ender" },
  },
  {
    id: "q_cache_raid", title: "Cache Raid", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_matriarch"], minLevel: 10,
    brief: "Apex left a supply cache south-east of town, guarded by loaders. I need what's in it. You need to not die.",
    done: "Medical supplies! And a key to nothing, shaped like an SMG.",
    objectives: [{ id: "loaders", kind: "kill", target: "loader", count: 3 }],
    reward: { xp: 1300, cash: 340, gun: "Cache Key" },
  },
  {
    id: "q_scrap_drive", title: "Scrap Drive", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_cache_raid"], minLevel: 10,
    brief: "My scalpels are made from husk plating. I'm out of scalpels. You see the problem.",
    done: "Enough plating for a hundred scalpels. Don't ask what the other ninety-nine are for.",
    objectives: [{ id: "husks", kind: "kill", target: "husk", count: 5 }],
    reward: { xp: 1200, cash: 360 },
  },
  {
    id: "q_signal_noise", title: "Signal Noise", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12,
    brief: "Nomads on Split Ridge are jamming my clinic's radio with their chatter. Make them quiet.",
    done: "Silence. Beautiful, medical silence.",
    objectives: [{ id: "nomads", kind: "kill", target: "nomad", count: 3 }],
    reward: { xp: 2200, cash: 480 },
  },
  {
    id: "q_glass_shards", title: "Glass Shards", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "Shard crawlers on the Glasswind Flats grow crystal shields. Shock shatters them. Bring me the shards.",
    done: "Pretty. Sharp. Here's a sniper that shatters things from very far away.",
    objectives: [{ id: "shards", kind: "kill", target: "shard_crawler", count: 2 }],
    reward: { xp: 3800, cash: 760, gun: "Shard Splitter" },
  },
  {
    id: "q_elite_cut", title: "Elite Cut", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_glass_shards"], minLevel: 18,
    brief: "Elite husks on the Flats have optics I can turn into eyes for my patients. Two pairs, please.",
    done: "Two pairs of eyes. My patients will see again. Mostly in infrared.",
    objectives: [{ id: "elites", kind: "kill", target: "elite_husk", count: 2 }],
    reward: { xp: 4200, cash: 820 },
  },
  {
    id: "q_blight_samples", title: "Blight Samples", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24,
    brief: "Something in the Cores Blight is rotting the machines. Blight husks, core crawlers. Samples, please. Gloves, optional.",
    done: "Corrosive, as I feared. This rifle fights fire with acid.",
    objectives: [
      { id: "blight", kind: "kill", target: "blight_husk", count: 1 },
      { id: "crawlers", kind: "kill", target: "core_crawler", count: 2 },
    ],
    reward: { xp: 7400, cash: 1400, gun: "Blight Lance" },
  },

  // Rigg, Coretown's gunsmith (level 8+): field tests and bounties.
  {
    id: "q_test_fire", title: "Test Fire", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.coretown], minLevel: 8,
    brief: "A gun's only as good as the hands holding it. Carry two new ones, any maker. Then tell me which one you'd marry.",
    done: "Good taste. Here's a pistol I built for nobody in particular.",
    objectives: [{ id: "guns", kind: "pickup", target: "gun", count: 2, label: "Take 2 new guns" }],
    reward: { xp: 700, cash: 200, gun: "Dust Devil" },
  },
  {
    id: "q_hauler_heist", title: "Hauler Heist", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_test_fire"], minLevel: 8,
    brief: "Sand haulers run Apex parts past the scav camp east of town. Their shields are thick. Their cargo is mine.",
    done: "Parts! I made you something from the leftovers.",
    objectives: [{ id: "haulers", kind: "kill", target: "sand_hauler", count: 2 }],
    reward: { xp: 1000, cash: 300, gun: "Hauler's Due" },
  },
  wanted({
    id: "q_wanted_gristle", title: "Wanted: Gristle", act: 2, giver: "rigg", turnIn: "rigg",
    requires: ["q_hauler_heist"], minLevel: 10, target: "gristle",
    brief: "Gristle ate my last delivery boy. And the delivery. He prowls the ripper gully south-west of town.",
    done: "Gristle's done eating. I pulled this out of him. Washed it. Mostly.",
    reward: { xp: 1600, cash: 420, gun: "Gristle's Fang" },
  }),
  {
    id: "q_ridge_raiders", title: "Ridge Raiders", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12,
    brief: "Armoured raiders on Split Ridge are stealing my shipments. Corrosive melts their plate.",
    done: "Shipments are flowing. Have a rifle with a spine.",
    objectives: [{ id: "raiders", kind: "kill", target: "ridge_raider", count: 2 }],
    reward: { xp: 2300, cash: 520, gun: "Ridgeback" },
  },
  {
    id: "q_spitter_season", title: "Spitter Season", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_ridge_raiders"], minLevel: 13,
    brief: "Crawler spitters nest by Wreck-Maw's old den. They're quick and they burn well.",
    done: "Season's over. This SMG burns even better than they did.",
    objectives: [{ id: "spitters", kind: "kill", target: "crawler_spitter", count: 2 }],
    reward: { xp: 2600, cash: 560, gun: "Spitfire" },
  },
  wanted({
    id: "q_wanted_skitter", title: "Wanted: Queen Skitter", act: 2, giver: "rigg", turnIn: "rigg",
    requires: ["q_spitter_season"], minLevel: 14, target: "queen_skitter",
    brief: "The spitters have a queen just north-west of the crawler nest. She lays them faster than you can shoot them. Fix that.",
    done: "No queen, no spitters. This shotgun's for whatever crawls out next.",
    reward: { xp: 3000, cash: 640, gun: "Skitter Swatter" },
  }),
  {
    id: "q_hauler_wrecks", title: "Hauler Wrecks", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "Glasswind haulers carry plate Apex wants back. I want it more. Bring one down.",
    done: "Good plate. Better than good. I'll make something terrible with it.",
    objectives: [{ id: "haulers", kind: "kill", target: "glasswind_hauler", count: 1 }],
    reward: { xp: 3900, cash: 800 },
  },
  {
    id: "q_slag_run", title: "Slag Run", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24,
    brief: "Slag loaders haul molten scrap to Ember Gate. Stop the run and save me the drippings.",
    done: "Drippings, as promised. This SMG spits them back.",
    objectives: [{ id: "slag", kind: "kill", target: "slag_loader", count: 2 }],
    reward: { xp: 7000, cash: 1300, gun: "Slag Spitter" },
  },
  {
    id: "q_war_machines", title: "War Machines", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_slag_run"], minLevel: 25,
    brief: "War loaders guard the gate in pairs. Shock their shields, then corrode the frames.",
    done: "Two fewer war machines. Apex will build more. We'll break more.",
    objectives: [{ id: "war", kind: "kill", target: "loader_war", count: 2 }],
    reward: { xp: 7800, cash: 1500 },
  },
  wanted({
    id: "q_wanted_krell", title: "Wanted: Foreman Krell", act: 3, giver: "rigg", turnIn: "rigg",
    requires: ["q_war_machines"], minLevel: 26, target: "foreman_krell",
    brief: "Foreman Krell runs the loader line west of Ember Gate. His shield is the best Apex makes. Prove it isn't.",
    done: "Krell's line has stopped. His hammer was a rifle all along.",
    reward: { xp: 9000, cash: 1800, gun: "Krell's Hammer" },
  }),

  // Sir Gauge, Coretown's surveyor (level 8+): censuses, dens and the wanted board.
  {
    id: "q_pup_patrol", title: "Pup Patrol", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.ripperControl], minLevel: 8,
    brief: "The ripper pups are back. Of course they're back. Four, if you please, before they become adults.",
    done: "Four fewer future hat-eaters. A fine day for millinery.",
    objectives: [{ id: "pups", kind: "kill", target: "ripper_pup", count: 4 }],
    reward: { xp: 900, cash: 240 },
  },
  {
    id: "q_monglet_den", title: "The Monglet Den", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_pup_patrol"], minLevel: 9,
    brief: "Old Tusk's den in Rustflat has new tenants. Survey it with your gun, would you? Travel back by the station.",
    done: "Den surveyed. I shall mark it 'formerly occupied'.",
    objectives: [
      { id: "whelps", kind: "kill", target: "bruiser_brat", count: 4 },
      { id: "bruisers", kind: "kill", target: "bruiser", count: 2 },
    ],
    reward: { xp: 1000, cash: 260 },
  },
  wanted({
    id: "q_wanted_rivet", title: "Wanted: Old Rivet", act: 2, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12, target: "old_rivet",
    brief: "Old Rivet is a nomad drone older than Coretown, all plate and grudge, north-west of the Split Ridge station.",
    done: "Old Rivet, retired. His launcher deserved a better owner. Now it has one.",
    reward: { xp: 2500, cash: 560, gun: "Rivet Gun" },
  }),
  {
    id: "q_marauder_census", title: "Marauder Census", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_rivet"], minLevel: 13,
    brief: "How many scav drones on Split Ridge? Count them by subtraction. Three should do for a sample.",
    done: "A tidy census. Take this rifle; it counts for you.",
    objectives: [{ id: "marauders", kind: "kill", target: "marauder", count: 3 }],
    reward: { xp: 2600, cash: 560, gun: "Census Taker" },
  },
  {
    id: "q_brood_count", title: "Brood Count", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_marauder_census"], minLevel: 14,
    brief: "A brood crawler leads every crawler pack on the ridge. Count one brood and its escort.",
    done: "Counted, catalogued and quite dead. Science!",
    objectives: [
      { id: "brood", kind: "kill", target: "brood_crawler", count: 1 },
      { id: "crawlers", kind: "kill", target: "crawler", count: 3 },
    ],
    reward: { xp: 3000, cash: 620 },
  },
  {
    id: "q_wreck_field", title: "The Wreck Field", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "A buzzard crashed in the wreck field south-east of the Flats, and scavs got there first. Survey the crash. Loudly.",
    done: "The wreck is surveyed. This SMG was in the cockpit, still fluxing.",
    objectives: [
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
      { id: "husks", kind: "kill", target: "husk", count: 3 },
    ],
    reward: { xp: 4000, cash: 800, gun: "Wreck Diver" },
  },
  wanted({
    id: "q_wanted_lady_glass", title: "Wanted: Lady Glass", act: 3, giver: "gauge", turnIn: "gauge",
    requires: ["q_wreck_field"], minLevel: 18, target: "lady_glass",
    brief: "Lady Glass holds court north-east of the Glasswind station behind a shield like a cathedral window. Shatter it.",
    done: "Shattered. Her sniper is the most elegant thing I've ever been handed by a mercenary.",
    reward: { xp: 4800, cash: 900, gun: "Glass Cannon" },
  }),
  {
    id: "q_crawler_census", title: "Crawler Census", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_lady_glass"], minLevel: 18,
    brief: "The Flats' crawler soldiers outnumber my notebooks. Reduce them to a countable figure.",
    done: "Countable at last. I've run out of notebooks anyway.",
    objectives: [{ id: "soldiers", kind: "kill", target: "crawler_soldier", count: 3 }],
    reward: { xp: 4600, cash: 880 },
  },
  wanted({
    id: "q_wanted_cinderjaw", title: "Wanted: Cinderjaw", act: 3, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24, target: "cinderjaw",
    brief: "Cinderjaw is a slag loader that learned to like it, north-east of the Ember Gate station. It's flesh-soft under the slag. Burn it.",
    done: "Cinderjaw's heart still glows. I had it made into a launcher. Naturally.",
    reward: { xp: 8000, cash: 1600, gun: "Cinder Heart" },
  }),
  {
    id: "q_long_way_home", title: "The Long Way Home", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_cinderjaw"], minLevel: 25,
    brief: "My last survey: the elite loader at the Blight's far camp, and its crew. Then I retire to write my memoirs.",
    done: "The survey is complete. Take my old rifle. It took me the long way home too.",
    objectives: [
      { id: "elite", kind: "kill", target: "elite_loader", count: 1 },
      { id: "loaders", kind: "kill", target: "loader", count: 3 },
    ],
    reward: { xp: 8600, cash: 1700, gun: "Long Way Home" },
  },
];

/** The story, and the first side jobs it has always had. Listed first so a giver offers story before side work. */
const STORY_QUESTS: readonly ScrapQuest[] = [
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
    brief: "Scrap whelps nest west of the bus. Aim, squeeze, and reload with R before you run dry. Ten should do.",
    done: "Ten whelps! You're a natural. A natural what, I won't say.",
    objectives: [{ id: "whelps", kind: "kill", target: "bruiser_brat", count: 10 }],
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
    brief: "Six bruiser frames guard the convoy south of camp. They're all hide and no plate, so fire roasts them. No fire gun yet? Shoot more. Then pop the convoy's red crate, and read the card before you take what's inside: green beats white, and fire beats hide.",
    done: "Plate's off, and so are they. Compare first, grab second: that's how you stay alive out here.",
    objectives: [
      { id: "bruisers", kind: "kill", target: "bruiser", count: 6 },
      { id: "crate", kind: "chest", target: CONVOY_CHEST, count: 1, label: "Open the convoy's red crate" },
      { id: "gun", kind: "pickup", target: "gun", count: 1, label: "Take a gun from it" },
    ],
    reward: { xp: 280, cash: 70 },
  },
  {
    id: QUEST_IDS.oldTusk,
    title: "Old Tusk",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.bruiserBash],
    minLevel: 3,
    brief: "Old Tusk runs the Monglet Den north-west of the crash, and he blocks the only road out. Thin out the whelps he keeps, then put him down. If he puts you down first, get a kill before your reserve runs dry: that's your second wind.",
    done: "Old Tusk is scrap! Here, a second weapon slot. Carry two guns, feel twice as dangerous.",
    objectives: [
      { id: "whelps", kind: "kill", target: "bruiser_brat", count: 4, near: "poi_monglet_den" },
      { id: "tusk", kind: "kill", target: "old_tusk", count: 1 },
    ],
    reward: { xp: 390, cash: 115, unlocks: [unlock.slot(2)] },
    spawn: { catalogId: "old_tusk", marker: "poi_monglet_den", instanceId: "boss_old_tusk" },
  },
  {
    id: QUEST_IDS.roadToShelf,
    title: "Road to the Shelf",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
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
      { id: "husks", kind: "kill", target: "husk", count: 5 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
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
    objectives: [{ id: "bruisers", kind: "kill", target: "bruiser", count: 4 }],
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

export const scrapQuests: readonly ScrapQuest[] = [...STORY_QUESTS, ...SIDE_QUESTS];

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
