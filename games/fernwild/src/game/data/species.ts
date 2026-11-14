import type { TemperamentConfig } from "@jgengine/core/ai/temperament";
import type { VitalDose } from "@jgengine/core/stats/vitals";

import { botProfile, temperamentConfig, type Temperament } from "./bots";
import { type FirmwareTier, preferredFirmware, withFirmware } from "./firmware";
import { AWAKE_TAMES, food, type TamingDef, tamingTable } from "./taming";

export type { Temperament };

/** A creature's base stat and its gain per wild level (ARK's wild per-level increase). */
export interface StatLine {
  base: number;
  perLevel: number;
}

/** One ARK species: stats, speeds, temperament, diet, taming table, saddle and carcass. */
export interface SpeciesDef {
  id: string;
  label: string;
  temperament: Temperament;
  diet: "grazer" | "scavenger";
  health: StatLine;
  stamina: StatLine;
  oxygen: StatLine;
  food: StatLine;
  weight: StatLine;
  melee: StatLine;
  /** Walk and sprint in metres per second (ARK units / 100). */
  walk: number;
  sprint: number;
  /** Sprint once tamed, when ARK lists a different one (a tamed lodestone outruns a wild one). */
  tamedSprint?: number;
  /** Stamina a second while ridden at a sprint (ARK's movement table). */
  sprintStamina: number;
  /** ARK's base kill XP: a kill gives this x (1 + 0.1 x (level - 1)). */
  killXp: number;
  /** Bite: damage at level 1, seconds between bites, reach in metres. Null when it never fights. */
  attack: { damage: number; interval: number; reach: number } | null;
  taming: TamingDef;
  /** Saddle item that makes it rideable; null when it cannot be ridden. */
  saddle: string | null;
  /** The saddle's engram: level it opens at, engram points and what it costs. Null when it has no saddle. */
  saddleEngram: { level: number; points: number; cost: Record<string, number> } | null;
  /** Where the rider sits: right, up, forward in metres. */
  seat: readonly [number, number, number];
  /** Its body when harvested: hits it lasts and what each hit gives before the tool's bias. */
  carcass: { hits: number; meat: number; salvage: number };
  /** Body radius in metres, for hits and prompts. */
  radius: number;
  /** Clubs, darts and narcotics never put it down (ARK's bosses). */
  torporImmune?: boolean;
  /** The firmware tier it tames best on; null for what cannot be tamed. */
  firmware: FirmwareTier | null;
}

/** Wild creatures roll levels 1-30 like ARK's Island at difficulty 1. */
export const WILD_LEVELS = { min: 1, max: 30 } as const;

/**
 * Danger rises with distance: a zone by the survivor's beach rolls levels up to 5, and the cap climbs a
 * level every 50 m out, so only zones 1250 m away or more roll the full 30.
 */
export function wildLevelCap(metresFromStart: number): number {
  return Math.min(WILD_LEVELS.max, Math.max(5, Math.floor(5 + metresFromStart / 50)));
}

