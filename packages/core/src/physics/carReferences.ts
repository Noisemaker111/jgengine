import { TNO_205_60R15_TIRE } from "./tireMagicFormula";
import { ROAD_CAR_STEERING_COMPLIANCE } from "./vehicleAligningTorque";
import type { VehicleDynamicsTuning, VehicleEffectName, VehicleEffects } from "./vehicleDynamics";

const G = 9.81;
const DEG = Math.PI / 180;
/** The TNO tyre's friction scaled ×1.04 for a dry test track, set once from the MX-5's skidpad (as the reference cars run it). */
const ROAD = { lmux: 1.04, lmuy: 1.04 };

/** The published vehicles {@link carFromReference} knows: each has a multibody reference sim and published tests. */
export type CarReferenceVehicleId = "mazda-mx5-nd" | "scion-frs-2013" | "suzuki-gsxr1000-k1";

/** Vehicle classes: a published vehicle's measured effects carried to the class's typical size and drivetrain. */
export type CarClassId = "sports-car" | "hatchback" | "truck" | "kart" | "motorcycle";

/** Every id {@link carFromReference} accepts. */
export type CarReferenceId = CarReferenceVehicleId | CarClassId;

/** The published vehicles, each checked against its reference sim by `scripts/reference/physics/compareHandling.ts`. */
export const CAR_REFERENCE_VEHICLE_IDS: readonly CarReferenceVehicleId[] = ["mazda-mx5-nd", "scion-frs-2013", "suzuki-gsxr1000-k1"];

/** The vehicle classes. */
export const CAR_CLASS_IDS: readonly CarClassId[] = ["sports-car", "hatchback", "truck", "kart", "motorcycle"];

/** Every id {@link carFromReference} accepts: the published vehicles, then the classes. */
export const CAR_REFERENCE_IDS: readonly CarReferenceId[] = [...CAR_REFERENCE_VEHICLE_IDS, ...CAR_CLASS_IDS];

/**
 * 2016 Mazda MX-5 (ND) 2.0 manual with an 80 kg driver, from `realCars.ts`. Published: mass, 50:50, wheelbase,
 * steering ratio and lock, torque curve peaks, gear ratios, brakes' share. From the reference's linkage solve: roll
 * centres (0.119, 0.091 m), camber gain (0.67, 0.9 of roll), bump steer (0.053, −0.042 rad/rad), bushing and
 * steering compliance. Measured on the reference: roll gradient 4.12°/g and pitch gradient 2.88°/g set the body's
 * stiffness. Matched to the reference's ISO results where the runtime's one-track model is simpler than the multibody
 * car: the yaw index (0.85; 0.95 from the inertia, the rest stands for the reference's lagged roll), the relaxation
 * length (0.7 m; the carcass, bushing and steering-column lags together) and the aligning torque's effective caster
 * trail (6 mm against the linkage's 16 mm; kingpin inclination and scrub take part of the moment).
 */
