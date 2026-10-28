import type { HumanValidationRow } from "./humanReferenceValidation";

/** A legged animal's size for the dynamic-similarity equations. */
export interface QuadrupedBody {
  /** Body mass, kg. */
  mass: number;
  /** Height of the hip joint standing, m: the leg length of Alexander and Jayes's Froude number. */
  hipHeight: number;
}

/** A power law `a·Frᵇ` of the Froude number. */
export interface FroudePowerLaw {
  a: number;
  b: number;
}

/**
 * The dynamic-similarity fits of R. McN. Alexander and A. S. Jayes, "A dynamic similarity hypothesis for the gaits of
 * quadrupedal mammals", *J. Zool.* 201 (1983), table 2, for cursorial mammals, as tabulated by A. C. Basu et al.,
 * *J. Exp. Biol.* 222 (2019): relative stride length `λ/h = 2.4·Fr^0.34`, forelimb duty factor `0.52·Fr^−0.14` and
 * hindlimb duty factor `0.52·Fr^−0.18`, with `Fr = v²/(g·h)`.
 */
export const ALEXANDER_JAYES_CURSORIAL: { strideLength: FroudePowerLaw; dutyFactorFore: FroudePowerLaw; dutyFactorHind: FroudePowerLaw } = {
  strideLength: { a: 2.4, b: 0.34 },
  dutyFactorFore: { a: 0.52, b: -0.14 },
  dutyFactorHind: { a: 0.52, b: -0.18 },
};

/**
 * Froude number of the walk–trot change: horses change at 0.30–0.37 (`√Fr` 0.55–0.61, as compiled by C. L. Shine et
 * al., "Grizzly bear locomotion: gaits and ground reaction forces", *J. Exp. Biol.* 218, 2015).
 */
export const WALK_TROT_FROUDE = 0.35;

/**
 * Speed of the trot–gallop change for an animal of `mass` (kg), m/s: `1.54·M^0.216`, measured on treadmills in 16
 * species from 30 g mice to 200 kg horses (N. C. Heglund and C. R. Taylor, "Speed, stride frequency and energy cost per
 * stride", *J. Exp. Biol.* 138, 1988, eq. 3). Larger animals change at a higher Froude number: about 2.5 for a dog,
 * 3.4 for a horse.
 * @capability trot-gallop-speed the speed a quadruped of a given mass changes from trot to gallop (Heglund & Taylor 1988)
 */
export function trotGallopSpeed(mass: number): number {
  return 1.54 * mass ** 0.216;
}

const G = 9.81;

/**
 * Froude number `v²/(g·h)` of `speed` (m/s) on legs `hipHeight` (m) long.
 * @capability froude-number dimensionless speed v²/(g·h) that sets gait across animal sizes
 */
export function froudeNumber(speed: number, hipHeight: number): number {
  return (speed * speed) / (G * hipHeight);
}

/**
 * Speed of a Froude number on legs `hipHeight` long, m/s.
 * @capability froude-speed speed of a dimensionless Froude number for an animal of a given leg length
 */
export function speedAtFroude(froude: number, hipHeight: number): number {
  return Math.sqrt(froude * G * hipHeight);
}

/** Symmetrical and asymmetrical gaits of a running quadruped. */
export type QuadrupedGait = "walk" | "trot" | "gallop";

/** A quadruped's stride at one speed. */
export interface QuadrupedStride {
  gait: QuadrupedGait;
  froude: number;
  /** Stride length, m. */
  strideLength: number;
  /** Strides per second. */
  strideFrequency: number;
  /** Fraction of the stride each forefoot is down. */
  dutyFactorFore: number;
  /** Fraction of the stride each hindfoot is down. */
  dutyFactorHind: number;
}

const power = (law: FroudePowerLaw, froude: number) => law.a * froude ** law.b;

/**
 * Gait, stride and duty factors of a cursorial quadruped at `speed` (m/s) from Alexander and Jayes's dynamic
 * similarity: animals of any size move alike at equal Froude numbers. The gallop starts at {@link trotGallopSpeed}. Duty factors are capped at 0.9 for very slow walks.
 * @capability quadruped-stride gait, stride length, stride frequency and duty factor of a dog, horse or any quadruped at a speed
 */
export function quadrupedStride(body: QuadrupedBody, speed: number): QuadrupedStride {
  const froude = Math.max(1e-6, froudeNumber(speed, body.hipHeight));
  const gait: QuadrupedGait = froude < WALK_TROT_FROUDE ? "walk" : speed < trotGallopSpeed(body.mass) ? "trot" : "gallop";
  const strideLength = power(ALEXANDER_JAYES_CURSORIAL.strideLength, froude) * body.hipHeight;
  return {
    gait,
    froude,
    strideLength,
    strideFrequency: speed / strideLength,
    dutyFactorFore: Math.min(0.9, power(ALEXANDER_JAYES_CURSORIAL.dutyFactorFore, froude)),
    dutyFactorHind: Math.min(0.9, power(ALEXANDER_JAYES_CURSORIAL.dutyFactorHind, froude)),
  };
}

/**
 * Realised top running speed of an animal of `mass` (kg), m/s, from the time-limited acceleration law of M. R. Hirt
 * et al., "A general scaling law reveals why the largest animals are not the fastest", *Nat. Ecol. Evol.* 1 (2017),
 * supplementary table 4: `v = 25.5·M^0.26·(1 − e^(−22·M^−0.6))` km/h, fitted to 453 running species.
 * @capability animal-top-speed top running speed of an animal from its body mass (Hirt 2017)
 */
