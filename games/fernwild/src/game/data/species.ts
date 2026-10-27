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
  /** Sprint once tamed, when ARK lists a different one (a tamed raptor outruns a wild one). */
  tamedSprint?: number;
  /** Stamina a second while ridden at a sprint (ARK's movement table). */
  sprintStamina: number;
  /** ARK's base kill XP: a kill gives this x (1 + 0.1 x (level - 1)). */
  killXp: number;
  /** Bite: damage at level 1, seconds between bites, reach in metres. Null when it never fights. */
  attack: { damage: number; interval: number; reach: number } | null;
  taming: KnockoutTamingConfig;
  /** Saddle item that makes it rideable; null when it cannot be ridden. */
  saddle: string | null;
  /** The saddle's engram: level it opens at, engram points and what it costs. Null when it has no saddle. */
  saddleEngram: { level: number; points: number; cost: Record<string, number> } | null;
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

/** The three species with their full wiki taming tables. ARK wiki numbers (ark.wiki.gg). Speeds are units/s ÷ 100. */
const DETAILED: Readonly<Record<string, SpeciesDef>> = {
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
    saddleEngram: null,
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
    saddleEngram: { level: 5, points: 6, cost: { hide: 20, fiber: 15, wood: 5 } },
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
    tamedSprint: 11.04,
    sprintStamina: 6,
    killXp: 12,
    attack: { damage: 15, interval: 0.8, reach: 2.2 },
    taming: {
      torpor: { base: 180, perLevel: 10.8 },
      torporDrain: DRAIN,
      foods: { raw_prime_meat: food(3, 151, 5, 251, 0.02), raw_meat: food(7, 351, 15, 751), cooked_meat: food(13, 326, 30, 751) },
    },
    saddle: "raptor_saddle",
    saddleEngram: { level: 18, points: 9, cost: { hide: 110, fiber: 65, wood: 20 } },
    seat: [0, 1.25, -0.25],
    carcass: { hits: 10, meat: 2, hide: 2 },
    radius: 0.8,
  },
};

/**
 * The rest of the Island's bestiary, one row each: ARK's temperament and diet, then health and its
 * per-level gain, stamina, torpor and its per-level gain, weight and melee from the wiki's base
 * creature statistics table; walk and sprint in metres per second, body radius, and the saddle
 * engram's level (null: no saddle). Where the table had no clean row (purlovia, sabertooth, sarco,
 * kairuku, kaprosuchus, leech, meganeura, diplocaulus, diplodocus, dimetrodon, beelzebufo, baryonyx,
 * arthropleura, pulmonoscorpius) and for every speed, the numbers approximate the wiki's.
 * Per-level stamina, weight and melee, food, kill XP, bite timing, taming foods, carcass and saddle
 * costs follow ARK's patterns scaled by body size rather than per-species wiki values.
 */
