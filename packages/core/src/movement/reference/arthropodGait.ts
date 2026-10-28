import type { HumanValidationRow } from "./humanReferenceValidation";
import { froudeNumber, speedAtFroude } from "./quadrupedGait";

/** Stride length (m), stride frequency (Hz) and duty factor of one leg at a running speed. */
export interface ArthropodStride {
  length: number;
  frequency: number;
  dutyFactor: number;
}

/** A measured arthropod runner: size, top speed and the published stride fits over speed (m/s). */
export interface ArthropodRunner {
  animal: string;
  legs: 6 | 8;
  /** Length of the hind (insects) or walking (spiders) leg, m: the length of its Froude number. */
  legLength: number;
  /** Fastest measured steady speed, m/s. */
  topSpeed: number;
  /** Speed above which strides have aerial phases, m/s; `Infinity` if none were seen. */
  aerialFrom: number;
  /** Lowest and highest speeds the stride fits were measured over, m/s. */
  measured: readonly [number, number];
  stride(speed: number): ArthropodStride;
  source: string;
}

const mm = (speed: number) => speed * 1000;

/**
 * Arthropods with published stride fits, leg lengths and top speeds. Speeds in m/s; the papers' fits in mm/s are
 * converted here.
 */
export const ARTHROPOD_RUNNERS: Record<"cockroach" | "silverAnt" | "desertAnt" | "tarantula", ArthropodRunner> = {
  cockroach: {
    animal: "American cockroach (Periplaneta americana, 0.83 g)",
    legs: 6,
    legLength: 0.03,
    topSpeed: 1.5,
    aerialFrom: 1,
    measured: [0.44, 1.5],
    stride: (v) => ({ length: 0.033 * v + 0.011, frequency: 6.3 * v + 16.6, dutyFactor: 0.5 }),
    source: "R. J. Full and M. S. Tu, J. Exp. Biol. 156, 1991 (hind leg from the 2× hind-leg stride limit)",
  },
  silverAnt: {
    animal: "Saharan silver ant (Cataglyphis bombycina)",
    legs: 6,
    legLength: 0.0068,
    topSpeed: 0.855,
    aerialFrom: 0.15,
    measured: [0.057, 0.855],
    stride: (v) => ({ length: (0.02 * mm(v) + 4.72) / 1000, frequency: 1.43 * mm(v) ** 0.52, dutyFactor: -0.0004 * mm(v) + 0.54 }),
    source: "S. E. Pfeffer, V. L. Wahl, M. Wittlinger and H. Wolf, J. Exp. Biol. 222, 2019 (middle-leg duty factor)",
  },
  desertAnt: {
    animal: "Desert ant (Cataglyphis fortis)",
    legs: 6,
    legLength: 0.0068 / 0.81,
    topSpeed: 0.62,
    aerialFrom: 0.37,
    measured: [0.0045, 0.619],
    stride: (v) => ({ length: (0.023 * mm(v) + 5.93) / 1000, frequency: -0.0001 * mm(v) ** 2 + 0.11 * mm(v) + 1.63, dutyFactor: -0.0004 * mm(v) + 0.66 }),
    source: "V. Wahl, S. E. Pfeffer and M. Wittlinger, J. Comp. Physiol. A 201, 2015 (hind leg 19% longer than C. bombycina's, Pfeffer et al. 2019)",
  },
  tarantula: {
    animal: "Tarantula (Grammostola mollicoma, 18.5 g)",
    legs: 8,
    legLength: 0.0155 + 0.0152 + 0.012,
    topSpeed: 0.275,
    aerialFrom: Number.POSITIVE_INFINITY,
    measured: [0.11, 0.275],
    stride: (v) => ({ length: 0.0614, frequency: 14.4 * v + 0.14, dutyFactor: -0.531 * v + 0.666 }),
    source: "C. M. Biancardi et al., J. Exp. Biol. 214, 2011 (fast gait; leg is femur + tibia + metatarsus)",
  },
};

/** Gaits of a running arthropod. */
export type ArthropodGait = "tripod" | "running" | "alternating tetrapod";

/**
 * Froude number above which a six-legged runner takes aerial phases: the geometric mean of the onsets measured in
 * the cockroach and the two Cataglyphis ants (0.34 to 3.4).
 */
export const HEXAPOD_AERIAL_FROUDE = Math.cbrt(
  [ARTHROPOD_RUNNERS.cockroach, ARTHROPOD_RUNNERS.silverAnt, ARTHROPOD_RUNNERS.desertAnt].reduce((p, r) => p * froudeNumber(r.aerialFrom, r.legLength), 1),
);

/**
 * Stride of a measured arthropod at `speed`, clamped to the speeds it was measured over, with its gait.
 * @capability arthropod-stride stride length, frequency, duty factor and gait of a real insect or spider at a speed
 */
