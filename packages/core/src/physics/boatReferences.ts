import type { BoatEffects, BoatTuning } from "./boatDynamics";
import { frictionLineCoefficient } from "./boatResistance";

const DEG = Math.PI / 180;
const KNOT = 1852 / 3600;

/** The published hulls {@link boatFromReference} knows. */
export type BoatReferenceId = "holtrop-mennen-1982" | "speedboat-6m" | "kvlcc2-l7";

/** Every id {@link boatFromReference} accepts. */
export const BOAT_REFERENCE_IDS: readonly BoatReferenceId[] = ["holtrop-mennen-1982", "speedboat-6m", "kvlcc2-l7"];

/** Holtrop and Mennen's (1982) worked example: a 205 m single-screw ship with bulb, transom and a B-series screw. */
function holtropExample(): BoatTuning {
  const length = 205;
  const draft = 10;
  const volume = 37500;
  const massKg = 1025 * volume;
  const diameter = 8;
  return {
    massKg,
    length,
    beam: 32,
    // The simple model's numbers: net bollard pull and the speed where the screw stops pushing, at the design revs.
    maxThrust: 4.587e6,
    propSpeed: 19.62,
    steering: { kind: "rudder", area: 0.016 * length * draft },
    effects: {
      addedMass: {},
      resistance: {
        draft,
        volume,
        lcb: -0.75,
        bulbArea: 20,
        bulbCentre: 4,
        midshipCoefficient: 0.98,
        waterplaneCoefficient: 0.75,
        transomArea: 16,
        sternShape: 10,
        appendages: [{ area: 50, formFactor: 1.5 }],
      },
      // The paper prints no pitch; 1.0385 gives its K_T 0.18802 at its advance ratio on the full-scale B-series curve.
      propeller: {
        diameter,
        openWater: { kind: "bseries", blades: 4, areaRatio: 0.7393, pitchRatio: 1.0385, fullScaleRoughness: 30e-6 },
        wake: 0.2584,
        thrustDeduction: 0.1747,
        engine: { maxRevs: 1.6594 },
      },
      seakeeping: {},
    },
  };
}

/**
 * A 6 m outboard speedboat: 900 kg on a 2.3 m chine beam, 18° deadrise prismatic bottom with G 38% of the length
 * forward of the transom, a 150 hp outboard (100 kW at the propeller, 2:1 gearing to 46.7 rev/s) swinging a 3-blade
 * 0.35 m B-series screw of pitch ratio 1.3.
 */
function speedboat(): BoatTuning {
  const length = 6;
  return {
    massKg: 900,
    length,
    beam: 2.3,
    maxThrust: 7000,
    propSpeed: 30,
    planingSpeed: 8,
    steering: { kind: "outboard" },
    effects: {
      addedMass: {},
      planing: { deadrise: 18 * DEG, lcg: 0.38 * length, vcg: 0.45 },
      propeller: {
        diameter: 0.35,
        openWater: { kind: "bseries", blades: 3, areaRatio: 0.6, pitchRatio: 1.3 },
        wake: 0.03,
        thrustDeduction: 0.05,
        position: -0.5,
        engine: { maxRevs: 46.7, maxPower: 100e3 },
      },
      seakeeping: {},
    },
  };
}

/**
 * The KVLCC2 L7 free-running model (1/45.7, MARIN) in the MMG standard method with Yasukawa and Yoshimura's (2015)
 * coefficients. `R'0` is the L3 captive value (0.022 at 0.76 m/s) carried to L7 with a constant form factor on
 * Schoenherr's line; the propeller is held at the revolutions that self-propel the model at 15.5 kn full scale.
 */