function mx5(): VehicleDynamicsTuning {
  const massKg = 1138;
  const comHeight = 0.45;
  const rollArm = comHeight - (0.119 + (0.091 - 0.119) * 0.5);
  return {
    massKg,
    wheelbase: 2.31,
    frontWeight: 0.5,
    comHeight,
    trackWidth: 1.5,
    yawInertiaIndex: 0.85,
    // The Magic Formula at the static wheel load: what the tyre is with the `magicFormula` dial at 0.
    front: { peakGrip: 0.952, peakSlipAngle: 0.158, slideGrip: 0.874, longitudinalGrip: 1.11, corneringStiffness: 15.33 },
    driveFront: 0,
    powertrain: {
      kind: "gearbox",
      peakTorque: 201,
      torqueCurve: { points: [[0, 0.68], [0.041, 0.697], [0.207, 0.846], [0.372, 0.92], [0.537, 0.98], [0.636, 1], [0.785, 0.96], [0.868, 0.92], [1, 0.82]] },
      idleRpm: 750,
      redlineRpm: 6800,
      shiftUpRpm: 6650,
      shiftDownRpm: 2720,
      shiftSeconds: 0.25,
      gears: [5.087, 2.991, 2.035, 1.594, 1.286, 1],
      reverseGear: 4,
      finalDrive: 2.866,
      wheelRadius: 0.308,
      efficiency: 0.92,
      engineBrakeTorque: 25,
      launchRpm: 4000,
    },
    brakeForce: 5000 / 0.308,
    brakeFront: 0.68,
    steering: { maxAngle: (1.3 * 2 * Math.PI) / 15, rate: 8 / 15 },
    rollStiffness: (massKg * G * rollArm) / (4.12 * DEG),
    pitchStiffness: (massKg * G * comHeight) / (2.88 * DEG),
    effects: {
      magicFormula: { coefficients: ROAD },
      combinedSlip: {},
      wheelSlide: {},
      longitudinalLoadTransfer: {},
      lateralLoadTransfer: { frontShare: 0.54 },
      suspensionKinematics: { rollCentreFront: 0.119, rollCentreRear: 0.091, rollStiffnessFront: 0.532, rollFollowFront: 0.673, rollFollowRear: 0.905 },
      tireRelaxation: { length: 0.7 },
      camber: { static: -0.022, thrust: 0.83 },
      complianceSteer: { front: (0.15 * DEG) / 1000 / 2, rear: -(0.05 * DEG) / 1000 / 2 },
      rollSteer: { front: 0.053, rear: -0.042 },
      aligningTorque: { compliance: ROAD_CAR_STEERING_COMPLIANCE, casterTrail: 0.006 },
      aeroDrag: { area: 0.6, sideArea: 2.4 },
      rollingResistance: { coefficient: 0.00702, speedTerms: { linear: 0.001515, quartic: 8.514e-5, referenceSpeed: 16.7 } },
      rotatingInertia: { engine: 0.13, wheels: 4.6 },
      torqueCurve: { curve: [[1000, 140], [2000, 170], [3000, 185], [4000, 197], [4600, 201], [5500, 193], [6000, 185], [6800, 165]] },
      differential: { kind: "clutch", preload: 50, powerLock: 0.3, coastLock: 0.5, slipStiffness: 24.5 },
      brakeLag: { seconds: 0.03 },
      brakeFade: {},
      roadFriction: {},
      abs: { strength: 1, holds: 0.97 },
      // The reference driver's launch holds the driven wheels at peak slip.
      tractionControl: { strength: 1, holds: 0.98 },
    },
  };
}

/**
 * 2013 Scion FR-S (Toyota 86) manual with an 80 kg driver, from `realCars.ts`, built the way the MX-5 is: linkage
 * solve for roll centres (0.084, 0.086 m), camber gain and bump steer; roll gradient 3.45°/g and pitch gradient
 * 1.67°/g measured on its reference; the MX-5's matched yaw index, relaxation length and trail share.
 */
function frs(): VehicleDynamicsTuning {
  const massKg = 1331;
  const comHeight = 0.46;
  const rollArm = comHeight - (0.084 + (0.086 - 0.084) * 0.47);
  const curve: readonly (readonly [number, number])[] = [[1000, 130], [2000, 160], [3000, 180], [3800, 172], [4400, 175], [5000, 190], [6000, 200], [6500, 205], [7000, 200], [7400, 190]];
  return {
    massKg,
    wheelbase: 2.57,
    frontWeight: 0.53,
    comHeight,
    trackWidth: 1.53,
    yawInertiaIndex: 0.85,
    front: { peakGrip: 0.945, peakSlipAngle: 0.16, slideGrip: 0.874, longitudinalGrip: 1.1, corneringStiffness: 15 },
    driveFront: 0,
    powertrain: {
      kind: "gearbox",
      peakTorque: 205,
      torqueCurve: { points: curve.map(([rpm, torque]) => [Math.max(0, (rpm - 700) / (7400 - 700)), torque / 205] as const) },
      idleRpm: 700,
      redlineRpm: 7400,
      shiftUpRpm: 7250,
      shiftDownRpm: 2960,
      shiftSeconds: 0.25,
      gears: [3.626, 2.188, 1.541, 1.213, 1, 0.767],
      reverseGear: 3.4,
      finalDrive: 4.1,
      wheelRadius: 0.31,
      efficiency: 0.92,
      launchRpm: 4500,
    },
    brakeForce: 5500 / 0.31,
    brakeFront: 0.66,
    steering: { maxAngle: (1.25 * 2 * Math.PI) / 13.1, rate: 8 / 13.1 },
    rollStiffness: (massKg * G * rollArm) / (3.45 * DEG),
    pitchStiffness: (massKg * G * comHeight) / (1.67 * DEG),
    effects: {
      magicFormula: { coefficients: ROAD },
      combinedSlip: {},
      wheelSlide: {},
      longitudinalLoadTransfer: {},
      lateralLoadTransfer: { frontShare: 0.54 },
      suspensionKinematics: { rollCentreFront: 0.084, rollCentreRear: 0.086, rollStiffnessFront: 0.54, rollFollowFront: 0.76, rollFollowRear: 0.916 },
      tireRelaxation: { length: 0.7 },
      camber: { static: -0.016, thrust: 0.83 },
      complianceSteer: { front: (0.15 * DEG) / 1000 / 2, rear: -(0.05 * DEG) / 1000 / 2 },
      rollSteer: { front: 0.049, rear: -0.041 },
      aligningTorque: { compliance: ROAD_CAR_STEERING_COMPLIANCE, casterTrail: 0.0042 },
      aeroDrag: { area: 0.27 * 1.97, sideArea: 2.4 },
      rollingResistance: { coefficient: 0.00702, speedTerms: { linear: 0.001515, quartic: 8.514e-5, referenceSpeed: 16.7 } },
      rotatingInertia: { engine: 0.14, wheels: 4.6 },
      torqueCurve: { curve },
      differential: { kind: "limitedSlip", bias: 1.8 },
      brakeLag: { seconds: 0.03 },
      brakeFade: {},
      roadFriction: {},
      abs: { strength: 1, holds: 0.97 },
      tractionControl: { strength: 1, holds: 0.98 },
    },
  };
}

