import type { HumanValidationRow } from "./humanReferenceValidation";
import { animalTopSpeed, froudeNumber, speedAtFroude } from "./quadrupedGait";

/** The three leg joints whose extensors hold a biped up at mid-stance. */
export type BipedJoint = "hip" | "knee" | "ankle";

const JOINTS: readonly BipedJoint[] = ["hip", "knee", "ankle"];

/** One joint's extensor muscles and lever at mid-stance of fast running. */
export interface BipedJointMuscle {
  /** Mean extensor fascicle length, m. */
  fascicleLength: number;
  /** Mean fascicle pennation, rad. */
  pennation: number;
  /** Mean extensor moment arm, m. */
  muscleMomentArm: number;
  /** Moment arm of the ground force about the joint, m. */
  loadMomentArm: number;
  /** Extensor muscle mass dissected about the joint, % of body mass; absent for extinct animals. */
  actualMass?: number;
  /** Required mass Hutchinson published for this joint, % of body mass. */
  publishedRequired?: number;
}

/** A biped's support leg as J. R. Hutchinson modelled it. */
export interface BipedLimb {
  animal: string;
  /** Body mass, kg. */
  mass: number;
  /** Segment masses of the support leg, kg. */
  segments: { thigh: number; shank: number; metatarsus: number; foot: number };
  /** Thigh + shank + metatarsus length, m. */
  legLength: number;
  joints: Record<BipedJoint, BipedJointMuscle | null>;
}

const DEG = Math.PI / 180;
const joint = (L: number, theta: number, r: number, R: number, actual: number | undefined, published: number): BipedJointMuscle => ({
  fascicleLength: L,
  pennation: theta * DEG,
  muscleMomentArm: r,
  loadMomentArm: R,
  ...(actual === undefined ? {} : { actualMass: actual }),
  publishedRequired: published,
});

/**
 * Hutchinson's limb models (J. R. Hutchinson, "Biomechanical modeling and sensitivity analysis of bipedal running
 * ability. I. Extant taxa" and "II. Extinct taxa", *J. Morphol.* 262, 2004, tables 1 and 3 of part I, tables 2 and 4
 * of part II): segment masses, extensor fascicle lengths, pennation, moment arms, dissected extensor masses and the
 * required masses he published. The alligator's knee needed flexors, not extensors, so it has none.
 */
export const HUTCHINSON_BIPEDS: Record<"human" | "chicken" | "turkey" | "emu" | "ostrich" | "alligator" | "tyrannosaurus", BipedLimb> = {
  human: {
    animal: "Human",
    mass: 71,
    segments: { thigh: 8.81, shank: 3.51, metatarsus: 1.2, foot: 0.205 },
    legLength: 0.401 + 0.43,
    joints: { hip: joint(0.113, 0, 0.039, 0.17, 5.2, 3.5), knee: joint(0.091, 5, 0.04, 0.012, 3.7, 0.2), ankle: joint(0.049, 20, 0.037, 0.1, 1.7, 1.2) },
  },
  chicken: {
    animal: "Chicken",
    mass: 2.89,
    segments: { thigh: 0.223, shank: 0.181, metatarsus: 0.0426, foot: 0.0221 },
    legLength: 0.085 + 0.13 + 0.085,
    joints: { hip: joint(0.085, 0, 0.038, 0.067, 3.7, 1.1), knee: joint(0.051, 25, 0.026, 0.0049, 3.1, 0.1), ankle: joint(0.031, 20, 0.009, 0.068, 3.5, 2.1) },
  },
  turkey: {
    animal: "Wild turkey",
    mass: 3.7,
    segments: { thigh: 0.189, shank: 0.135, metatarsus: 0.025, foot: 0.0172 },
    legLength: 0.084 + 0.15 + 0.12,
    joints: { hip: joint(0.045, 0, 0.033, 0.043, 2.1, 0.5), knee: joint(0.04, 20, 0.01, 0.029, 1.6, 1.0), ankle: joint(0.03, 25, 0.008, 0.061, 2.4, 2.1) },
  },
  emu: {
    animal: "Emu",
    mass: 27.2,
    segments: { thigh: 3.54, shank: 3.19, metatarsus: 0.471, foot: 0.222 },
    legLength: 0.18 + 0.408 + 0.276,
    joints: { hip: joint(0.164, 5, 0.061, 0.062, 4.9, 1.1), knee: joint(0.078, 15, 0.046, 0.14, 4.2, 1.6), ankle: joint(0.057, 25, 0.024, 0.07, 6.4, 1.4) },
  },
  ostrich: {
    animal: "Ostrich",
    mass: 65.3,
    segments: { thigh: 6.5, shank: 4.4, metatarsus: 0.861, foot: 0.483 },
    legLength: 0.205 + 0.465 + 0.416,
    joints: { hip: joint(0.135, 10, 0.1, 0.067, 4.6, 0.6), knee: joint(0.097, 15, 0.08, 0.15, 3.6, 1.3), ankle: joint(0.064, 25, 0.036, 0.075, 4.0, 1.2) },
  },
  alligator: {
    animal: "Alligator",
    mass: 5.91,
    segments: { thigh: 0.13, shank: 0.0663, metatarsus: 0.0386, foot: 0.0518 },
    legLength: 0.081 + 0.087 + 0.05,
    joints: { hip: joint(0.092, 20, 0.019, 0.12, 2.6, 4.9), knee: null, ankle: joint(0.037, 20, 0.017, 0.084, 0.36, 1.7) },
  },
  tyrannosaurus: {
    animal: "Tyrannosaurus",
    mass: 6000,
    segments: { thigh: 417, shank: 281, metatarsus: 63, foot: 41 },
    legLength: 1.13 + 1.26 + 0.699,
    joints: { hip: joint(0.85, 0, 0.37, 0.57, undefined, 9.7), knee: joint(0.4, 0, 0.22, 0.18, undefined, 2.7), ankle: joint(0.26, 0, 0.12, 0.45, undefined, 8.3) },
  },
};