/** The three species with their full wiki taming tables. ARK wiki numbers (ark.wiki.gg). Speeds are units/s ÷ 100. */
const DETAILED: Readonly<Record<string, Omit<SpeciesDef, "firmware">>> = {
  mowbot: {
    id: "mowbot",
    label: "Mowbot",
    temperament: "passive",
    diet: "grazer",
    health: { base: 40, perLevel: 8 },
    stamina: { base: 100, perLevel: 10 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: 450, perLevel: 45 },
    weight: { base: 50, perLevel: 1 },
    melee: { base: 5, perLevel: 0.25 },
    walk: 0.65,
    sprint: 1.37,
    sprintStamina: 0,
    killXp: 2,
    attack: null,
    // Wiki: 4 mejoberries in 0:49 at level 1, 10 at level 30; 6 of the other berries in 0:48.
    taming: tamingTable({ base: 30, perLevel: 1.8 }, [4, 10], { mejoberry: food(1, 12.3), amarberry: food(0.67, 8), azulberry: food(0.67, 8), tintoberry: food(0.67, 8) }),
    saddle: null,
    saddleEngram: null,
    seat: [0, 0.6, 0],
    carcass: { hits: 4, meat: 1, salvage: 0.6 },
    radius: 0.45,
  },
  craneback: {
    id: "craneback",
    label: "Craneback",
    temperament: "skittish",
    diet: "grazer",
    health: { base: 300, perLevel: 60 },
    stamina: { base: 300, perLevel: 30 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: 3000, perLevel: 300 },
    weight: { base: 200, perLevel: 4 },
    melee: { base: 10, perLevel: 0.5 },
    walk: 1.5,
    sprint: 5.55,
    sprintStamina: 20,
    killXp: 4,
    attack: { damage: 10, interval: 1.2, reach: 2.2 },
    // Wiki: 27 mejoberries in 2:42 at level 1, 63 at level 30; 41 of the other berries in 2:44.
    taming: tamingTable({ base: 240, perLevel: 14.4 }, [27, 63], { mejoberry: food(1, 6), amarberry: food(0.66, 4), azulberry: food(0.66, 4), tintoberry: food(0.66, 4) }),
    saddle: "craneback_rig",
    saddleEngram: { level: 5, points: 6, cost: { salvage: 20, fiber: 15, wood: 5 } },
    seat: [0, 1.55, -0.1],
    carcass: { hits: 14, meat: 2, salvage: 1.6 },
    radius: 1,
  },
  lodestone: {
    id: "lodestone",
    label: "Lodestone",
    temperament: "pack",
    diet: "scavenger",
    health: { base: 200, perLevel: 40 },
    stamina: { base: 150, perLevel: 15 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: 1200, perLevel: 120 },
    weight: { base: 140, perLevel: 2.8 },
    melee: { base: 15, perLevel: 0.75 },
    walk: 4.8,
    sprint: 9.94,
    tamedSprint: 11.04,
    sprintStamina: 6,
    killXp: 12,
    attack: { damage: 15, interval: 0.8, reach: 2.2 },
    // Wiki: 7 raw meat in 5:51 at level 1, 15 at level 30; 3 prime in 2:31; 13 cooked in 5:26.
    taming: tamingTable({ base: 180, perLevel: 10.8 }, [7, 15], { prime_biogel: food(2.33, 50, 0.02), biogel: food(1, 50), gel_ration: food(0.54, 25) }),
    saddle: "lodestone_rig",
    saddleEngram: { level: 18, points: 9, cost: { salvage: 110, fiber: 65, wood: 20 } },
    seat: [0, 1.25, -0.25],
    carcass: { hits: 10, meat: 2, salvage: 2 },
    radius: 0.8,
  },
};

/**
 * The rest of the Island's bestiary, one row each: ARK's temperament and diet, then health and its
 * per-level gain, stamina, torpor and its per-level gain, weight and melee from the wiki's base
 * creature statistics table; walk and sprint in metres per second, body radius, and the saddle
 * engram's level (null: no saddle). Where the table had no clean row (rootkit, fangsaw, arcwire,
 * tuxbot, snapjaw, siphon, choir, lampjaw, pylon, heatsink, springtoad, riptide,
 * railcrawler, stingvolt) and for every speed, the numbers approximate the wiki's.
 * Per-level stamina, weight and melee, food, kill XP, bite timing, taming foods, carcass and saddle
 * costs follow ARK's patterns scaled by body size rather than per-species wiki values.
 */
type Row = [
  label: string,
  diet: "grazer" | "scavenger",
  health: number,
  healthPerLevel: number,
  stamina: number,
  torpor: number,
  torporPerLevel: number,
  weight: number,
  melee: number,
  walk: number,
  sprint: number,
  radius: number,
  saddleLevel: number | null,
];