type Row = [
  label: string,
  temperament: Temperament,
  diet: "herbivore" | "carnivore",
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
  carnotaurus: ["Carnotaurus", "aggressive", "carnivore", 420, 84, 300, 350, 21, 300, 35, 2.5, 8.5, 1.4, 39],
  triceratops: ["Triceratops", "territorial", "herbivore", 375, 75, 150, 250, 15, 365, 32, 2, 4.6, 1.6, 16],
  stegosaurus: ["Stegosaurus", "territorial", "herbivore", 650, 130, 300, 500, 30, 500, 42, 1.6, 3.5, 2, 30],
  parasaur: ["Parasaur", "skittish", "herbivore", 200, 40, 450, 150, 9, 480, 12, 2.5, 7.9, 1.4, 18],
  megaloceros: ["Megaloceros", "skittish", "herbivore", 300, 60, 280, 175, 10.5, 220, 30, 2.6, 9, 1, 20],
  pteranodon: ["Pteranodon", "skittish", "carnivore", 210, 42, 150, 120, 7.2, 120, 18, 1.7, 5, 0.9, 25],
  rex: ["Rex", "aggressive", "carnivore", 1100, 220, 420, 1550, 93, 500, 62, 2.5, 6.5, 2.6, 57],
  dilophosaur: ["Dilophosaur", "aggressive", "carnivore", 130, 26, 100, 75, 4.5, 45, 10, 1.9, 4, 0.6, null],
  pachy: ["Pachy", "territorial", "herbivore", 175, 35, 150, 160, 9.6, 150, 10, 2.4, 6.5, 0.8, 20],
  direwolf: ["Direwolf", "aggressive", "carnivore", 330, 66, 260, 450, 27, 170, 33, 3, 9.5, 0.9, 29],
  chalicotherium: ["Chalicotherium", "territorial", "herbivore", 600, 120, 300, 500, 30, 400, 36, 1.5, 5, 1.6, 50],
  terror_bird: ["Terror Bird", "aggressive", "carnivore", 270, 54, 160, 300, 18, 120, 18, 4, 10, 0.8, 30],
  gigantopithecus: ["Gigantopithecus", "docile", "herbivore", 640, 64, 300, 1100, 66, 220, 40, 1.8, 5, 1.3, 40],
  ovis: ["Ovis", "oblivious", "herbivore", 100, 20, 100, 85, 5.1, 90, 5, 1.2, 3, 0.6, null],
  purlovia: ["Purlovia", "aggressive", "carnivore", 450, 90, 300, 400, 24, 200, 25, 2, 6, 0.8, null],
  titanomyrma: ["Titanomyrma", "aggressive", "carnivore", 35, 7, 100, 50, 3, 150, 7, 2, 4, 0.4, null],
  troodon: ["Troodon", "aggressive", "carnivore", 200, 40, 150, 180, 10.8, 140, 7, 2.4, 6, 0.5, null],
  ankylosaurus: ["Ankylosaurus", "territorial", "herbivore", 700, 140, 175, 420, 25.2, 250, 50, 1.4, 3.5, 1.6, 36],
  argentavis: ["Argentavis", "aggressive", "carnivore", 365, 73, 400, 600, 36, 400, 25, 1.5, 4, 1.2, 44],
  doedicurus: ["Doedicurus", "docile", "herbivore", 850, 170, 300, 800, 48, 250, 32, 1.1, 2.5, 1.3, 30],
  allosaurus: ["Allosaurus", "aggressive", "carnivore", 630, 126, 250, 1000, 60, 380, 35, 2.5, 7.5, 1.8, 49],
  woolly_rhino: ["Woolly Rhinoceros", "territorial", "herbivore", 500, 100, 120, 600, 36, 750, 40, 2, 8, 1.5, 35],
  mammoth: ["Mammoth", "territorial", "herbivore", 850, 170, 330, 550, 33, 500, 48, 1.8, 4, 2.2, 40],
  yutyrannus: ["Yutyrannus", "aggressive", "carnivore", 1100, 220, 420, 1550, 93, 500, 55, 2.5, 6.5, 2.2, 60],
  sabertooth: ["Sabertooth", "aggressive", "carnivore", 250, 50, 200, 380, 22.8, 250, 35, 2.8, 9.5, 0.9, 30],
  kairuku: ["Kairuku", "oblivious", "carnivore", 170, 34, 100, 100, 6, 100, 6, 1, 2.5, 0.5, null],
  pachyrhinosaurus: ["Pachyrhinosaurus", "territorial", "herbivore", 375, 75, 150, 250, 15, 365, 28, 2, 4.5, 1.5, 35],
  thylacoleo: ["Thylacoleo", "aggressive", "carnivore", 700, 140, 400, 700, 42, 400, 40, 2.5, 8, 1, 50],
  direbear: ["Dire Bear", "aggressive", "carnivore", 400, 80, 500, 1000, 60, 650, 50, 2.2, 8, 1.4, 45],
  titanoboa: ["Titanoboa", "aggressive", "carnivore", 170, 34, 150, 175, 10.5, 150, 30, 1.5, 4, 0.6, null],
  lystrosaurus: ["Lystrosaurus", "oblivious", "herbivore", 90, 18, 100, 100, 6, 90, 6, 1.5, 4, 0.5, null],
  moschops: ["Moschops", "docile", "herbivore", 375, 75, 300, 300, 18, 200, 32, 1.4, 3.5, 1, null],
  compy: ["Compy", "aggressive", "carnivore", 50, 10, 100, 25, 1.5, 25, 4, 2, 6, 0.3, null],
  paraceratherium: ["Paraceratherium", "docile", "herbivore", 1026, 205.2, 300, 1300, 78, 850, 45, 1.5, 4, 3, 50],
  equus: ["Equus", "skittish", "herbivore", 240, 48, 560, 420, 25.2, 350, 9, 2.5, 12, 0.9, 25],
  gallimimus: ["Gallimimus", "skittish", "herbivore", 150, 30, 300, 420, 25.2, 270, 8, 3, 10, 0.9, 25],
  castoroides: ["Castoroides", "docile", "herbivore", 450, 90, 180, 350, 21, 300, 28, 1.2, 3, 1, 25],
  araneo: ["Araneo", "aggressive", "carnivore", 150, 30, 100, 80, 4.8, 100, 10, 2, 5, 0.8, 25],
  dimetrodon: ["Dimetrodon", "territorial", "carnivore", 650, 130, 300, 1000, 60, 300, 35, 1.2, 3, 1.2, 34],
  kaprosuchus: ["Kaprosuchus", "aggressive", "carnivore", 300, 60, 150, 300, 18, 200, 22, 1.8, 6, 0.9, 32],
  sarco: ["Sarco", "aggressive", "carnivore", 400, 80, 450, 400, 24, 400, 35, 1.7, 5, 1.3, 23],
  beelzebufo: ["Beelzebufo", "skittish", "carnivore", 220, 44, 200, 150, 9, 200, 15, 1.5, 4, 0.7, 24],
  leech: ["Leech", "aggressive", "carnivore", 40, 8, 100, 10, 0.6, 50, 3, 0.8, 1.5, 0.3, null],
  meganeura: ["Meganeura", "aggressive", "carnivore", 70, 14, 100, 50, 3, 30, 7, 2, 4, 0.4, null],
  diplocaulus: ["Diplocaulus", "skittish", "carnivore", 190, 38, 300, 100, 6, 100, 6, 1, 2, 0.6, 21],
  baryonyx: ["Baryonyx", "aggressive", "carnivore", 780, 156, 280, 550, 33, 300, 25, 2.2, 6, 1.6, 44],
  arthropleura: ["Arthropleura", "aggressive", "carnivore", 750, 150, 150, 300, 18, 300, 20, 1.5, 4, 1, 50],
  pulmonoscorpius: ["Pulmonoscorpius", "aggressive", "carnivore", 280, 56, 200, 300, 18, 150, 15, 2, 5, 0.8, 25],
  megalania: ["Megalania", "aggressive", "carnivore", 480, 96, 400, 700, 42, 400, 10, 2, 6, 1.2, 45],
  brontosaurus: ["Brontosaurus", "docile", "herbivore", 2070, 414, 240, 2000, 120, 1600, 60, 1.2, 2.5, 4, 55],
  diplodocus: ["Diplodocus", "oblivious", "herbivore", 1700, 340, 300, 2000, 120, 1200, 10, 1.2, 2.5, 3, 40],
  iguanodon: ["Iguanodon", "skittish", "herbivore", 250, 50, 200, 210, 12.6, 375, 25, 2, 7, 1.2, 35],
};