/**
 * Peak ground force on the one support leg at mid-stance of fast running, body weights: 2.5, which most fast runners
 * reach or exceed (Hutchinson 2004, part I, table 2).
 */
export const FAST_RUNNING_GROUND_FORCE = 2.5;

/**
 * Hutchinson's limits for extensors (2004, part II): no living biped has more than 7% of body mass acting about one
 * joint, and a generous 15% of body mass for all of one leg's extensors.
 */
export const BIPED_EXTENSOR_LIMITS = { perJoint: 7, perLeg: 15 } as const;

const MUSCLE_DENSITY = 1060;
const MAX_ISOMETRIC_STRESS = 3e5;
const G = 9.81;

/** Fraction of body mass carried above `joint` of the support leg. */
function massAbove(limb: BipedLimb, at: BipedJoint): number {
  const s = limb.segments;
  const below = at === "hip" ? s.thigh + s.shank + s.metatarsus + s.foot : at === "knee" ? s.shank + s.metatarsus + s.foot : s.metatarsus + s.foot;
  return (limb.mass - below) / limb.mass;
}

/**
 * Extensor muscle mass a joint needs, % of body mass, to hold the weight above it at `groundForce` body weights with
 * every fibre at its maximum isometric stress (300 kPa, density 1060 kg/m³): `100·G·g·w·R·L·ρ / (cos θ·σ·r)`
 * (Hutchinson 2004, part I, eq. 9, with `w` the share of body mass above the joint, as his free-body model has it).
 * @capability biped-extensor-mass the leg muscle mass a biped joint needs to support fast running (Hutchinson 2004)
 */
export function requiredExtensorMass(limb: BipedLimb, at: BipedJoint, groundForce = FAST_RUNNING_GROUND_FORCE): number {
  const j = limb.joints[at];
  if (j === null) return Number.NaN;
  const lever = (j.loadMomentArm * j.fascicleLength) / (Math.cos(j.pennation) * j.muscleMomentArm);
  return (100 * groundForce * G * massAbove(limb, at) * lever * MUSCLE_DENSITY) / MAX_ISOMETRIC_STRESS;
}

/** Whether a biped's legs carry fast running. */
export interface BipedRunningSupport {
  /** Required extensor mass per joint, % of body mass. */
  required: Record<BipedJoint, number>;
  /** Sum over the hip, knee and ankle, % of body mass per leg. */
  total: number;
  /** Least ratio of muscle there (dissected, else {@link BIPED_EXTENSOR_LIMITS}) to muscle needed; below 1 it cannot run fast. */
  support: number;
}

/**
 * Required extensor masses at each joint of `limb` for fast running, and the least ratio of the muscle it has
 * (dissected, or Hutchinson's limits for an extinct animal) to the muscle it needs.
 * @capability biped-running-support whether a biped's leg muscles could carry fast running, joint by joint
 */
export function bipedRunningSupport(limb: BipedLimb, groundForce = FAST_RUNNING_GROUND_FORCE): BipedRunningSupport {
  const required = { hip: 0, knee: 0, ankle: 0 };
  let total = 0;
  let support = Number.POSITIVE_INFINITY;
  let dissected = true;
  for (const at of JOINTS) {
    const j = limb.joints[at];
    const need = requiredExtensorMass(limb, at, groundForce);
    required[at] = need;
    if (j === null) continue;
    total += need;
    if (j.actualMass === undefined) dissected = false;
    support = Math.min(support, (j.actualMass ?? BIPED_EXTENSOR_LIMITS.perJoint) / need);
  }
  if (!dissected) support = Math.min(support, BIPED_EXTENSOR_LIMITS.perLeg / total);
  return { required, total, support };
}