const ROWS: Readonly<Record<string, Row>> = {
  ripsaw: ["Ripsaw", "scavenger", 420, 84, 300, 350, 21, 300, 35, 2.5, 8.5, 1.4, 39],
  bulldozaur: ["Bulldozaur", "grazer", 375, 75, 150, 250, 15, 365, 32, 2, 4.6, 1.6, 16],
  platebacker: ["Platebacker", "grazer", 650, 130, 300, 500, 30, 500, 42, 1.6, 3.5, 2, 30],
  sirenhorn: ["Sirenhorn", "grazer", 200, 40, 450, 150, 9, 480, 12, 2.5, 7.9, 1.4, 18],
  antennelk: ["Antennelk", "grazer", 300, 60, 280, 175, 10.5, 220, 30, 2.6, 9, 1, 20],
  watchwing: ["Watchwing", "scavenger", 210, 42, 150, 120, 7.2, 120, 18, 1.7, 5, 0.9, 25],
  scrapper: ["Scrapper Rex", "scavenger", 1100, 220, 420, 1550, 93, 500, 62, 2.5, 6.5, 2.6, 57],
  sparkspitter: ["Sparkspitter", "scavenger", 130, 26, 100, 75, 4.5, 45, 10, 1.9, 4, 0.6, null],
  ramjack: ["Ramjack", "grazer", 175, 35, 150, 160, 9.6, 150, 10, 2.4, 6.5, 0.8, 20],
  frostbyte: ["Frostbyte", "scavenger", 330, 66, 260, 450, 27, 170, 33, 3, 9.5, 0.9, 29],
  hulkloader: ["Hulkloader", "grazer", 600, 120, 300, 500, 30, 400, 36, 1.5, 5, 1.6, 50],
  shrikebot: ["Shrikebot", "scavenger", 270, 54, 160, 300, 18, 120, 18, 4, 10, 0.8, 30],
  liftape: ["Liftape", "grazer", 640, 64, 300, 1100, 66, 220, 40, 1.8, 5, 1.3, 40],
  coilsheep: ["Coilsheep", "grazer", 100, 20, 100, 85, 5.1, 90, 5, 1.2, 3, 0.6, null],
  rootkit: ["Rootkit", "scavenger", 450, 90, 300, 400, 24, 200, 25, 2, 6, 0.8, null],
  ticklet: ["Ticklet", "scavenger", 35, 7, 100, 50, 3, 150, 7, 2, 4, 0.4, null],
  echo: ["Echo Mimic", "scavenger", 200, 40, 150, 180, 10.8, 140, 7, 2.4, 6, 0.5, null],
  thermite: ["Thermite Beetle", "grazer", 700, 140, 175, 420, 25.2, 250, 50, 1.4, 3.5, 1.6, 36],
  homer: ["Homer", "scavenger", 365, 73, 400, 600, 36, 400, 25, 1.5, 4, 1.2, 44],
  rollgrinder: ["Rollgrinder", "grazer", 850, 170, 300, 800, 48, 250, 32, 1.1, 2.5, 1.3, 30],
  clawmaul: ["Clawmaul", "scavenger", 630, 126, 250, 1000, 60, 380, 35, 2.5, 7.5, 1.8, 49],
  rhinodrill: ["Rhinodrill", "grazer", 500, 100, 120, 600, 36, 750, 40, 2, 8, 1.5, 35],
  timberjack: ["Timberjack", "grazer", 850, 170, 330, 550, 33, 500, 48, 1.8, 4, 2.2, 40],
  warhorn: ["Warhorn", "scavenger", 1100, 220, 420, 1550, 93, 500, 55, 2.5, 6.5, 2.2, 60],
  fangsaw: ["Fangsaw", "scavenger", 250, 50, 200, 380, 22.8, 250, 35, 2.8, 9.5, 0.9, 30],
  tuxbot: ["Tuxbot", "scavenger", 170, 34, 100, 100, 6, 100, 6, 1, 2.5, 0.5, null],
  smogrhino: ["Smogrhino", "grazer", 375, 75, 150, 250, 15, 365, 28, 2, 4.5, 1.5, 35],
  mirrorcat: ["Mirrorcat", "scavenger", 700, 140, 400, 700, 42, 400, 40, 2.5, 8, 1, 50],
  ironbear: ["Ironbear", "scavenger", 400, 80, 500, 1000, 60, 650, 50, 2.2, 8, 1.4, 45],
  coilcobra: ["Coilcobra", "scavenger", 170, 34, 150, 175, 10.5, 150, 30, 1.5, 4, 0.6, null],
  puckbot: ["Puckbot", "grazer", 90, 18, 100, 100, 6, 90, 6, 1.5, 4, 0.5, null],
  bumperbot: ["Bumperbot", "grazer", 375, 75, 300, 300, 18, 200, 32, 1.4, 3.5, 1, null],
  klepto: ["Klepto", "scavenger", 50, 10, 100, 25, 1.5, 25, 4, 2, 6, 0.3, null],
  highrise: ["Highrise", "grazer", 1026, 205.2, 300, 1300, 78, 850, 45, 1.5, 4, 3, 50],
  pistonmare: ["Pistonmare", "grazer", 240, 48, 560, 420, 25.2, 350, 9, 2.5, 12, 0.9, 25],
  zipstrider: ["Zipstrider", "grazer", 150, 30, 300, 420, 25.2, 270, 8, 3, 10, 0.9, 25],
  sawbeaver: ["Sawbeaver", "grazer", 450, 90, 180, 350, 21, 300, 28, 1.2, 3, 1, 25],
  hivedrone: ["Hive Drone", "scavenger", 150, 30, 100, 80, 4.8, 100, 10, 2, 5, 0.8, 25],
  heatsink: ["Heatsink", "scavenger", 650, 130, 300, 1000, 60, 300, 35, 1.2, 3, 1.2, 34],
  snapjaw: ["Snapjaw", "scavenger", 300, 60, 150, 300, 18, 200, 22, 1.8, 6, 0.9, 32],
  arcwire: ["Arcwire", "scavenger", 400, 80, 450, 400, 24, 400, 35, 1.7, 5, 1.3, 23],
  springtoad: ["Springtoad", "scavenger", 220, 44, 200, 150, 9, 200, 15, 1.5, 4, 0.7, 24],
  siphon: ["Siphon", "scavenger", 40, 8, 100, 10, 0.6, 50, 3, 0.8, 1.5, 0.3, null],
  choir: ["Choir Drone", "scavenger", 70, 14, 100, 50, 3, 30, 7, 2, 4, 0.4, null],
  lampjaw: ["Lampjaw", "scavenger", 190, 38, 300, 100, 6, 100, 6, 1, 2, 0.6, 21],
  riptide: ["Riptide", "scavenger", 780, 156, 280, 550, 33, 300, 25, 2.2, 6, 1.6, 44],
  railcrawler: ["Railcrawler", "scavenger", 750, 150, 150, 300, 18, 300, 20, 1.5, 4, 1, 50],
  stingvolt: ["Stingvolt", "scavenger", 280, 56, 200, 300, 18, 150, 15, 2, 5, 0.8, 25],
  wallcrawler: ["Wallcrawler", "scavenger", 480, 96, 400, 700, 42, 400, 10, 2, 6, 1.2, 45],
  hoover: ["Hoover Leviathan", "grazer", 2070, 414, 240, 2000, 120, 1600, 60, 1.2, 2.5, 4, 55],
  pylon: ["Pylon Walker", "grazer", 1700, 340, 300, 2000, 120, 1200, 10, 1.2, 2.5, 3, 40],
  switchback: ["Switchback", "grazer", 250, 50, 200, 210, 12.6, 375, 25, 2, 7, 1.2, 35],
};

