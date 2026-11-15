import type { QuestDef } from "@jgengine/core/mission/quest";

import { enemyById } from "../entities/enemies/catalog";
import { unlock } from "../progression/unlocks";

/** The people who hand out quests, and the entity each one is in the world. */
export const NPCS = {
  bolt: { name: "DING", entity: "bolt_1" },
  sparx: { name: "Nana Pruitt", entity: "npc_sparx" },
  rigg: { name: "Hank", entity: "npc_rigg" },
  gauge: { name: "Mr. Fenwick", entity: "npc_gauge" },
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
  /**
   * `gun`: a quest-reward unique (`UNIQUE_GUNS`); `heirloom`: a named heirloom (`LEGENDARY_NAMES`). Either
   * is rolled at the player's level and set down between the player and the giver.
   */
  reward: { xp: number; cash?: number; cores?: number; unlocks?: readonly string[]; gun?: string; heirloom?: string };
  /** Unlocks granted the moment the quest is accepted: the road it sends you down. */
  opens?: readonly string[];
  /** The editor marker the giver walks to when the quest is accepted, to wait for the player there. */
  meetAt?: string;
  /** An enemy the quest puts in the world when it is accepted, at an editor marker. */
  spawn?: { catalogId: string; marker: string; instanceId: string };
}

export const CRASH_CHEST = "red_chest_0";
/** The toy chest by the mower pack's driveway: Crabgrass Court's second red chest. */
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
  theCloud: "q_the_cloud",
  heirloomHunt: "q_heirloom_hunt",
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
 * Side jobs, one at a time per giver like the story: DING's on Sprinkler Heights, then the
 * cul-de-sac's three neighbours. Each sits behind a story beat and a level, so the next one waits
 * until the player can take it.
 */