/**
 * Suzuki GSX-R1000 K1 with its prone rider (Sharp, Evangelou & Limebeer 2004, plus MOTORRAD's wet weight), from
 * `realMotorcycles.ts`: mass, centre of mass and wheelbase from the published bodies, the published gearing and the
 * claimed torque peaks; the tyres' peak friction (μy 1.3, μx 1.37) and the 0.075 m mean crown radius from their
 * Magic Formula sets (`motorcycleTire.ts`). Matched to the multibody bike and its rider, whose roll the runtime's lean
 * stands for: the lean rate (1 rad/s), lean lag (0.2 s), countersteer, the rider's trim gain and the launch the rider
 * holds below wheelie (traction held to 0.76 of the rear's grip).
 */
function gsxr(): VehicleDynamicsTuning {
  const curve: readonly (readonly [number, number])[] = [[1000, 45], [3000, 70], [5000, 86], [7000, 100], [8500, 110], [10000, 107], [10800, 104], [12000, 93], [13000, 80]];
  return {
    massKg: 274.6,
    wheelbase: 1.41,
    frontWeight: 0.478,
    comHeight: 0.566,
    trackWidth: 0.7,
    yawInertiaIndex: 1,
    front: { peakGrip: 1.3, peakSlipAngle: 0.1, slideGrip: 0.8, longitudinalGrip: 1.37 },
    driveFront: 0,
    powertrain: {
      kind: "gearbox",
      peakTorque: 110,
      torqueCurve: { points: curve.map(([rpm, torque]) => [Math.max(0, (rpm - 1200) / (12800 - 1200)), torque / 110] as const) },
      idleRpm: 1200,
      redlineRpm: 12800,
      shiftUpRpm: 12650,
      shiftDownRpm: 5000,
      shiftSeconds: 0.15,
      gears: [2.687, 2.052, 1.681, 1.45, 1.304, 1.208].map((gear) => gear * 1.553),
      reverseGear: 2.687 * 1.553,
      finalDrive: 42 / 17,
      wheelRadius: 0.31,
      efficiency: 0.9,
      launchRpm: 7000,
    },
    brakeForce: 3900 / 0.31,
    brakeFront: 0.82,
    steering: { maxAngle: 0.5, rate: 2 },
    lean: { maxLean: 0.785, leanRate: 1, countersteer: 0.0267, trimGain: 6, leanLag: 0.2 },
    effects: {
      tireCrown: { radius: 0.075 },
      tractionControl: { strength: 1, holds: 0.76 },
      longitudinalLoadTransfer: {},
      wheelSlide: {},
      aeroDrag: { area: 0.48 * 0.65 },
      rollingResistance: { coefficient: 0.012 },
      torqueCurve: { curve },
      antiWheelie: {},
      antiStoppie: {},
    },
  };
}