const round = (value: number, step = 1) => Math.round(value / step) * step;

/** A table row as a full species: ARK's per-level patterns and size-scaled tables fill what the row leaves out. */
function fromRow(id: string, row: Row): Omit<SpeciesDef, "firmware"> {
  const [label, diet, health, healthPerLevel, stamina, torpor, torporPerLevel, weight, melee, walk, sprint, radius, saddleLevel] = row;
  // Meals scale with the torpor a body carries, as ARK's do: a lodestone (180 torpor) eats 7 raw meat at level 1.
  // Scavengers count in raw meat, grazers in mejoberries (three to a meat); a meal digests in 50 s.
  const meals = Math.max(2, round(torpor / 26));
  const need: readonly [number, number] = diet === "scavenger" ? [meals, meals * 2] : [meals * 3, meals * 7];
  const foods: Record<string, readonly VitalDose[]> =
    diet === "scavenger"
      ? { prime_biogel: food(2.5, 50, 0.02), biogel: food(1, 50), gel_ration: food(0.5, 50) }
      : { mejoberry: food(1, 16.7), amarberry: food(0.75, 12.5), azulberry: food(0.75, 12.5), tintoberry: food(0.75, 12.5) };
  const big = radius >= 2;
  return {
    id,
    label,
    temperament: botProfile(id)?.temperament ?? "passive",
    diet,
    health: { base: health, perLevel: healthPerLevel },
    stamina: { base: stamina, perLevel: stamina * 0.1 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: round(1200 + weight * 4, 50), perLevel: round(120 + weight * 0.4, 5) },
    weight: { base: weight, perLevel: weight * 0.02 },
    melee: { base: melee, perLevel: melee * 0.05 },
    walk,
    sprint,
    sprintStamina: big ? 15 : 8,
    killXp: Math.max(2, round(health / 20)),
    attack: { damage: melee, interval: big ? 1.4 : 1, reach: round(1.4 + radius * 0.6, 0.1) },
    taming: { ...tamingTable({ base: torpor, perLevel: torporPerLevel }, need, foods), awake: AWAKE_TAMES.has(id) },
    saddle: saddleLevel === null ? null : `${id}_rig`,
    saddleEngram:
      saddleLevel === null
        ? null
        : { level: saddleLevel, points: Math.min(40, 6 + round(saddleLevel / 3)), cost: { salvage: round(20 + weight * 0.4, 5), fiber: round(15 + weight * 0.2, 5), wood: round(5 + weight * 0.05) } },
    seat: [0, round(radius * 1.2 + 0.4, 0.05), -round(radius * 0.15, 0.05)],
    carcass: { hits: Math.max(3, round(health / 30)), meat: Math.max(1, round(weight / 120)), salvage: Math.max(0.5, round(weight / 150, 0.5)) },
    radius,
  };
}

