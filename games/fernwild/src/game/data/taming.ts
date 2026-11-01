import type { Curve } from "@jgengine/core/progression/leveling";
import type { FeedingDose, FeedingFood, SubdualFeedingConfig } from "../../engine-local/subdual/subdualFeeding";

/** The levels ARK's taming tables are written at: a wild creature's first level and its last. */
const LOW = 1;
const HIGH = 30;

/** A table value: `low` at level 1, `high` at level 30, straight lines between. */
function grows(low: number, high: number): Curve {
  return { kind: "piecewise", points: [[LOW, low], [HIGH, high]] };
}

/** A stat line as a taming table reads it: `base` at level 1, `perLevel` more each level after. */
function perLevel(base: number, perLevel: number): Curve {
  return grows(base, base + perLevel * (HIGH - LOW));
}

/** One food row: items and seconds for a full tame at levels 1 and 30, and what a meal costs. ARK's effectiveness weight. */
export function food(countAt1: number, secondsAt1: number, countAt30: number, secondsAt30: number, ineffectiveness = 0.03): FeedingFood {
  return { meals: grows(countAt1, countAt30), seconds: grows(secondsAt1, secondsAt30), cost: ineffectiveness };
}

/** ARK's knocked-out torpor drain: 0.3 a second at level 1, 0.5 at level 30. */
const TORPOR_DRAIN: Curve = grows(0.3, 0.5);

/** Taming effectiveness a hit costs per share of max health taken while down (ARK: 2). */
const HIT_COST = 2;

/** Share of the taming bar lost a second while a downed creature has nothing it will eat. */
const STARVE_LOSS = 0.001;

/** A species' knockout taming table: its torpor and how it grows, and the foods it eats in preference order. */
export function tamingTable(torpor: { base: number; perLevel: number }, foods: Readonly<Record<string, FeedingFood>>): SubdualFeedingConfig {
  return { capacity: perLevel(torpor.base, torpor.perLevel), drain: TORPOR_DRAIN, hitCost: HIT_COST, starveLoss: STARVE_LOSS, foods };
}

/** Force-fed doses, ARK's torpor over the seconds it releases: berries are the cheap version of each. */
export const NARCOTICS: Readonly<Record<string, FeedingDose>> = {
  narcoberry: { amount: 8, seconds: 3 },
  narcotic: { amount: 40, seconds: 16 },
  stimberry: { amount: -7.5, seconds: 3 },
  stimulant: { amount: -40, seconds: 3 },
};

/** ARK's bonus levels: half the wild level, scaled by taming effectiveness, floored. */
export function bonusLevels(level: number, effectiveness: number): number {
  return Math.floor((level * effectiveness) / 2);
}