/**
 * Scale `limb` isometrically to a leg `legLength` (m) long: every length by the same factor and every mass by its cube.
 * Required extensor masses then grow in proportion to leg length.
 * @capability biped-limb-scale scale a published biped limb model to another size by geometric similarity
 */
export function scaleBipedLimb(limb: BipedLimb, legLength: number): BipedLimb {
  const k = legLength / limb.legLength;
  const k3 = k ** 3;
  const scaleJoint = (j: BipedJointMuscle | null): BipedJointMuscle | null =>
    j === null ? null : { fascicleLength: j.fascicleLength * k, pennation: j.pennation, muscleMomentArm: j.muscleMomentArm * k, loadMomentArm: j.loadMomentArm * k };
  const s = limb.segments;
  return {
    animal: limb.animal,
    mass: limb.mass * k3,
    segments: { thigh: s.thigh * k3, shank: s.shank * k3, metatarsus: s.metatarsus * k3, foot: s.foot * k3 },
    legLength,
    joints: { hip: scaleJoint(limb.joints.hip), knee: scaleJoint(limb.joints.knee), ankle: scaleJoint(limb.joints.ankle) },
  };
}

/**
 * Walk–run and run–walk Froude numbers of a biped bird: an ostrich changes up at `√Fr` 0.58 (2.05 m/s on a 1.26 m hip)
 * and back down at 0.50 (M. A. Daley et al., "Preferred gait and walk–run transition speeds in ostriches measured
 * using GPS-IMU sensors", *J. Exp. Biol.* 219, 2016).
 */
export const BIRD_WALK_RUN_FROUDE = { up: 0.58 ** 2, down: 0.5 ** 2 } as const;

/**
 * Body mass of a theropod from its leg length (thigh + shank + metatarsus, m), kg, by geometric similarity with
 * Hutchinson's 6000 kg Tyrannosaurus whose leg is 3.09 m long. Small theropods have relatively longer legs, so it
 * overestimates them.
 * @capability theropod-mass-estimate estimate a theropod's body mass from its leg length
 */
export function theropodMassFromLegLength(legLength: number): number {
  const rex = HUTCHINSON_BIPEDS.tyrannosaurus;
  return rex.mass * (legLength / rex.legLength) ** 3;
}

/** A game biped's speeds and size for {@link compareBiped}. */
export interface BipedCreature {
  walkSpeed: number;
  runSpeed?: number;
  /** Hip height standing, m, taken as the leg length. */
  hipHeight: number;
  /** Body mass, kg (default {@link theropodMassFromLegLength}). */
  mass?: number;
}

/** One game biped against the theropod and bird references of its size. */
export interface BipedComparison {
  mass: number;
  hipHeight: number;
  walkFroude: number;
  walkGait: "walk" | "run";
  /** Fastest walk before a bird would run, m/s. */
  referenceWalkMax: number;
  runFroude: number;
  runGait: "walk" | "run";
  /** Top speed for the mass, m/s. */
  referenceTopSpeed: number;
  /** Game run (or walk) speed over the reference top speed. */
  topSpeedRatio: number;
  /** Leg extensor mass a fast run needs, % of body mass per leg, from the scaled Tyrannosaurus model. */
  extensorMassNeeded: number;
  /** Below 1 its legs could not carry a fast run (see {@link bipedRunningSupport}). */
  runningSupport: number;
}

/**
 * Compare a game biped's walk and run with a real theropod of its size: the gait of each speed by the bird walk–run
 * Froude number, its top speed for its mass (Hirt et al. 2017), and whether Hutchinson's Tyrannosaurus leg scaled to
 * its size has the muscle for a fast run.
 * @capability biped-compare score a game biped's walk and run speeds against real bird gaits, top speed and theropod leg muscle
 */