export function arthropodStride(runner: ArthropodRunner, speed: number): ArthropodStride & { gait: ArthropodGait } {
  const v = Math.min(runner.measured[1], Math.max(runner.measured[0], speed));
  const gait: ArthropodGait = runner.legs === 8 ? "alternating tetrapod" : v >= runner.aerialFrom ? "running" : "tripod";
  return { ...runner.stride(v), gait };
}

/**
 * Real top speed range of an arthropod with `legs` legs `legLength` long, m/s: every measured runner with as many
 * legs, scaled at equal Froude number (dynamic similarity, speed ∝ √leg length).
 * @capability arthropod-top-speed top running speed range of an insect or spider scaled to a leg length
 */
export function arthropodTopSpeed(legs: 6 | 8, legLength: number): { low: number; high: number } {
  const speeds = Object.values(ARTHROPOD_RUNNERS)
    .filter((r) => r.legs === legs)
    .map((r) => speedAtFroude(froudeNumber(r.topSpeed, r.legLength), legLength));
  return { low: Math.min(...speeds), high: Math.max(...speeds) };
}

/** A game arthropod's legs and speeds. */
export interface ArthropodLocomotion {
  legs: 6 | 8;
  /** Leg length, m. */
  legLength: number;
  walkSpeed: number;
  runSpeed: number;
}

/** One game arthropod against real ones scaled to its leg length. */
export interface ArthropodComparison {
  walkGait: ArthropodGait;
  runGait: ArthropodGait;
  runFroude: number;
  referenceTopSpeedLow: number;
  referenceTopSpeedHigh: number;
  /** Game run speed over the fastest scaled real runner. */
  topSpeedRatio: number;
}

function gaitAt(legs: 6 | 8, froude: number): ArthropodGait {
  if (legs === 8) return "alternating tetrapod";
  return froude >= HEXAPOD_AERIAL_FROUDE ? "running" : "tripod";
}

/**
 * Compare a game arthropod's walk and run with real insects or spiders at equal Froude number.
 * @capability arthropod-compare score a game insect or spider's gaits and top speed against real arthropods
 */
export function compareArthropod(creature: ArthropodLocomotion): ArthropodComparison {
  const top = arthropodTopSpeed(creature.legs, creature.legLength);
  const runFroude = froudeNumber(creature.runSpeed, creature.legLength);
  return {
    walkGait: gaitAt(creature.legs, froudeNumber(creature.walkSpeed, creature.legLength)),
    runGait: gaitAt(creature.legs, runFroude),
    runFroude,
    referenceTopSpeedLow: top.low,
    referenceTopSpeedHigh: top.high,
    topSpeedRatio: creature.runSpeed / top.high,
  };
}

function row(metric: string, label: string, unit: string, reference: number, low: number, high: number, source: string): HumanValidationRow {
  return { metric, label, unit, reference, low, high, source, pass: reference >= low && reference <= high };
}

/**
 * Validate the arthropod reference: each runner's stride fits multiply back to its speed, the two ants predict the
 * cockroach's top speed at equal Froude number, and √leg-length scaling sits inside Hurlbert et al.'s measured ant
 * exponents.
 * @capability arthropod-reference-validation check the arthropod reference against published insect and spider running data
 */
export function validateArthropodReference(): HumanValidationRow[] {
  const rows: HumanValidationRow[] = [];
  for (const [id, runner] of Object.entries(ARTHROPOD_RUNNERS)) {
    const [lo, hi] = runner.measured;
    for (const v of [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75]) {
      const s = arthropodStride(runner, v);
      rows.push(row(`arthropod:${id}:${v.toFixed(2)}`, `${runner.animal}: stride length × frequency at ${v.toFixed(2)} m/s`, "× speed", (s.length * s.frequency) / v, 0.85, 1.15, `${runner.source}, ±15%`));
    }
  }
  const { cockroach, silverAnt, desertAnt, tarantula } = ARTHROPOD_RUNNERS;
  const fromAnts = Math.sqrt([silverAnt, desertAnt].reduce((p, r) => p * speedAtFroude(froudeNumber(r.topSpeed, r.legLength), cockroach.legLength), 1));
  rows.push(row("arthropod:cockroachFromAnts", "Cockroach top speed from the two ants at equal Froude", "m/s", fromAnts, 1.2, 1.8, "Full & Tu 1991 (1.5 m/s), ±20%"));
  rows.push(row("arthropod:tarantulaDuty", "Tarantula duty factor at top speed (no aerial phase)", "", arthropodStride(tarantula, tarantula.topSpeed).dutyFactor, 0.5, 1, "Biancardi et al. 2011 (always above 0.5)"));
  rows.push(row("arthropod:legExponent", "Top speed exponent of leg length", "", 0.5, 0.42, 0.99, "A. H. Hurlbert, F. Ballantyne and S. Powell, Ecol. Entomol. 33, 2008 (ants, 0.42–0.99)"));
  rows.push(row("arthropod:massExponent", "Top speed exponent of body mass (isometric legs)", "", 1 / 6, 0.14, 0.34, "Hurlbert et al. 2008 (ants, 0.14–0.34)"));
  return rows;
}