/** A front-drive hatchback: the FR-S's measured effects on a typical 1.3 t, 61:39 front-driver with a turbo four (sizes are class estimates). */
function hatchback(): VehicleDynamicsTuning {
  const base = frs();
  const curve: readonly (readonly [number, number])[] = [[1000, 150], [1500, 250], [3500, 250], [5000, 230], [6000, 190], [6500, 170]];
  return {
    ...base,
    massKg: 1350,
    wheelbase: 2.62,
    frontWeight: 0.61,
    comHeight: 0.55,
    trackWidth: 1.54,
    driveFront: 1,
    powertrain: {
      kind: "gearbox",
      peakTorque: 250,
      torqueCurve: { points: curve.map(([rpm, torque]) => [Math.max(0, (rpm - 750) / (6500 - 750)), torque / 250] as const) },
      idleRpm: 750,
      redlineRpm: 6500,
      shiftUpRpm: 6350,
      shiftDownRpm: 2600,
      shiftSeconds: 0.3,
      gears: [3.62, 1.95, 1.28, 0.97, 0.78, 0.65],
      reverseGear: 3.4,
      finalDrive: 4.24,
      wheelRadius: 0.32,
      efficiency: 0.92,
      launchRpm: 3000,
    },
    rollStiffness: (1350 * G * 0.47) / (4 * DEG),
    pitchStiffness: (1350 * G * 0.55) / (2 * DEG),
    effects: {
      ...base.effects,
      lateralLoadTransfer: { frontShare: 0.6 },
      suspensionKinematics: { rollCentreFront: 0.084, rollCentreRear: 0.1, rollStiffnessFront: 0.6, rollFollowFront: 0.76, rollFollowRear: 1 },
      aeroDrag: { area: 0.65, sideArea: 2.6 },
      torqueCurve: { curve },
      differential: { kind: "open" },
    },
  };
}

/**
 * A two-axle heavy truck carrying its full mass: 18 t, 5 m wheelbase, a 1.5 m high centre of mass, a 2000 N·m diesel
 * through twelve gears, truck tyres (the TNO tyre carried to a 30 kN nominal load and 0.52 m radius), beam axles and
 * drum brakes that fade. Sizes are class estimates; the effects are the reference car's terms.
 */
function truck(): VehicleDynamicsTuning {
  const massKg = 18000;
  const comHeight = 1.5;
  const curve: readonly (readonly [number, number])[] = [[600, 1200], [1000, 2000], [1500, 2000], [1900, 1700], [2200, 1300]];
  return {
    massKg,
    wheelbase: 5,
    frontWeight: 0.35,
    comHeight,
    trackWidth: 2.05,
    yawInertiaIndex: 1.1,
    front: { peakGrip: 0.8, peakSlipAngle: 0.17, slideGrip: 0.85, longitudinalGrip: 0.85, corneringStiffness: 9 },
    driveFront: 0,
    powertrain: {
      kind: "gearbox",
      peakTorque: 2000,
      torqueCurve: { points: curve.map(([rpm, torque]) => [Math.max(0, (rpm - 600) / (2200 - 600)), torque / 2000] as const) },
      idleRpm: 600,
      redlineRpm: 2200,
      shiftUpRpm: 1900,
      shiftDownRpm: 1000,
      shiftSeconds: 0.5,
      gears: [14.9, 11.7, 9.1, 7.1, 5.5, 4.3, 3.4, 2.6, 2.1, 1.6, 1.3, 1],
      reverseGear: 14,
      finalDrive: 3.4,
      wheelRadius: 0.52,
      efficiency: 0.9,
      launchRpm: 1000,
    },
    brakeForce: massKg * 6,
    brakeFront: 0.4,
    steering: { maxAngle: 0.6, rate: 0.35 },
    rollStiffness: (massKg * G * comHeight) / (6 * DEG),
    pitchStiffness: (massKg * G * comHeight) / (2 * DEG),
    effects: {
      magicFormula: { coefficients: { fnomin: 30000, unloadedRadius: 0.52, lmux: 0.85, lmuy: 0.85 } },
      combinedSlip: {},
      wheelSlide: {},
      longitudinalLoadTransfer: {},
      lateralLoadTransfer: { frontShare: 0.45 },
      suspensionKinematics: { rollCentreFront: 0.6, rollCentreRear: 0.7, rollStiffnessFront: 0.45, rollFollowFront: 1, rollFollowRear: 1 },
      tireRelaxation: { length: 1.2 },
      complianceSteer: { front: 2e-7 },
      aligningTorque: { compliance: ROAD_CAR_STEERING_COMPLIANCE / 6, casterTrail: 0.03, tire: { fnomin: 30000, unloadedRadius: 0.52 } },
      aeroDrag: { area: 5.5, sideArea: 20 },
      rollingResistance: { coefficient: 0.006, speedTerms: { linear: 0.001, quartic: 0, referenceSpeed: 16.7 } },
      rotatingInertia: { engine: 3, wheels: 120 },
      torqueCurve: { curve },
      differential: { kind: "open" },
      brakeLag: { seconds: 0.25 },
      brakeFade: { heatCapacity: 180000, cooling: { rest: 20, perSpeed: 6 } },
      roadFriction: {},
      abs: { strength: 1, holds: 0.95 },
    },
  };
}

