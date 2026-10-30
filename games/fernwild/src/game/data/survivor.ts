import type { Curve } from "@jgengine/core/progression/leveling";
import type { ComfortConfig } from "@jgengine/core/survival/bodyTemperature";
import type { VitalDef } from "@jgengine/core/survival/vitals";

/**
 * ARK's human survivor. Base values and per-point gains are ARK's (ark.wiki.gg, Human). Drain and
 * regen rates the wiki does not publish are our measurements of the feel and are marked "approx".
 */
export const SURVIVOR = {
  health: 100,
  stamina: 100,
  oxygen: 100,
  food: 100,
  water: 100,
  weight: 100,
  torpor: 200,
  /** m/s walking; ARK runs about 1.8x. */
  walkSpeed: 4.9,
  runMultiplier: 1.8,
  /** At or under this much health the survivor is injured and slowed. */
  injuredAt: 30,
  injuredSpeed: 0.5,
  /** Stamina per second while running (approx). */
  runStamina: 5,
  jumpStamina: 5,
  /** XP per gathering swing that took something (approx). */
  gatherXp: 0.4,
  /** XP for a tame (ARK scales it by the creature; flat for now). A kill gives the creature's kill XP. */
  tameXp: 20,
  /** Water per drink from a lake or the sea shallows (approx). */
  drink: 10,
} as const;

/** One levelable stat and what each point adds. */
export interface LevelStat {
  id: "health" | "stamina" | "oxygen" | "food" | "water" | "weight" | "melee" | "speed" | "fortitude" | "crafting";
  label: string;
  /** Added per point (absolute for pools, percentage points for melee/speed/crafting, fortitude points). */
  per: number;
  unit: "" | "%";
}

export const LEVEL_STATS: readonly LevelStat[] = [
  { id: "health", label: "Health", per: 10, unit: "" },
  { id: "stamina", label: "Stamina", per: 10, unit: "" },
  { id: "oxygen", label: "Oxygen", per: 20, unit: "" },
  { id: "food", label: "Food", per: 10, unit: "" },
  { id: "water", label: "Water", per: 10, unit: "" },
  { id: "weight", label: "Weight", per: 10, unit: "" },
  { id: "melee", label: "Melee Damage", per: 5, unit: "%" },
  { id: "speed", label: "Movement Speed", per: 1.5, unit: "%" },
  { id: "fortitude", label: "Fortitude", per: 2, unit: "" },
  { id: "crafting", label: "Crafting Skill", per: 10, unit: "%" },
];

/** The vitals ARK's HUD shows, with ARK's starvation and dehydration (about 1 HP per 5 s, torpor creeping up). */
export function survivorVitals(): VitalDef[] {
  return [
    { id: "health", max: SURVIVOR.health, rate: 0.35, regenCost: [{ vital: "food", perPoint: 0.25 }] },
    { id: "stamina", max: SURVIVOR.stamina, rate: 8, regenDelay: 1.2 },
    { id: "oxygen", max: SURVIVOR.oxygen, rate: 10, regenDelay: 1 },
    { id: "food", max: SURVIVOR.food, rate: -100 / 3000, whenEmpty: [{ vital: "health", rate: -0.2 }, { vital: "torpor", rate: 0.5 }], flags: [{ id: "hungry", when: "atMost", on: 0.1, off: 0.12 }, { id: "starving", when: "atMost", on: 0 , off: 0.01 }] },
    { id: "water", max: SURVIVOR.water, rate: -100 / 2400, whenEmpty: [{ vital: "health", rate: -0.2 }, { vital: "torpor", rate: 0.5 }], flags: [{ id: "thirsty", when: "atMost", on: 0.1, off: 0.12 }, { id: "dehydrated", when: "atMost", on: 0, off: 0.01 }] },
    { id: "torpor", max: SURVIVOR.torpor, start: 0, rate: -2, flags: [{ id: "unconscious", when: "atLeast", on: 1, off: 0.5 }] },
  ];
}

/** Hypothermia burns food, heat drinks water; fortitude widens the band (ARK). Thresholds approx. */
export const COMFORT: ComfortConfig = {
  comfortC: [12, 32],
  bands: {
    comfortable: "comfortable",
    cold: [{ id: "cold", at: 0 }, { id: "freezing", at: 14 }],
    hot: [{ id: "hot", at: 0 }, { id: "scorching", at: 14 }],
  },
  drainPerDegree: 0.08,
  coldDrains: "food",
  heatDrains: "water",
  damageAfterC: 14,
  damagePerDegree: 0.2,
  fortitudeC: 0.5,
};

/**
 * Total XP to reach each level (ARK, multiplayer). Exact to level 30; later anchors are ARK's and
 * the curve interpolates between them.
 */
export const XP_TO_LEVEL: Curve = {
  kind: "piecewise",
  points: [
    [1, 0], [2, 5], [3, 20], [4, 40], [5, 70], [6, 120], [7, 190], [8, 270], [9, 360], [10, 450],
    [11, 550], [12, 660], [13, 780], [14, 910], [15, 1050], [16, 1200], [17, 1360], [18, 1530], [19, 1710], [20, 1900],
    [21, 2100], [22, 2310], [23, 2530], [24, 2760], [25, 3000], [26, 3250], [27, 3510], [28, 3780], [29, 4060], [30, 4350],
    [40, 7800], [50, 12250], [60, 17700], [73, 73000], [80, 184500], [90, 566358], [100, 1798538], [105, 4098538],
  ],
  round: "floor",
};

export const MAX_LEVEL = 105;

/** Engram points granted on reaching each level (ARK). */
export function engramPointsFor(level: number): number {
  if (level < 2) return 0;
  if (level < 10) return 8;
  if (level < 20) return 12;
  if (level < 30) return 16;
  if (level < 40) return 20;
  if (level < 50) return 24;
  if (level < 60) return 28;
  if (level < 73) return 40;
  if (level < 87) return 50;
  if (level < 99) return 60;
  return 70;
}

export const ENGRAM_POINTS: Curve = {
  kind: "steps",
  values: Array.from({ length: MAX_LEVEL + 1 }, (_, level) => engramPointsFor(level)),
};