/**
 * The Hivemind Prime, one species per difficulty as ARK keeps them: the wiki's base health and its
 * per-level gain, the lighter of her two melee attacks, torpor 100000 (+6000 a level) that nothing
 * brings down, and 32 base kill XP. Her speeds, bite timing, size and carcass are approximate.
 */
function hivemind(tier: "gamma" | "beta" | "alpha", health: number, healthPerLevel: number, melee: number): SpeciesDef {
  const label = `${tier[0]!.toUpperCase()}${tier.slice(1)} Hivemind`;
  return {
    id: `hivemind_${tier}`,
    label,
    temperament: "aggressive",
    diet: "scavenger",
    health: { base: health, perLevel: healthPerLevel },
    stamina: { base: 1000, perLevel: 100 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: 10000, perLevel: 1000 },
    weight: { base: 1000, perLevel: 20 },
    melee: { base: melee, perLevel: melee * 0.05 },
    walk: 2,
    sprint: 4.5,
    sprintStamina: 0,
    killXp: 32,
    attack: { damage: melee, interval: 2, reach: 3 },
    taming: tamingTable({ base: 100000, perLevel: 6000 }, [1, 1], {}),
    saddle: null,
    saddleEngram: null,
    seat: [0, 0, 0],
    carcass: { hits: 60, meat: 8, salvage: 6 },
    radius: 7,
    torporImmune: true,
    firmware: null,
  };
}

/**
 * The Root Server: a buried rack of servers that never moves, pulses a shock at what comes close and
 * cannot be drained. Its health is tuned for a technician with metal tools and a mount (approximate).
 */
