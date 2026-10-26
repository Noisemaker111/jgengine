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
  food: StatLine;
  weight: StatLine;
  melee: StatLine;
  /** Walk and sprint in metres per second (ARK units / 100). */
  walk: number;
  sprint: number;
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
    food: { base: 450, perLevel: 45 },
    weight: { base: 50, perLevel: 1 },
    melee: { base: 5, perLevel: 0.25 },
    walk: 0.65,
    sprint: 1.37,
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
    stamina: { base: 150, perLevel: 15 },
    food: { base: 1500, perLevel: 150 },
    weight: { base: 300, perLevel: 6 },
    melee: { base: 8, perLevel: 0.4 },
    walk: 1.6,
    sprint: 4.4,
    attack: { damage: 8, interval: 1.2, reach: 2.2 },
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
    food: { base: 1200, perLevel: 120 },
    weight: { base: 140, perLevel: 2.8 },
    melee: { base: 15, perLevel: 0.75 },
    walk: 4.8,
    sprint: 9.94,
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

export function speciesDef(id: string): SpeciesDef | null {
  return SPECIES[id] ?? null;
}

/** A stat at a level: ARK's base plus its per-level increase for every level past the first. */
export function statAt(line: StatLine, level: number): number {
  return line.base + line.perLevel * (level - 1);
}

/** ARK temperaments as tunings of the engine's three: oblivious and docile only answer a hit. */
export function temperamentOf(def: SpeciesDef): TemperamentConfig {
  const reach = def.attack?.reach ?? 1.8;
  switch (def.temperament) {
    case "oblivious":
      return { kind: "passive", fleeRange: 0 };
    case "skittish":
      return { kind: "passive", fleeRange: 12 };
    case "docile":
      return { kind: "territorial", territoryRadius: 0, attackRange: reach, breakAt: 0 };
    case "territorial":
      return { kind: "territorial", territoryRadius: 10, attackRange: reach, breakAt: 0 };
    case "aggressive":
      return { kind: "predator", attackRange: reach, breakAt: 0 };
  }
}