function kvlcc2(): BoatTuning {
  const length = 7;
  const draft = 0.46;
  const scale = 45.7;
  const density = 1000;
  const viscosity = 1.1386e-6;
  const l3Area = 27194 / 110 ** 2;
  const formFactor = (0.022 * 2.902 * 0.189) / l3Area / frictionLineCoefficient("schoenherr", (0.76 * 2.902) / viscosity);
  const speed = (15.5 * KNOT) / Math.sqrt(scale);
  const resistance = (formFactor * frictionLineCoefficient("schoenherr", (speed * length) / viscosity) * (27194 / scale ** 2)) / (length * draft);
  const diameter = 0.216;
  const thrust = [0.2931, -0.2753, -0.1385] as const;
  const wake = 0.4;
  const thrustDeduction = 0.22;
  // Self-propulsion: (1 − t)·ρn²D⁴·K_T(J) = R'0·½ρLdU², a quadratic in n.
  const inflow = (speed * (1 - wake)) / diameter;
  const c = thrust[2] * inflow * inflow - (0.5 * density * length * draft * speed * speed * resistance) / ((1 - thrustDeduction) * density * diameter ** 4);
  const b = thrust[1] * inflow;
  const revs = (-b + Math.sqrt(b * b - 4 * thrust[0] * c)) / (2 * thrust[0]);
  const half = 0.5 * density * length * length * draft;
  const zeroThrust = (-thrust[1] - Math.sqrt(thrust[1] * thrust[1] - 4 * thrust[2] * thrust[0])) / (2 * thrust[2]);
  return {
    massKg: density * 3.27,
    length,
    beam: 1.27,
    maxThrust: (1 - thrustDeduction) * density * revs * revs * diameter ** 4 * thrust[0],
    propSpeed: (zeroThrust * revs * diameter) / (1 - wake),
    steering: { kind: "rudder", area: 0.0539, maxAngle: 35 * DEG },
    steerRate: 1.76 * DEG * Math.sqrt(scale),
    water: { density, viscosity },
    effects: {
      addedMass: { surge: 0.022 * half, sway: 0.223 * half, yaw: 0.011 * half * length * length, centreOfGravity: 0.25, yawRadius: 0.25 * length },
      resistance: { coefficient: resistance, draft },
      propeller: {
        diameter,
        openWater: { kind: "polynomial", thrust },
        wake,
        thrustDeduction,
        position: -0.48,
        wakeChange: { c1: 2, c2Positive: 1.6, c2Negative: 1.1 },
        engine: { maxRevs: revs },
      },
      manoeuvring: {
        draft,
        derivatives: {
          Xvv: -0.04, Xvr: 0.002, Xrr: 0.011, Xvvvv: 0.771,
          Yv: -0.315, Yr: 0.083, Yvvv: -1.607, Yvvr: 0.379, Yvrr: -0.391, Yrrr: 0.008,
          Nv: -0.137, Nr: -0.049, Nvvv: -0.03, Nvvr: -0.294, Nvrr: 0.055, Nrrr: -0.013,
        },
        rudder: {
          area: 0.0539,
          height: 0.345,
          position: -0.5,
          deduction: 0.387,
          hullForceFactor: 0.312,
          hullForcePosition: -0.464,
          straighteningNegative: 0.395,
          straighteningPositive: 0.64,
          inflowLever: -0.71,
          wakeRatio: 1.09,
          raceFactor: 0.5,
          liftSlope: 2.747,
        },
      },
      seakeeping: {},
    },
  };
}

/** Changes to a class's defaults: any top-level number, and per effect the parameters or `strength` to change. */
export type BoatOverrides = Partial<Omit<BoatTuning, "effects">> & { effects?: { [K in keyof BoatEffects]?: Partial<NonNullable<BoatEffects[K]>> } };

function merged<T extends object>(base: T | undefined, change: Partial<T> | undefined): T | undefined {
  return base === undefined || change === undefined ? base : { ...base, ...change };
}

/**
 * The full tuning of a published hull class with every effect it has data for at full strength (added mass, resistance
 * or planing, propeller and engine, MMG manoeuvring where published, seakeeping on a Wigley hull of its proportions),
 * so a game gets a real boat in one line and tunes from there: `createBoatDynamics(boatFromReference("speedboat-6m"))`.
 * `overrides` change the class's numbers and each effect's parameters or `strength` (`0` off … `1` as measured), so a
 * fleet is data: one record per boat from a class plus a few overrides. An override retunes an effect the class has;
 * add a new effect on the result. `bun run perf boat` checks each class against its reference sim.
 * @capability boat-dynamics a published hull class (6 m speedboat, KVLCC2 tanker model, Holtrop–Mennen ship) with every effect at full strength, plus per-boat overrides
 */
export function boatFromReference(id: BoatReferenceId, overrides: BoatOverrides = {}): BoatTuning {
  const base = id === "holtrop-mennen-1982" ? holtropExample() : id === "speedboat-6m" ? speedboat() : kvlcc2();
  const { effects: changes, ...numbers } = overrides;
  const effects = base.effects ?? {};
  const out: BoatEffects = {};
  const addedMass = merged(effects.addedMass, changes?.addedMass);
  const resistance = merged(effects.resistance, changes?.resistance);
  const planing = merged(effects.planing, changes?.planing);
  const propeller = merged(effects.propeller, changes?.propeller);
  const manoeuvring = merged(effects.manoeuvring, changes?.manoeuvring);
  const seakeeping = merged(effects.seakeeping, changes?.seakeeping);
  if (addedMass !== undefined) out.addedMass = addedMass;
  if (resistance !== undefined) out.resistance = resistance;
  if (planing !== undefined) out.planing = planing;
  if (propeller !== undefined) out.propeller = propeller;
  if (manoeuvring !== undefined) out.manoeuvring = manoeuvring;
  if (seakeeping !== undefined) out.seakeeping = seakeeping;
  return { ...base, ...numbers, effects: out };
}