export function animalTopSpeed(mass: number): number {
  return (25.5 * mass ** 0.26 * (1 - Math.exp(-22 * mass ** -0.6))) / 3.6;
}

/**
 * Body mass of a cursorial quadruped from its hip-joint height, kg, by geometric similarity with a 500 kg horse whose
 * hip joint stands 1.05 m high. It puts a dog with a 0.4 m hip at 28 kg. Use a known mass when there is one.
 * @capability quadruped-mass-estimate estimate a quadruped's body mass from its hip height
 */
export function quadrupedMassFromHeight(hipHeight: number): number {
  return 500 * (hipHeight / 1.05) ** 3;
}

/** A game creature's speeds and size for {@link compareQuadruped}. */
export interface CreatureLocomotion {
  /** Walking speed, m/s. */
  walkSpeed: number;
  /** Fastest speed (run or sprint), m/s; omit when it only walks. */
  runSpeed?: number;
  /** Hip height, m. */
  hipHeight: number;
  /** Body mass, kg (default {@link quadrupedMassFromHeight}). */
  mass?: number;
}

/** One creature against the quadruped reference of its size. */
export interface QuadrupedComparison {
  mass: number;
  hipHeight: number;
  /** Froude number and gait of the game's walk. */
  walkFroude: number;
  walkGait: QuadrupedGait;
  /** Fastest walk before trotting, m/s. */
  referenceWalkMax: number;
  /** Trot to gallop, m/s. */
  referenceGallopFrom: number;
  /** Froude number and gait of the game's run; `NaN` and `"walk"` when it has none. */
  runFroude: number;
  runGait: QuadrupedGait;
  /** Top speed for the mass, m/s. */
  referenceTopSpeed: number;
  /** Game run (or walk) speed over the reference top speed. */
  topSpeedRatio: number;
}

/**
 * Compare a game creature's walk and run with a real quadruped of the same size: the gait each speed would be, the
 * walk–trot and trot–gallop speeds of its legs, and its top speed for its mass.
 * @capability quadruped-compare score a game creature's walk and run speeds against real animal gait transitions and top speed
 */
export function compareQuadruped(creature: CreatureLocomotion): QuadrupedComparison {
  const mass = creature.mass ?? quadrupedMassFromHeight(creature.hipHeight);
  const body = { mass, hipHeight: creature.hipHeight };
  const walk = quadrupedStride(body, creature.walkSpeed);
  const run = creature.runSpeed === undefined ? undefined : quadrupedStride(body, creature.runSpeed);
  const top = animalTopSpeed(mass);
  return {
    mass,
    hipHeight: creature.hipHeight,
    walkFroude: walk.froude,
    walkGait: walk.gait,
    referenceWalkMax: speedAtFroude(WALK_TROT_FROUDE, creature.hipHeight),
    referenceGallopFrom: trotGallopSpeed(mass),
    runFroude: run?.froude ?? Number.NaN,
    runGait: run?.gait ?? "walk",
    referenceTopSpeed: top,
    topSpeedRatio: (creature.runSpeed ?? creature.walkSpeed) / top,
  };
}

/** Published top speeds of running mammals, km/h, with their body masses, kg (Hirt et al. 2017, supplementary data). */
export const MAMMAL_TOP_SPEEDS: readonly { animal: string; mass: number; low: number; high: number }[] = [
  { animal: "Domestic dog", mass: 21, low: 55, high: 65 },
  { animal: "Grey wolf", mass: 38, low: 62, high: 64 },
  { animal: "Spotted hyena", mass: 56, low: 60, high: 64 },
  { animal: "Plains zebra", mass: 186, low: 68, high: 70 },
  { animal: "Horse", mass: 490, low: 64, high: 88 },
  { animal: "White rhinoceros", mass: 2300, low: 24, high: 40 },
  { animal: "Asian elephant", mass: 4000, low: 25, high: 26 },
];

/**
 * Validate the quadruped reference against published animals: top speed by mass within the ±20% scatter of the Hirt
 * fit, and the duty factor at the trot–gallop transition, 0.41 ± 0.02 at any size from mice to horses
 * (A. A. Biewener, *J. Exp. Biol.* 105, 1983).
 * @capability quadruped-reference-validation check the quadruped reference against published animal top speeds and duty factors
 */
export function validateQuadrupedReference(): HumanValidationRow[] {
  const rows: HumanValidationRow[] = MAMMAL_TOP_SPEEDS.map(({ animal, mass, low, high }) => {
    const reference = animalTopSpeed(mass) * 3.6;
    const lo = Math.round(8 * low) / 10;
    const hi = Math.round(12 * high) / 10;
    return { metric: `topSpeed:${animal}`, label: `${animal} top speed (${mass} kg)`, unit: "km/h", reference, low: lo, high: hi, source: "Hirt et al. 2017 data, ±20%", pass: reference >= lo && reference <= hi };
  });
  const atTransition = quadrupedStride({ mass: 500, hipHeight: 1.05 }, trotGallopSpeed(500));
  const duty = (atTransition.dutyFactorFore + atTransition.dutyFactorHind) / 2;
  rows.push({ metric: "dutyTrotGallop", label: "Duty factor at the trot–gallop transition", unit: "", reference: duty, low: 0.39, high: 0.43, source: "Biewener 1983, at the Heglund & Taylor 1988 transition speed", pass: duty >= 0.39 && duty <= 0.43 });
  return rows;
}
