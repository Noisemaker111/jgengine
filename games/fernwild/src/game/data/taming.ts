import { evalCurve, type Curve } from "@jgengine/core/progression/leveling";
import { createDoseTable } from "@jgengine/core/stats/doseTable";
import type { VitalDef, VitalDose } from "@jgengine/core/stats/vitals";

/**
 * ARK's knockout taming as a body of meters. Torpor fills from hits and darts, wears off, and knocks the
 * creature out when full. While it is out it eats from its inventory whenever its belly is empty: each
 * food fills affinity (the tame), fills the belly for as long as it takes to digest, and adds
 * ineffectiveness. Affinity full is the tame, at effectiveness 1 / (1 + ineffectiveness). Torpor wearing
 * off first wakes it and the tame is lost. Every number is a meter, a dose or a curve below.
 */

/** The levels ARK's taming tables are written at: a wild creature's first level and its last. */
const LOW = 1;
const HIGH = 30;

/** A table value: `low` at level 1, `high` at level 30, straight lines between. */
function grows(low: number, high: number): Curve {
  return { kind: "piecewise", points: [[LOW, low], [HIGH, high]] };
}

/** A species' taming: its torpor at a level, the affinity a tame takes at a level, and its foods, most preferred first. */
export interface TamingDef {
  torpor: Curve;
  affinity: Curve;
  foods: Readonly<Record<string, readonly VitalDose[]>>;
}

/**
 * One food: the affinity it gives (in the species' plain food, so raw meat is 1 for a carnivore), the
 * seconds the belly takes to digest it (the time to the next meal), and the ineffectiveness it adds.
 */
export function food(affinity: number, digestSeconds: number, ineffectiveness = 0.03): readonly VitalDose[] {
  return [
    { vital: "affinity", amount: affinity },
    { vital: "belly", amount: digestSeconds },
    { vital: "ineffectiveness", amount: ineffectiveness },
  ];
}

/** A species' table: torpor at level 1 and per level, plain-food meals a tame takes at levels 1 and 30, and its foods. */
export function tamingTable(torpor: { base: number; perLevel: number }, meals: readonly [number, number], foods: Readonly<Record<string, readonly VitalDose[]>>): TamingDef {
  return { torpor: grows(torpor.base, torpor.base + torpor.perLevel * (HIGH - LOW)), affinity: grows(meals[0], meals[1]), foods };
}

/** ARK's knocked-out torpor drain: 0.3 a second at level 1, 0.5 at level 30. */
export const TORPOR_DRAIN: Curve = grows(0.3, 0.5);

/** Ineffectiveness a hit adds per share of max health taken while down (ARK: 2). */
export const HIT_INEFFECTIVENESS = 2;

/** Share of the affinity a tame takes, lost a second while a downed creature has nothing it will eat. */
export const STARVE_LOSS = 0.001;

/** The longest anything can hold a creature still, seconds: a second bola tops it up, never past this. */
const HOLD_MAX = 30;

/** It wakes once torpor wears down to this share of full. */
export const WAKES_AT = 0.002;

/** The body a creature is tamed through, at its level: the meters above, the flags it raises. */
export function tamingBody(def: TamingDef, level: number): VitalDef[] {
  const affinity = Math.max(1e-6, evalCurve(def.affinity, level));
  return [
    { id: "torpor", max: evalCurve(def.torpor, level), start: 0, rate: -evalCurve(TORPOR_DRAIN, level), flags: [{ id: "unconscious", when: "atLeast", on: 1, off: WAKES_AT }] },
    // The belly holds seconds of digestion and empties one a second (the taming-speed multiplier scales it).
    { id: "belly", max: 1e6, start: 0, rate: -1 },
    { id: "affinity", max: affinity, start: 0, flags: [{ id: "tamed", when: "atLeast", on: 1 }] },
    { id: "ineffectiveness", max: 1e6, start: 0 },
    // Seconds a bola or a trap still holds it still; they wear off one a second.
    { id: "held", max: HOLD_MAX, start: 0, rate: -1 },
  ];
}

/** Taming effectiveness from the ineffectiveness a tame gathered: 1 clean, falling with every meal and hit. */
export function effectivenessOf(ineffectiveness: number): number {
  return 1 / (1 + Math.max(0, ineffectiveness));
}

/** Force-fed to a creature that is out: torpor over the seconds it releases. Berries are the cheap version of each. */
export const NARCOTICS = createDoseTable(
  {
    any: {
      narcoberry: [{ vital: "torpor", amount: 8, seconds: 3 }],
      narcotic: [{ vital: "torpor", amount: 40, seconds: 16 }],
      stimberry: [{ vital: "torpor", amount: -7.5, seconds: 3 }],
      stimulant: [{ vital: "torpor", amount: -40, seconds: 3 }],
    },
  },
  { fallback: "any" },
);

/** ARK's bonus levels: half the wild level, scaled by taming effectiveness, floored. */
export function bonusLevels(level: number, effectiveness: number): number {
  return Math.floor((level * effectiveness) / 2);
}