/**
 * A racing kart with its driver: 160 kg, 1.04 m wheelbase, 1.2 m track, a 0.25 m centre of mass, no suspension and a
 * solid rear axle (`locked`), direct drive from a 22 kW engine, sticky kart tyres (the TNO tyre carried to a 400 N
 * nominal load at 1.3× friction). Sizes are class estimates.
 */
function kart(): VehicleDynamicsTuning {
  const massKg = 160;
  return {
    massKg,
    wheelbase: 1.04,
    frontWeight: 0.42,
    comHeight: 0.25,
    trackWidth: 1.2,
    yawInertiaIndex: 0.9,
    front: { peakGrip: 1.3, peakSlipAngle: 0.12, slideGrip: 0.8, corneringStiffness: 18 },
    driveFront: 0,
    powertrain: { kind: "direct", maxForce: massKg * 9, maxPower: 22000, reverseScale: 0, coastForce: 60 },
    brakeForce: massKg * 9,
    brakeFront: 0,
    steering: { maxAngle: 0.45, rate: 4 },
    reverseSpeed: 0,
    rollStiffness: (massKg * G * 0.25) / (0.8 * DEG),
    pitchStiffness: (massKg * G * 0.25) / (0.6 * DEG),
    effects: {
      magicFormula: { coefficients: { ...TNO_205_60R15_TIRE, fnomin: 400, unloadedRadius: 0.14, lmux: 1.3, lmuy: 1.3 } },
      combinedSlip: {},
      wheelSlide: {},
      longitudinalLoadTransfer: {},
      lateralLoadTransfer: { frontShare: 0.5 },
      tireRelaxation: { length: 0.15 },
      aeroDrag: { area: 0.5, sideArea: 0.6 },
      rollingResistance: { coefficient: 0.012 },
      differential: { kind: "locked" },
      roadFriction: {},
    },
  };
}

function build(id: CarReferenceId): VehicleDynamicsTuning {
  switch (id) {
    case "mazda-mx5-nd":
    case "sports-car":
      return mx5();
    case "scion-frs-2013":
      return frs();
    case "suzuki-gsxr1000-k1":
    case "motorcycle":
      return gsxr();
    case "hatchback":
      return hatchback();
    case "truck":
      return truck();
    case "kart":
      return kart();
  }
}

/** Changes to a vehicle's defaults: any top-level number, and per effect the parameters or `strength` to change (`false` removes it). */
export type CarOverrides = Partial<Omit<VehicleDynamicsTuning, "effects">> & {
  effects?: { [Name in VehicleEffectName]?: Partial<NonNullable<VehicleEffects[Name]>> | false };
};

function retuneEffect<Name extends VehicleEffectName>(effects: VehicleEffects, name: Name, change: Partial<NonNullable<VehicleEffects[Name]>> | false | undefined): void {
  if (change === false) {
    delete effects[name];
    return;
  }
  const base = effects[name];
  if (change === undefined || base === undefined) return;
  effects[name] = { ...base, ...change };
}

function hasEffect(changes: object, key: string): key is VehicleEffectName {
  return Object.hasOwn(changes, key);
}

/**
 * The full tuning of a published vehicle or a class with every effect it has data for at strength 1 (the Magic
 * Formula tyre at each wheel's load, weight transfer through roll centres, aligning torque, aero with a crosswind side
 * area, Magic Formula rolling resistance, the published torque curve and gearing, the differential, brake fade, road
 * friction and the aids), so a game gets a real car in one line and tunes from there:
 * `createVehicleDynamics(carFromReference("mazda-mx5-nd"))`. `overrides` change the vehicle's numbers and each
 * effect's parameters or `strength` (`0` off … `1` as measured … `4` the top of the sane range), so a fleet is data:
 * one record per car from a class plus a few overrides. An override retunes an effect the vehicle has; add a new one
 * with `withVehicleEffects` on the result. `scripts/reference/physics/compareHandling.ts` checks each published
 * vehicle against its reference sim.
 * @capability vehicle-references a published car or bike (MX-5, FR-S, GSX-R1000) or a class (sports car, hatchback, truck, kart, motorcycle) with every effect at full strength, plus per-car overrides
 */
export function carFromReference(id: CarReferenceId, overrides: CarOverrides = {}): VehicleDynamicsTuning {
  const base = build(id);
  const { effects: changes, ...numbers } = overrides;
  const effects: VehicleEffects = { ...base.effects };
  if (changes !== undefined) for (const key of Object.keys(changes)) if (hasEffect(changes, key)) retuneEffect(effects, key, changes[key]);
  return { ...base, ...numbers, effects };
}
