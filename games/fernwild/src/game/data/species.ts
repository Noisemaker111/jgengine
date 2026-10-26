import type { TemperamentConfig } from "@jgengine/core/ai/temperament";
import type { KnockoutTamingConfig, TamingFood } from "@jgengine/core/taming/knockoutTaming";

/** How a wild creature treats the survivor, by ARK's temperament names. */
export type Temperament = "oblivious" | "skittish" | "docile" | "territorial" | "aggressive";

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
  diet: "herbivore" | "carnivore";
  health: StatLine;
  stamina: StatLine;
  oxygen: StatLine;
  food: StatLine;
  weight: StatLine;
  melee: StatLine;
  /** Walk and sprint in metres per second (ARK units / 100). */
  walk: number;
  sprint: number;
  /** Stamina a second while ridden at a sprint (ARK's movement table). */
  sprintStamina: number;
  /** ARK's base kill XP: a kill gives this x (1 + 0.1 x (level - 1)). */
  killXp: number;
  /** Bite: damage at level 1, seconds between bites, reach in metres. Null when it never fights. */
  attack: { damage: number; interval: number; reach: number } | null;
  taming: KnockoutTamingConfig;
  /** Saddle item that makes it rideable; null when it cannot be ridden. */
  saddle: string | null;
  /** Where the rider sits: right, up, forward in metres. */
  seat: readonly [number, number, number];
  /** Its body when harvested: hits it lasts and what each hit gives before the tool's bias. */
  carcass: { hits: number; meat: number; hide: number };
  /** Body radius in metres, for hits and prompts. */
  radius: number;
}

const food = (countAt1: number, secondsAt1: number, countAt30: number, secondsAt30: number, ineffectiveness?: number): TamingFood => ({
  countAt1,
  secondsAt1,
  countAt30,
  secondsAt30,
  ...(ineffectiveness === undefined ? {} : { ineffectiveness }),
});

/** ARK's knocked-out torpor drain: 0.3 a second at level 1, 0.5 at level 30. */
const DRAIN = { at1: 0.3, at30: 0.5 };

/** Wild creatures roll levels 1-30 like ARK's Island at difficulty 1. */
export const WILD_LEVELS = { min: 1, max: 30 } as const;

/**
 * Of a club's torpor, how much lands on a creature. ARK's wiki counts 18 club hits for a level-1
 * raptor (180 torpor), 3 for a dodo (30), 24 for a phiomia (240): ten per 20-torpor club hit.
 */
export const TORPOR_TAKEN = 0.5;

/** ARK wiki numbers (ark.wiki.gg, ARK: Survival Evolved). Speeds are units/s ÷ 100. */
export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  dodo: {
    id: "dodo",
    label: "Dodo",
    temperament: "oblivious",
    diet: "herbivore",
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
    taming: {
      torpor: { base: 30, perLevel: 1.8 },
      torporDrain: DRAIN,
      foods: { mejoberry: food(4, 49, 10, 121), amarberry: food(6, 48, 15, 120), azulberry: food(6, 48, 15, 120), tintoberry: food(6, 48, 15, 120) },
    },
    saddle: null,
    seat: [0, 0.6, 0],
    carcass: { hits: 4, meat: 1, hide: 0.6 },
    radius: 0.45,
  },
  phiomia: {
    id: "phiomia",
    label: "Phiomia",
    temperament: "skittish",
    diet: "herbivore",
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
    taming: {
      torpor: { base: 240, perLevel: 14.4 },
      torporDrain: DRAIN,
      foods: { mejoberry: food(27, 162, 63, 378), amarberry: food(41, 164, 95, 380), azulberry: food(41, 164, 95, 380), tintoberry: food(41, 164, 95, 380) },
    },
    saddle: "phiomia_saddle",
    seat: [0, 1.55, -0.1],
    carcass: { hits: 14, meat: 2, hide: 1.6 },
    radius: 1,
  },
  raptor: {
    id: "raptor",
    label: "Raptor",
    temperament: "aggressive",
    diet: "carnivore",
    health: { base: 200, perLevel: 40 },
    stamina: { base: 150, perLevel: 15 },
    oxygen: { base: 150, perLevel: 15 },
    food: { base: 1200, perLevel: 120 },
    weight: { base: 140, perLevel: 2.8 },
    melee: { base: 15, perLevel: 0.75 },
    walk: 4.8,
    sprint: 9.94,
    sprintStamina: 6,
    killXp: 12,
    attack: { damage: 15, interval: 0.8, reach: 2.2 },
    taming: {
      torpor: { base: 180, perLevel: 10.8 },
      torporDrain: DRAIN,
      foods: { raw_prime_meat: food(3, 151, 5, 251, 0.02), raw_meat: food(7, 351, 15, 751), cooked_meat: food(13, 326, 30, 751) },
    },
    saddle: "raptor_saddle",
    seat: [0, 1.25, -0.25],
    carcass: { hits: 10, meat: 2, hide: 2 },
    radius: 0.8,
  },
};

/** What a tame puts its level-up points into. */
export type TameStat = "health" | "stamina" | "oxygen" | "food" | "weight" | "melee" | "speed";

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

/** ARK temperaments as tunings of the engine's three: oblivious and docile only answer a hit. Reach comes from the body. */
export function temperamentOf(def: SpeciesDef): TemperamentConfig {
  switch (def.temperament) {
    case "oblivious":
      return { kind: "passive", fleeRange: 0 };
    case "skittish":
      return { kind: "passive", fleeRange: 12 };
    case "docile":
      return { kind: "territorial", territoryRadius: 0, breakAt: 0 };
    case "territorial":
      return { kind: "territorial", territoryRadius: 10, breakAt: 0 };
    case "aggressive":
      return { kind: "predator", breakAt: 0 };
  }
}