export function compareBiped(creature: BipedCreature): BipedComparison {
  const mass = creature.mass ?? theropodMassFromLegLength(creature.hipHeight);
  const walkFroude = froudeNumber(creature.walkSpeed, creature.hipHeight);
  const runFroude = creature.runSpeed === undefined ? Number.NaN : froudeNumber(creature.runSpeed, creature.hipHeight);
  const top = animalTopSpeed(mass);
  const leg = bipedRunningSupport(scaleBipedLimb(HUTCHINSON_BIPEDS.tyrannosaurus, creature.hipHeight));
  return {
    mass,
    hipHeight: creature.hipHeight,
    walkFroude,
    walkGait: walkFroude < BIRD_WALK_RUN_FROUDE.up ? "walk" : "run",
    referenceWalkMax: speedAtFroude(BIRD_WALK_RUN_FROUDE.up, creature.hipHeight),
    runFroude,
    runGait: !(runFroude >= BIRD_WALK_RUN_FROUDE.up) ? "walk" : "run",
    referenceTopSpeed: top,
    topSpeedRatio: (creature.runSpeed ?? creature.walkSpeed) / top,
    extensorMassNeeded: leg.total,
    runningSupport: leg.support,
  };
}

/** Hutchinson's other theropod models (2004, part II, tables 2 and 4): leg length, m, and required extensor mass per leg, %. */
export const HUTCHINSON_THEROPODS: readonly { animal: string; legLength: number; required: number }[] = [
  { animal: "Compsognathus", legLength: 0.061 + 0.083 + 0.035, required: 1.3 },
  { animal: "Coelophysis", legLength: 0.16 + 0.233 + 0.116, required: 3.0 },
  { animal: "Velociraptor", legLength: 0.16 + 0.221 + 0.108, required: 3.4 },
  { animal: "Small tyrannosaur", legLength: 0.37 + 0.46 + 0.325, required: 6.9 },
  { animal: "Dilophosaurus", legLength: 0.47 + 0.6 + 0.28, required: 9.4 },
  { animal: "Allosaurus", legLength: 0.69 + 0.71 + 0.35, required: 13 },
];

const row = (metric: string, label: string, unit: string, reference: number, low: number, high: number, source: string): HumanValidationRow => ({
  metric,
  label,
  unit,
  reference,
  low,
  high,
  source,
  pass: reference >= low && reference <= high,
});
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Validate the biped reference: Hutchinson's required extensor masses recomputed from his inputs (±20% for inputs
 * rounded to two figures); living fast runners with muscle to spare at every joint and the alligator and
 * Tyrannosaurus without; the Tyrannosaurus leg scaled to Hutchinson's other theropods (±20%); and top speeds of the
 * ostrich (±20% of measured) and Tyrannosaurus (J. R. Hutchinson 2004: 5 m/s at Froude 1; W. I. Sellers et al.,
 * *PeerJ* 5, e3420, 2017: 7.7 m/s at the highest bone stress).
 * @capability biped-reference-validation check the biped reference against published bird and theropod leg muscle and top speeds
 */
export function validateBipedReference(): HumanValidationRow[] {
  const rows: HumanValidationRow[] = [];
  for (const key of ["human", "chicken", "turkey", "emu", "ostrich", "alligator", "tyrannosaurus"] as const) {
    const limb = HUTCHINSON_BIPEDS[key];
    for (const at of JOINTS) {
      const published = limb.joints[at]?.publishedRequired;
      if (published === undefined) continue;
      rows.push(row(`extensor:${key}:${at}`, `${limb.animal} ${at} extensor mass for fast running`, "% body", requiredExtensorMass(limb, at), round(0.8 * published), round(1.2 * published), "Hutchinson 2004, ±20%"));
    }
    const support = bipedRunningSupport(limb).support;
    const runs = key !== "alligator" && key !== "tyrannosaurus";
    rows.push(row(`support:${key}`, `${limb.animal}: muscle there over muscle a fast run needs`, "×", support, runs ? 1 : 0, runs ? 100 : 1, runs ? "Hutchinson 2004 (a fast runner)" : "Hutchinson 2004; Sellers et al. 2017 (cannot run fast)"));
  }
  for (const t of HUTCHINSON_THEROPODS) {
    const scaled = bipedRunningSupport(scaleBipedLimb(HUTCHINSON_BIPEDS.tyrannosaurus, t.legLength)).total;
    rows.push(row(`theropod:${t.animal}`, `${t.animal} extensor mass per leg, Tyrannosaurus scaled`, "% body", scaled, round(0.8 * t.required), round(1.2 * t.required), "Hutchinson 2004 part II, ±20%"));
  }
  rows.push(row("topSpeed:Ostrich", "Ostrich top speed (111 kg)", "km/h", animalTopSpeed(111) * 3.6, 56, 99.4, "Hirt et al. 2017 data (70–82.8), ±20%"));
  rows.push(row("topSpeed:Tyrannosaurus", "Tyrannosaurus top speed (6000 kg)", "m/s", animalTopSpeed(6000), 5, 7.7, "Hutchinson 2004; Sellers et al. 2017"));
  return rows;
}