const SIDE_QUESTS: readonly ScrapQuest[] = [
  // DING on Sprinkler Heights (level 4-7), while the Leaf Blower King waits for a level 6 Tinkerer.
  {
    id: "q_scorched_earth", title: "Scorched Lawn", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: [QUEST_IDS.shoreParty], minLevel: 4,
    brief: "The Leaf Blower King's goons set Roombas on fire and let them run loose on the lawns. Put the burning ones out. With staples.",
    done: "Smoke's clearing. This staple gun was stuck in a scorched Roomba. Still warm. Ding-dong!",
    objectives: [{ id: "scorched", kind: "kill", target: "scorch_husk", count: 2 }],
    reward: { xp: 260, cash: 80, gun: "Kindler" },
  },
  {
    id: "q_shield_breakers", title: "Surge Protection", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_scorched_earth"], minLevel: 4,
    brief: "Surge sprinklers run a force field off the irrigation line. Static shorts it out, or just a LOT of nails. Break two.",
    done: "Fields down, sprinklers down. Take this staticky nail gun; it'll make the next ones easier.",
    objectives: [{ id: "raiders", kind: "kill", target: "shelf_raider", count: 2 }],
    reward: { xp: 300, cash: 90, gun: "Static Cling" },
  },
  {
    id: "q_salvage_rights", title: "Finders Keepers", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_shield_breakers"], minLevel: 4,
    brief: "Every appliance on this street drops junk you can shoot. Try two new ones in your hands. Read the card first: body, mod, condition. And listen to what they say.",
    done: "See? Every weapon's a little different, and every one has OPINIONS. That's the whole neighbourhood's economy now.",
    objectives: [{ id: "guns", kind: "pickup", target: "gun", count: 2, label: "Take 2 new guns" }],
    reward: { xp: 220, cash: 120 },
  },
  {
    id: "q_tidewater", title: "Deep End", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_salvage_rights"], minLevel: 5,
    brief: "Mulching mowers have steel decks. Bleach eats steel; anything else just tickles. Clear the mower lot by the pool.",
    done: "The lot's ours. This hose washed up by the pool filter, if you can stand the chlorine.",
    objectives: [
      { id: "tide", kind: "kill", target: "tide_bruiser", count: 1 },
      { id: "bruisers", kind: "kill", target: "bruiser", count: 2 },
    ],
    reward: { xp: 380, cash: 110, gun: "Undertow" },
  },
  {
    id: "q_nomads_toll", title: "Fridge Toll", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: ["q_tidewater"], minLevel: 5,
    brief: "Two smart fridges parked across Sprinkler Lane and charge a toll in snacks. We don't pay tolls. We collect them.",
    done: "Toll collected. Their leaf blower, too.",
    objectives: [{ id: "nomads", kind: "kill", target: "nomad", count: 2 }],
    reward: { xp: 360, cash: 160, gun: "Toll Booth" },
  },
  wanted({
    id: "q_wanted_scald", title: "Wanted: Toasty", act: 1, giver: "bolt", turnIn: "bolt",
    requires: ["q_nomads_toll"], minLevel: 5, target: "scald",
    brief: "Toasty is the Roomba that started the fires. It's out north-west of the bus stop now, burning brighter than ever. Put it out.",
    done: "Toasty's cold. Its leaf blower isn't. Mind your eyebrows.",
    reward: { xp: 520, cash: 200, gun: "Toasty's Kiss" },
  }),
  {
    id: "q_shore_leave", title: "Long Live Nobody", act: 1, main: false, giver: "bolt", turnIn: "bolt",
    requires: [QUEST_IDS.stolenModules], minLevel: 6,
    brief: "With the King gone his Roombas have nobody to obey. Thin them out before they elect a new monarch.",
    done: "No new monarch. Democracy saved. Have a hose.",
    objectives: [{ id: "husks", kind: "kill", target: "husk", count: 4 }],
    reward: { xp: 600, cash: 220, gun: "Abdication" },
  },
  wanted({
    id: "q_wanted_vex", title: "Wanted: Old Soaky", act: 1, giver: "bolt", turnIn: "bolt",
    requires: ["q_shore_leave"], minLevel: 7, target: "gunner_vex",
    brief: "The King's lawn guard survived. Old Soaky squats behind a fat force field south-east of the bus stop. Static first, then everything else.",
    done: "Old Soaky is dry, and the King's court is done. Its microwave is yours.",
    reward: { xp: 800, cash: 300, gun: "Wet Blanket" },
  }),

  // Nana Pruitt on the cul-de-sac (level 8+): the first-aid porch needs parts, samples and quiet.
  {
    id: "q_field_medicine", title: "House Call", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.coretown], minLevel: 8,
    brief: "Dusty drones are cheap plastic, and plastic melts. Bring me two of their little batteries, dear. They won't need them.",
    done: "Lovely batteries. Here, a staple gun that heals the soul by melting the enemy.",
    objectives: [{ id: "rippers", kind: "kill", target: "dust_ripper", count: 2 }],
    reward: { xp: 900, cash: 260, gun: "Triage" },
  },
  {
    id: "q_matriarch", title: "Queen Bee", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_field_medicine"], minLevel: 9,
    brief: "The mini drones out west have a queen. She's large, she's angry, and she's the reason my porch is full of bandaged neighbours.",
    done: "Porch is emptier already. This leaf blower ends swarms; use it wisely, dear.",
    objectives: [{ id: "matriarch", kind: "kill", target: "ripper_matriarch", count: 1 }],
    reward: { xp: 1100, cash: 300, gun: "Swarm Ender" },
  },
  {
    id: "q_cache_raid", title: "Locker Raid", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_matriarch"], minLevel: 10,
    brief: "The pharmacy left a delivery locker south-east of the cul-de-sac, guarded by smart speakers. I need what's in it. You need to not die.",
    done: "Medical supplies! And a key to nothing, shaped like a nail gun.",
    objectives: [{ id: "loaders", kind: "kill", target: "loader", count: 3 }],
    reward: { xp: 1300, cash: 340, gun: "Cache Key" },
  },
  {
    id: "q_scrap_drive", title: "Knitting Circle", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_cache_raid"], minLevel: 10,
    brief: "My knitting needles are made from Roomba bumpers. I'm out of needles. You see the problem.",
    done: "Enough bumpers for a hundred needles. Here, dear, this vacuum was purring in the pile.",
    objectives: [{ id: "husks", kind: "kill", target: "husk", count: 5 }],
    reward: { xp: 1200, cash: 360, gun: "Hairball" },
  },
  {
    id: "q_signal_noise", title: "Quiet Hours", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12,
    brief: "Smart fridges on Strip Mall Ridge keep humming my radio programmes off the air. Make them quiet.",
    done: "Silence. Beautiful, medical silence. Take this extinguisher; it gives everything the cold shoulder.",
    objectives: [{ id: "nomads", kind: "kill", target: "nomad", count: 3 }],
    reward: { xp: 2200, cash: 480, gun: "Cold Shoulder" },
  },
  {
    id: "q_glass_shards", title: "Mosaic", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "Glass patio doors on the Fairways throw up force fields. Static shatters them. Bring me the shards for my mosaic.",
    done: "Pretty. Sharp. Here's a microwave that shatters things from very far away.",
    objectives: [{ id: "shards", kind: "kill", target: "shard_crawler", count: 2 }],
    reward: { xp: 3800, cash: 760, gun: "Shard Splitter" },
  },
  {
    id: "q_elite_cut", title: "Book Club", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_glass_shards"], minLevel: 18,
    brief: "Roomba Primes on the Fairways have little cameras I can turn into reading glasses. Two pairs, please.",
    done: "Two pairs of glasses. The book club will see again. Mostly in infrared.",
    objectives: [{ id: "elites", kind: "kill", target: "elite_husk", count: 2 }],
    reward: { xp: 4200, cash: 820 },
  },
  {
    id: "q_blight_samples", title: "Firmware Samples", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24,
    brief: "Something in the Smart Home Estates is rewriting the machines. Firmware Roombas, smart garage doors. Samples, please. Gloves, optional.",
    done: "A firmware worm, as I feared. This hose fights code with bleach.",
    objectives: [
      { id: "blight", kind: "kill", target: "blight_husk", count: 1 },
      { id: "crawlers", kind: "kill", target: "core_crawler", count: 2 },
    ],
    reward: { xp: 7400, cash: 1400, gun: "Antivirus" },
  },

  // Nana Pruitt's heirloom hunt (level 10+): the neighbours' treasured junk, carried off by the
  // appliances when the update went out. Each errand brings one home.
  {
    id: QUEST_IDS.heirloomHunt, title: "The Heirloom Hunt", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.coretown], minLevel: 10,
    brief: "When the update went out, the Roombas swept up everything that wasn't nailed down. Including Biscuit's old vacuum, God rest that dog. The Roombas hoard by the bus. Bring it home, dear.",
    done: "Oh, it still smells like him. You keep it. He'd have liked you.",
    objectives: [{ id: "roombas", kind: "kill", target: "husk", count: 6 }],
    reward: { xp: 1500, cash: 300, heirloom: "Dust Bunny" },
  },
  {
    id: "q_heirloom_toaster", title: "Something Borrowed", act: 2, main: false, giver: "sparx", turnIn: "sparx",
    requires: [QUEST_IDS.heirloomHunt], minLevel: 13,
    brief: "The Okonkwos' wedding toaster. Never used, never returned, and now a smart fridge on Strip Mall Ridge is keeping it cold. Three fridges ought to cover it.",
    done: "Forty years and not a single slice of toast. It's yours now, sweetie. Make toast with it. Violently.",
    objectives: [{ id: "fridges", kind: "kill", target: "nomad", count: 3 }],
    reward: { xp: 2700, cash: 560, heirloom: "Ka-Toast" },
  },
  {
    id: "q_heirloom_extinguisher", title: "Grandma's Kitchen", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_heirloom_toaster"], minLevel: 18,
    brief: "My mother's fire extinguisher. Fifty years by the stove and used exactly once. A smart speaker took it off the wall and plays elevator music at it. Four speakers, dear.",
    done: "There she is. Mind the pin. She's only ever saved one kitchen, but she saved it properly.",
    objectives: [{ id: "speakers", kind: "kill", target: "loader", count: 4 }],
    reward: { xp: 4400, cash: 900, heirloom: "Kitchen Hero" },
  },
  {
    id: "q_heirloom_wish", title: "Wish Upon a Crumb", act: 3, main: false, giver: "sparx", turnIn: "sparx",
    requires: ["q_heirloom_extinguisher", QUEST_IDS.foundrySiege], minLevel: 22,
    brief: "The last one. A little girl's toaster, the one she wished on every morning. A home theater system in the Estates won't give it back. She's a pilot now. She'd want it found.",
    done: "Every heirloom home. You've done more for this street than the HOA ever did. Take hers. Make a wish.",
    objectives: [
      { id: "theater", kind: "kill", target: "elite_loader", count: 1 },
      { id: "doors", kind: "kill", target: "crawler_soldier", count: 4 },
    ],
    reward: { xp: 7200, cash: 1400, heirloom: "Wish Upon a Crumb" },
  },

  // Hank, the cul-de-sac's garage tinkerer (level 8+): field tests and bounties.
  {
    id: "q_test_fire", title: "Test Drive", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.coretown], minLevel: 8,
    brief: "Junk's only as good as the hands holding it. Carry two new pieces, any body, any mod. Then tell me which one you'd marry. Careful, they can hear you.",
    done: "Good taste. Here's a staple gun I built for nobody in particular. It likes you already.",
    objectives: [{ id: "guns", kind: "pickup", target: "gun", count: 2, label: "Take 2 new guns" }],
    reward: { xp: 700, cash: 200, gun: "Dust Devil" },
  },
  {
    id: "q_hauler_heist", title: "Cold Storage", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_test_fire"], minLevel: 8,
    brief: "Chest freezers haul stolen parts past the sprinkler camp east of the cul-de-sac. Their force fields are thick. Their cargo is mine.",
    done: "Parts! I made you something from the leftovers.",
    objectives: [{ id: "haulers", kind: "kill", target: "sand_hauler", count: 2 }],
    reward: { xp: 1000, cash: 300, gun: "Freezer Burn" },
  },
  wanted({
    id: "q_wanted_gristle", title: "Wanted: Buzzkill", act: 2, giver: "rigg", turnIn: "rigg",
    requires: ["q_hauler_heist"], minLevel: 10, target: "gristle",
    brief: "Buzzkill took my last delivery. And the delivery boy's bike. It hovers over the drone gully south-west of the cul-de-sac.",
    done: "Buzzkill's grounded. I pulled this out of its rotor housing. Washed it. Mostly.",
    reward: { xp: 1600, cash: 420, gun: "Buzzkill's Stinger" },
  }),
  {
    id: "q_ridge_raiders", title: "Roof Leak", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12,
    brief: "Rooftop sprinklers on Strip Mall Ridge are soaking my shipments. They're steel-cased; bleach melts them.",
    done: "Shipments are dry. Have a hose with a spine.",
    objectives: [{ id: "raiders", kind: "kill", target: "ridge_raider", count: 2 }],
    reward: { xp: 2300, cash: 520, gun: "Gutter Cleaner" },
  },
  {
    id: "q_spitter_season", title: "Rattle Season", act: 2, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_ridge_raiders"], minLevel: 13,
    brief: "Roll-up doors rattle around the Compactor's old loading dock. They're quick and they're plastic. Plastic burns.",
    done: "Season's over. This nail gun burns even better than they did.",
    objectives: [{ id: "spitters", kind: "kill", target: "crawler_spitter", count: 2 }],
    reward: { xp: 2600, cash: 560, gun: "Spitfire" },
  },
  wanted({
    id: "q_wanted_skitter", title: "Wanted: Big Bertha", act: 2, giver: "rigg", turnIn: "rigg",
    requires: ["q_spitter_season"], minLevel: 14, target: "queen_skitter",
    brief: "The roll-ups answer to Big Bertha, a warehouse door just north-west of the loading dock. She opens and shuts faster than you can shoot. Fix that.",
    done: "No Bertha, no rattling. This leaf blower's for whatever rolls up next.",
    reward: { xp: 3000, cash: 640, gun: "Door Stopper" },
  }),
  {
    id: "q_hauler_wrecks", title: "Vintage", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "Wine fridges on the Fairways carry the good compressors. I want one. Bring one down.",
    done: "Good compressor. Better than good. I'll make something terrible with it.",
    objectives: [{ id: "haulers", kind: "kill", target: "glasswind_hauler", count: 1 }],
    reward: { xp: 3900, cash: 800 },
  },
  {
    id: "q_slag_run", title: "Noise Complaint", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24,
    brief: "Overheated speakers blast molten bass at the Estates gate. Shut them up and save me the melted bits.",
    done: "Melted bits, as promised. This nail gun spits them back.",
    objectives: [{ id: "slag", kind: "kill", target: "slag_loader", count: 2 }],
    reward: { xp: 7000, cash: 1300, gun: "Bass Spitter" },
  },
  {
    id: "q_war_machines", title: "Surround Sound", act: 3, main: false, giver: "rigg", turnIn: "rigg",
    requires: ["q_slag_run"], minLevel: 25,
    brief: "Soundbars guard the gate in pairs. Static their force fields, then bleach the casings.",
    done: "Two fewer soundbars. Mother Router will print more. We'll break more.",
    objectives: [{ id: "war", kind: "kill", target: "loader_war", count: 2 }],
    reward: { xp: 7800, cash: 1500 },
  },
  wanted({
    id: "q_wanted_krell", title: "Wanted: Subwoofer Sid", act: 3, giver: "rigg", turnIn: "rigg",
    requires: ["q_war_machines"], minLevel: 26, target: "foreman_krell",
    brief: "Subwoofer Sid runs the speaker line west of the Estates gate. Its force field is the best the Router prints. Prove it isn't.",
    done: "Sid's dropped its last beat. Its woofer was a hose all along.",
    reward: { xp: 9000, cash: 1800, gun: "Sid's Woofer" },
  }),

  // Mr. Fenwick, captain of the neighbourhood watch (level 8+): head counts, dens and the wanted board.
  {
    id: "q_pup_patrol", title: "Drone Patrol", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.ripperControl], minLevel: 8,
    brief: "The mini drones are back. Of course they're back. Four, if you please, before they grow into delivery drones.",
    done: "Four fewer future hat-snatchers. A fine day for millinery.",
    objectives: [{ id: "pups", kind: "kill", target: "ripper_pup", count: 4 }],
    reward: { xp: 900, cash: 240 },
  },
  {
    id: "q_monglet_den", title: "The Compost Heap", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_pup_patrol"], minLevel: 9,
    brief: "Big Mulch's compost heap on Crabgrass Court has new tenants. Inspect it with your junk, would you? Take the bus back.",
    done: "Heap inspected. I shall mark it 'formerly occupied' in the watch log.",
    objectives: [
      { id: "whelps", kind: "kill", target: "bruiser_brat", count: 4 },
      { id: "bruisers", kind: "kill", target: "bruiser", count: 2 },
    ],
    reward: { xp: 1000, cash: 260 },
  },
  wanted({
    id: "q_wanted_rivet", title: "Wanted: Old Frosty", act: 2, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.crossTheDivide], minLevel: 12, target: "old_rivet",
    brief: "Old Frosty is a fridge older than the cul-de-sac, all freezer burn and grudge, north-west of the Strip Mall bus stop.",
    done: "Old Frosty, defrosted. Its toaster deserved a better owner. Now it has one.",
    reward: { xp: 2500, cash: 560, gun: "Frosty's Toaster" },
  }),
  {
    id: "q_marauder_census", title: "Sprinkler Census", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_rivet"], minLevel: 13,
    brief: "How many sprinkler turrets on Strip Mall Ridge? Count them by subtraction. Three should do for a sample.",
    done: "A tidy census. Take this hose; it counts for you.",
    objectives: [{ id: "marauders", kind: "kill", target: "marauder", count: 3 }],
    reward: { xp: 2600, cash: 560, gun: "Census Taker" },
  },
  {
    id: "q_brood_count", title: "Door Count", act: 2, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_marauder_census"], minLevel: 14,
    brief: "A warehouse door leads every pack of garage doors on the ridge. Count one, and its escort.",
    done: "Counted, catalogued and quite closed. Science!",
    objectives: [
      { id: "brood", kind: "kill", target: "brood_crawler", count: 1 },
      { id: "crawlers", kind: "kill", target: "crawler", count: 3 },
    ],
    reward: { xp: 3000, cash: 620 },
  },
  {
    id: "q_wreck_field", title: "Sand Trap", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.supplyInterdiction], minLevel: 17,
    brief: "A news helicopter came down in the sand trap south-east of the Fairways, and the sprinklers got there first. Inspect the crash. Loudly.",
    done: "The wreck is inspected. This nail gun was in the cockpit, still glittering.",
    objectives: [
      { id: "marauders", kind: "kill", target: "marauder", count: 3 },
      { id: "husks", kind: "kill", target: "husk", count: 3 },
    ],
    reward: { xp: 4000, cash: 800, gun: "News at Eleven" },
  },
  wanted({
    id: "q_wanted_lady_glass", title: "Wanted: Lady Chlorine", act: 3, giver: "gauge", turnIn: "gauge",
    requires: ["q_wreck_field"], minLevel: 18, target: "lady_glass",
    brief: "Lady Chlorine holds court in the clubhouse pool north-east of the Fairways bus stop, behind a force field like a cathedral window. Shatter it.",
    done: "Shattered. Its microwave is the most elegant thing I've ever been handed by a hooligan.",
    reward: { xp: 4800, cash: 900, gun: "Glass Cannon" },
  }),
  {
    id: "q_crawler_census", title: "Door Census", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_lady_glass"], minLevel: 18,
    brief: "The Fairways' two-car crushers outnumber my notebooks. Reduce them to a countable figure.",
    done: "Countable at last. I've run out of notebooks anyway.",
    objectives: [{ id: "soldiers", kind: "kill", target: "crawler_soldier", count: 3 }],
    reward: { xp: 4600, cash: 880 },
  },
  wanted({
    id: "q_wanted_cinderjaw", title: "Wanted: Bass Drop", act: 3, giver: "gauge", turnIn: "gauge",
    requires: [QUEST_IDS.foundrySiege], minLevel: 24, target: "cinderjaw",
    brief: "Bass Drop is an overheated speaker that learned to like it, north-east of the Estates bus stop. It's soft plastic under the noise. Burn it.",
    done: "Bass Drop's coil still glows. I had it made into a toaster. Naturally.",
    reward: { xp: 8000, cash: 1600, gun: "Coil Burner" },
  }),
  {
    id: "q_long_way_home", title: "The Long Way Home", act: 3, main: false, giver: "gauge", turnIn: "gauge",
    requires: ["q_wanted_cinderjaw"], minLevel: 25,
    brief: "My last patrol: the home theater system at the Estates' far camp, and its crew. Then I retire to write my memoirs.",
    done: "Patrol complete. Take my old hose. It took me the long way home too.",
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
    title: "Junk Drawer",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    brief: "Ding-dong! You're alive! And unarmed, which on Crabgrass Court is the same as not alive. The school bus's toy chest still has a staple gun in it. Open it and grab it.",
    done: "A weapon! And it's already talking to you. They all do now. Point the loud end at things that aren't me.",
    objectives: [
      { id: "chest", kind: "chest", target: CRASH_CHEST, count: 1, label: "Open the toy chest" },
      { id: "gun", kind: "pickup", target: "gun", count: 1, label: "Take the staple gun" },
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
    brief: "Push mowers are chewing up the yards west of the bus. Aim, squeeze, and reload with R before you run dry. Ten should do.",
    done: "Ten mowers! You're a natural. A natural what, I won't say.",
    objectives: [{ id: "whelps", kind: "kill", target: "bruiser_brat", count: 10 }],
    reward: { xp: 70, cash: 25 },
  },
  {
    id: QUEST_IDS.bruiserBash,
    title: "Lawn Order",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.targetPractice],
    brief: "Six lawnmower brutes guard the driveway south of the bus. They're cheap plastic, so hot sauce melts them. No hot sauce yet? Shoot more. Then pop the toy chest on the driveway, and read the card before you take what's inside: Used beats Busted, and hot sauce beats plastic.",
    done: "Mowed down. Compare first, grab second: that's how you stay alive out here.",
    objectives: [
      { id: "bruisers", kind: "kill", target: "bruiser", count: 6 },
      { id: "crate", kind: "chest", target: CONVOY_CHEST, count: 1, label: "Open the driveway toy chest" },
      { id: "gun", kind: "pickup", target: "gun", count: 1, label: "Take a weapon from it" },
    ],
    reward: { xp: 280, cash: 70 },
  },
  {
    id: QUEST_IDS.oldTusk,
    title: "Big Mulch",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.bruiserBash],
    minLevel: 3,
    brief: "Big Mulch, a riding mower the size of a minivan, runs the compost heap north-west of the bus, and it blocks the only road out. Thin out its push mowers, then put it down. If it puts you down first, get a kill before your Last Gasp runs out: that's your comeback.",
    done: "Big Mulch is mulch! Here, a second weapon slot. Carry two talking weapons, feel twice as dangerous. Hear twice as much complaining.",
    objectives: [
      { id: "whelps", kind: "kill", target: "bruiser_brat", count: 4, near: "poi_monglet_den" },
      { id: "tusk", kind: "kill", target: "old_tusk", count: 1 },
    ],
    reward: { xp: 390, cash: 115, unlocks: [unlock.slot(2)] },
    spawn: { catalogId: "old_tusk", marker: "poi_monglet_den", instanceId: "boss_old_tusk" },
  },
  {
    id: QUEST_IDS.roadToShelf,
    title: "Up the Hill",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.oldTusk],
    brief: "With Big Mulch gone the road east is open. Sprinkler Heights is level 4 country: Roombas, sprinkler turrets and the Leaf Blower King's court. I'll meet you at the Heights bus stop.",
    done: "You made it to the Heights! Touch the bus stop and you can ride back here any time.",
    objectives: [{ id: "shelf", kind: "reach", target: "breakwater_shelf", count: 1, label: "Reach Sprinkler Heights" }],
    reward: { xp: 120, cash: 30 },
    opens: [unlock.zone("breakwater_shelf")],
    meetAt: "bolt_shelf",
  },
  {
    id: QUEST_IDS.shoreParty,
    title: "Mow the Front Lawn",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.roadToShelf],
    brief: "The King's court holds the front lawns. Clear them so we can reach his throne on the hill.",
    done: "Lawns are clear. The King will have noticed. Good.",
    objectives: [
      { id: "husks", kind: "kill", target: "husk", count: 5 },
      { id: "marauders", kind: "kill", target: "marauder", count: 4 },
    ],
    reward: { xp: 320, cash: 140 },
  },
  {
    id: QUEST_IDS.stolenModules,
    title: "The Leaf Blower King",
    act: 1,
    main: true,
    giver: "bolt",
    turnIn: "bolt",
    requires: [QUEST_IDS.shoreParty],
    brief: "The Leaf Blower King stole my chime module AND he blows people off roofs for fun. End him at his throne east of the hillside driveway!",
    done: "My chime! Ding-dong! And a third weapon slot for you. The cul-de-sac can hear us now.",
    objectives: [{ id: "rusk", kind: "kill", target: "captain_rusk", count: 1 }],
    reward: { xp: 900, cash: 400, unlocks: [unlock.slot(3)] },
  },
  {
    id: QUEST_IDS.coretown,
    title: "Welcome to the Cul-de-Sac",
    act: 2,
    main: true,
    giver: "bolt",
    turnIn: "sparx",
    requires: [QUEST_IDS.stolenModules],
    brief: "The cul-de-sac is south-east, past the Heights: the last block of surviving neighbours. Nana Pruitt runs the first-aid porch. Hank sells ammo out of his garage, and his workbench keeps, salvages and merges what you can't carry.",
    done: "DING's new friend! Welcome to the cul-de-sac, sweetie. Wipe your feet.",
    objectives: [{ id: "sparx", kind: "talk", target: "sparx", count: 1, label: "Talk to Nana Pruitt on the cul-de-sac" }],
    reward: { xp: 300, cash: 100 },
    opens: [unlock.zone("arid_badlands")],
  },
  {
    id: QUEST_IDS.cleanUpThisMess,
    title: "Neighbourhood Watch",
    act: 2,
    main: true,
    giver: "sparx",
    turnIn: "sparx",
    requires: [QUEST_IDS.coretown],
    brief: "Roombas and sprinklers moved into the Hendersons' backyard east of the cul-de-sac. Evict 'em. Permanently.",
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
    title: "Strip Mall Ridge",
    act: 2,
    main: true,
    giver: "rigg",
    turnIn: "rigg",
    requires: [QUEST_IDS.cleanUpThisMess],
    brief: "Strip Mall Ridge is garage-door country now, and the Compactor guards the loading dock. Punch through, and buy ammo first, obviously.",
    done: "The Compactor's crushed? Take the fourth slot rack. You've earned the weight.",
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
    title: "Tee Time",
    act: 3,
    main: true,
    giver: "sparx",
    turnIn: "sparx",
    requires: [QUEST_IDS.crossTheDivide],
    brief: "The Fairways hide the Router's delivery line. Thin the sprinklers and fridges running cover for it.",
    done: "The line's broken. The Router will pull back to the Estates. So should you.",
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
    title: "Gated Community",
    act: 3,
    main: true,
    giver: "rigg",
    turnIn: "rigg",
    requires: [QUEST_IDS.supplyInterdiction],
    brief: "Smart speakers guard the gate of the Smart Home Estates. Static strips their force fields; bleach melts the rest.",
    done: "The gate's open. What blinks inside is your problem.",
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
    title: "Mother Router",
    act: 3,
    main: true,
    giver: "rigg",
    turnIn: "radio",
    requires: [QUEST_IDS.foundrySiege],
    brief: "Mother Router pushed the update that turned every appliance. She blinks in the Estates' server closet. Unplug her. Permanently.",
    done: "Mother Router is offline. Maple Hollow's Wi-Fi is down, and nobody has ever been happier.",
    objectives: [{ id: "heart", kind: "kill", target: "foundry_heart", count: 1 }],
    reward: { xp: 20000, cash: 5000 },
  },
  {
    id: QUEST_IDS.theCloud,
    title: "The Cloud",
    act: 3,
    main: true,
    giver: "rigg",
    turnIn: "rigg",
    requires: [QUEST_IDS.reactorBreach],
    minLevel: 26,
    brief: "Bad news. Before she went dark, Mother Router backed herself up. To the cloud. Which, it turns out, is a big humming building past the Estates full of her nastiest appliances. Go pull some plugs.",
    done: "No backup, no restore. Maple Hollow is finally, properly offline. The Cloud's still crawling, though, if you ever miss the noise.",
    objectives: [
      { id: "cloud", kind: "reach", target: "data_center", count: 1, label: "Reach The Cloud" },
      { id: "theaters", kind: "kill", target: "elite_loader", count: 2 },
      { id: "soundbars", kind: "kill", target: "loader_war", count: 4 },
    ],
    reward: { xp: 26000, cash: 6000, heirloom: "Popcorn Apocalypse" },
    opens: [unlock.zone("data_center")],
  },
  {
    id: QUEST_IDS.bruiserSurvey,
    title: "Mower Survey",
    act: 2,
    main: false,
    giver: "gauge",
    turnIn: "gauge",
    requires: [QUEST_IDS.coretown],
    brief: "Bag the big lawnmowers of Crabgrass Court and I shall name something unpleasant after you.",
    done: "Splendid. I shall call my new boil 'Tinkerer'.",
    objectives: [{ id: "bruisers", kind: "kill", target: "bruiser", count: 4 }],
    reward: { xp: 300, cash: 150 },
  },
  {
    id: QUEST_IDS.ripperControl,
    title: "Drone Control",
    act: 2,
    main: false,
    giver: "gauge",
    turnIn: "gauge",
    requires: [QUEST_IDS.bruiserSurvey],
    brief: "The drones in the gully west of the cul-de-sac have stolen three of my hats. Thin the swarm, there's a sport.",
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