const round = (value: number, step = 1) => Math.round(value / step) * step;

/** A table row as a full species: ARK's per-level patterns and size-scaled tables fill what the row leaves out. */
function fromRow(id: string, row: Row): SpeciesDef {
  const [label, temperament, diet, health, healthPerLevel, stamina, torpor, torporPerLevel, weight, melee, walk, sprint, radius, saddleLevel] = row;
  // Meals scale with the torpor a body carries, as ARK's do: a raptor (180 torpor) eats 7 raw meat at level 1.
  const meals = Math.max(2, round(torpor / 26));
  const seconds = (count: number) => round(count * 50);
  const foods: Record<string, TamingFood> =
    diet === "carnivore"
      ? {
          raw_prime_meat: food(Math.max(1, round(meals * 0.4)), seconds(meals * 0.4), Math.max(2, round(meals * 0.75)), seconds(meals * 0.75), 0.02),
          raw_meat: food(meals, seconds(meals), meals * 2, seconds(meals * 2)),
          cooked_meat: food(meals * 2, seconds(meals * 2), meals * 4, seconds(meals * 4)),
        }
      : {
          mejoberry: food(meals * 3, seconds(meals), meals * 7, seconds(meals * 2.3)),
          amarberry: food(meals * 4, seconds(meals), meals * 10, seconds(meals * 2.3)),
          azulberry: food(meals * 4, seconds(meals), meals * 10, seconds(meals * 2.3)),
          tintoberry: food(meals * 4, seconds(meals), meals * 10, seconds(meals * 2.3)),
        };
  const big = radius >= 2;
  return {
    id,
    label,
    temperament,
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
    taming: { torpor: { base: torpor, perLevel: torporPerLevel }, torporDrain: DRAIN, foods },
    saddle: saddleLevel === null ? null : `${id}_saddle`,
    saddleEngram:
      saddleLevel === null
        ? null
        : { level: saddleLevel, points: Math.min(40, 6 + round(saddleLevel / 3)), cost: { hide: round(20 + weight * 0.4, 5), fiber: round(15 + weight * 0.2, 5), wood: round(5 + weight * 0.05) } },
    seat: [0, round(radius * 1.2 + 0.4, 0.05), -round(radius * 0.15, 0.05)],
    carcass: { hits: Math.max(3, round(health / 30)), meat: Math.max(1, round(weight / 120)), hide: Math.max(0.5, round(weight / 150, 0.5)) },
    radius,
  };
}

/** Every species on the Island: the detailed three and the table's rest. */
export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  ...DETAILED,
  ...Object.fromEntries(Object.entries(ROWS).map(([id, row]) => [id, fromRow(id, row)])),
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