function rootServer(): SpeciesDef {
  return {
    id: "root_server",
    label: "The Root Server",
    temperament: "territorial",
    diet: "scavenger",
    health: { base: 18000, perLevel: 0 },
    stamina: { base: 1000, perLevel: 0 },
    oxygen: { base: 150, perLevel: 0 },
    food: { base: 10000, perLevel: 0 },
    weight: { base: 2000, perLevel: 0 },
    melee: { base: 45, perLevel: 0 },
    walk: 0,
    sprint: 0,
    sprintStamina: 0,
    killXp: 0,
    attack: { damage: 45, interval: 2.5, reach: 5 },
    taming: tamingTable({ base: 100000, perLevel: 0 }, [1, 1], {}),
    saddle: null,
    saddleEngram: null,
    seat: [0, 0, 0],
    carcass: { hits: 40, meat: 2, salvage: 12 },
    radius: 3,
    torporImmune: true,
    firmware: null,
  };
}

/** Every species on the Island: the detailed three, the table's rest, and the Hivemind. */
/** A tameable species with ARK's firmware in its foods: its tier and up first, the tiers below last. */
function withBait(def: Omit<SpeciesDef, "firmware">): SpeciesDef {
  const tier = preferredFirmware(def.id, def.taming.torpor.kind === "piecewise" ? (def.taming.torpor.points[0]?.[1] ?? 0) : 0);
  const baseline = def.diet === "scavenger" ? "biogel" : "mejoberry";
  return { ...def, firmware: tier, taming: { ...def.taming, foods: withFirmware(def.taming.foods, baseline, tier) } };
}

export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  ...Object.fromEntries(Object.values(DETAILED).map((def) => [def.id, withBait(def)])),
  ...Object.fromEntries(Object.entries(ROWS).map(([id, row]) => [id, withBait(fromRow(id, row))])),
  hivemind_gamma: hivemind("gamma", 324000, 64800, 180),
  hivemind_beta: hivemind("beta", 648000, 97200, 320),
  hivemind_alpha: hivemind("alpha", 972000, 243000, 540),
  root_server: rootServer(),
};

/** What a tame puts its level-up points into. */
export type TameStat = "health" | "stamina" | "oxygen" | "food" | "weight" | "melee" | "speed";

/** The stats a creature's wild levels go into and a baby inherits (ARK's, without torpor and speed). */
export const WILD_STATS = ["health", "stamina", "oxygen", "food", "weight", "melee"] as const satisfies readonly TameStat[];
export type WildStat = (typeof WILD_STATS)[number];

/**
 * ARK's tamed level-ups (wiki, the same for the Island's common species): each point scales the stat
 * by a fraction of its value when tamed. Melee and speed are percentages, so they start at 100%.
 */
export const TAME_STATS: readonly { id: TameStat; label: string; perPoint: number; unit: "" | "%" }[] = [
  { id: "health", label: "Health", perPoint: 0.054, unit: "" },
  { id: "stamina", label: "Stamina", perPoint: 0.1, unit: "" },
  { id: "oxygen", label: "Oxygen", perPoint: 0.1, unit: "" },
  { id: "food", label: "Food", perPoint: 0.1, unit: "" },
  { id: "weight", label: "Weight", perPoint: 0.04, unit: "" },
  { id: "melee", label: "Melee Damage", perPoint: 0.017, unit: "%" },
  { id: "speed", label: "Movement Speed", perPoint: 0.01, unit: "%" },
];

/**
 * ARK's creature levels after taming: up to 88 more, the n-th costing 10 x n XP (10, 20, 30...),
 * from kills and a passive 0.66 XP a minute.
 */
export const TAME_LEVELS = { max: 88, xpStep: 10, passivePerSecond: 0.66 / 60 } as const;

/** XP a kill gives: ARK's base kill XP grown 10% a level. */
export function killXp(def: SpeciesDef, level: number): number {
  return def.killXp * (1 + 0.1 * (level - 1));
}

export function speciesDef(id: string): SpeciesDef | null {
  return SPECIES[id] ?? null;
}

/** A stat at a level: ARK's base plus its per-level increase for every level past the first. */
export function statAt(line: StatLine, level: number): number {
  return line.base + line.perLevel * (level - 1);
}

/** A species' temperament as the engine's temperament config. Reach comes from the body. */
export function temperamentOf(def: SpeciesDef): TemperamentConfig {
  return temperamentConfig(def.temperament);
}
