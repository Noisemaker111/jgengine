import type { AircraftTuning, GripCurve, KinematicVehicleTuning } from "@jgengine/core/world";

export type VehicleDynamics =
  | { type: "ground"; tuning: KinematicVehicleTuning }
  | { type: "aircraft"; tuning: AircraftTuning };

export interface VehicleDef {
  id: string;
  label: string;
  body: string;
  cabin: string;
  price: number;
  dynamics: VehicleDynamics;
  /** Body radius (world units) the driving obstacle clamp inflates solids by, and the crash/knockdown reach (#1051). */
  collisionRadius: number;
}

/**
 * The data-first ground-car spec (#1051): a mass-and-force chassis (`massKg`/`engineForce`/`brakeForce`/
 * `engineBrakeForce`/`tireGrip`/`comHeight`/`trackWidth`) plus steering geometry and top speed. The
 * builder below turns each row into a full {@link KinematicVehicleTuning} with a chassis block, so a
 * heavy high-CoM bus and a light low-CoM sports car drive measurably differently from their numbers
 * rather than from hand-tuned per-car acceleration constants. Aircraft stay on their own tuning.
 */
interface CarSpec {
  id: string;
  label: string;
  body: string;
  cabin: string;
  price: number;
  massKg: number;
  /** Peak drive force at the wheels, N. */
  engineForce: number;
  /** Peak service-brake force, N (brake g = brakeForce / (massKg·g), kept in [0.35, 1.3]). */
  brakeForce: number;
  /** Coast drag force at throttle 0, N (engine braking). */
  engineBrakeForce: number;
  /** Peak tyre μ on an ideal surface (~0.9 street, ~1.1 sport, ~0.7 bus). */
  tireGrip: number;
  /** Centre-of-mass height, m — taller washes out earlier and leans more. */
  comHeight: number;
  /** Track width, m — wider resists lateral weight transfer. */
  trackWidth: number;
  /** Steering wheelbase, m; drives the turning circle with `maxAngle`. */
  wheelbase: number;
  /** Top forward speed, world units/s. */
  topSpeed: number;
  /** Lateral grip retained under handbrake (lower = looser slides). */
  handbrakeGrip: number;
  collisionRadius: number;
  /** Aero downforce (grip gain with speed); default 0.32, sport ~0.5. */
  downforce?: number;
  /** Steering rack response; default 10, sport snappier (~12), bus lazy (~6). */
  steerResponse?: number;
  /** Max steering lock, rad; default 0.58, bus tighter-locked (0.42) for a wide circle. */
  maxAngle?: number;
  /** Gearbox ratios; default is a 6-speed, SUV a 5-speed, bus a 4-speed. */
  gears?: readonly number[];
  /** Redline rpm; default 7600, bus ~4600. */
  redlineRpm?: number;
  /** Torque curve; muscle overrides with a punchy low end that chirps on launch. */
  torqueCurve?: GripCurve;
}

const TORQUE_DEFAULT: GripCurve = { points: [[0, 0.55], [0.35, 0.88], [0.62, 1], [0.86, 0.9], [1, 0.58]] };
/** Fat low-end so a muscle car saturates its friction budget off the line and wheelspins. */
const TORQUE_MUSCLE: GripCurve = { points: [[0, 0.92], [0.28, 1], [0.6, 0.95], [0.82, 0.86], [1, 0.6]] };

const GEARS_DEFAULT: readonly number[] = [3.2, 2.18, 1.57, 1.21, 0.97, 0.8];
const GEARS_SUV: readonly number[] = [3.4, 2.1, 1.45, 1.05, 0.82];
const GEARS_BUS: readonly number[] = [4.2, 2.3, 1.4, 0.95];

function car(spec: CarSpec): KinematicVehicleTuning {
  const topSpeed = spec.topSpeed;
  const gears = spec.gears ?? GEARS_DEFAULT;
  const redlineRpm = spec.redlineRpm ?? 7600;
  const downforce = spec.downforce ?? 0.32;
  const steerResponse = spec.steerResponse ?? 10;
  const maxAngle = spec.maxAngle ?? 0.58;
  // Lateral grip-bleed strength tracks tyre μ so grippier cars hold a line and low-μ cars slide.
  const gripStrength = spec.tireGrip * 10;
  return {
    // Legacy arcade fallbacks (superseded by `chassis` below, but the type requires them): keep them
    // coherent as force/mass so a chassis-less consumer would still drive roughly right.
    engineAccel: spec.engineForce / spec.massKg,
    brakeAccel: spec.brakeForce / spec.massKg,
    topSpeed,
    reverseSpeed: Math.max(5, Math.round(topSpeed * 0.24)),
    turnRate: 2.3,
    turnSpeedRef: 7,
    gripStrength,
    handbrakeGrip: spec.handbrakeGrip,
    // Coast decay (throttle and brake both off). Firm enough that lifting off visibly scrubs speed
    // instead of gliding forever, but light enough to leave top speed and momentum character intact.
    rollingResistance: 0.15,
    chassis: {
      massKg: spec.massKg,
      engineForce: spec.engineForce,
      brakeForce: spec.brakeForce,
      engineBrakeForce: spec.engineBrakeForce,
      tireGrip: spec.tireGrip,
      comHeight: spec.comHeight,
      trackWidth: spec.trackWidth,
    },
    powertrain: {
      idleRpm: 850,
      redlineRpm,
      shiftUpRpm: redlineRpm - 700,
      shiftDownRpm: 2300,
      shiftSeconds: 0.14,
      finalDrive: 3.7,
      wheelRadius: 0.34,
      gears,
      torqueCurve: spec.torqueCurve ?? TORQUE_DEFAULT,
    },
    steering: {
      wheelbase: spec.wheelbase,
      maxAngle,
      highSpeedAngle: 0.15,
      highSpeedAt: topSpeed,
      response: steerResponse,
      yawDamping: 11,
    },
    dynamics: {
      aerodynamicDrag: 0.00045,
      downforce,
      tractionControl: 0.72,
      abs: 0.82,
      stabilityControl: 0.42,
      bodyPitchFactor: 0.008,
      bodyRollFactor: 0.012,
      maxBodyPitch: 0.1,
      maxBodyRoll: 0.14,
      attitudeResponse: 8,
    },
  };
}

const CAR_SPECS: readonly CarSpec[] = [
  { id: "car_compact", label: "Pico", body: "#f2c14e", cabin: "#26292f", price: 800, massKg: 1150, engineForce: 5200, brakeForce: 10500, engineBrakeForce: 2900, tireGrip: 0.92, comHeight: 0.56, trackWidth: 1.48, wheelbase: 2.42, topSpeed: 26, handbrakeGrip: 0.3, collisionRadius: 1.4 },
  { id: "car_muscle", label: "Bandolero", body: "#d64545", cabin: "#26292f", price: 2400, massKg: 1650, engineForce: 15000, brakeForce: 13500, engineBrakeForce: 4000, tireGrip: 0.88, comHeight: 0.52, trackWidth: 1.6, wheelbase: 2.75, topSpeed: 38, handbrakeGrip: 0.16, collisionRadius: 1.4, torqueCurve: TORQUE_MUSCLE },
  { id: "car_sport", label: "Cicada GT", body: "#33c1b1", cabin: "#1f2228", price: 6500, massKg: 1350, engineForce: 12800, brakeForce: 16500, engineBrakeForce: 3750, tireGrip: 1.08, comHeight: 0.44, trackWidth: 1.62, wheelbase: 2.58, topSpeed: 47, handbrakeGrip: 0.2, collisionRadius: 1.4, downforce: 0.5, steerResponse: 12 },
  { id: "car_cop", label: "VCPD Cruiser", body: "#e8ecf2", cabin: "#1b2f52", price: 0, massKg: 1750, engineForce: 10800, brakeForce: 14800, engineBrakeForce: 4200, tireGrip: 0.95, comHeight: 0.55, trackWidth: 1.6, wheelbase: 2.79, topSpeed: 41, handbrakeGrip: 0.22, collisionRadius: 1.4 },
  { id: "car_suv", label: "Vagabond", body: "#6b7d52", cabin: "#20242c", price: 3800, massKg: 2350, engineForce: 9200, brakeForce: 15500, engineBrakeForce: 4900, tireGrip: 0.82, comHeight: 0.98, trackWidth: 1.66, wheelbase: 2.85, topSpeed: 33, handbrakeGrip: 0.35, collisionRadius: 1.6, gears: GEARS_SUV },
  { id: "car_bus", label: "Islander", body: "#e0a53c", cabin: "#2a2d34", price: 9000, massKg: 11000, engineForce: 26000, brakeForce: 48000, engineBrakeForce: 13200, tireGrip: 0.68, comHeight: 1.35, trackWidth: 2.05, wheelbase: 7.2, topSpeed: 22, handbrakeGrip: 0.55, collisionRadius: 2.6, maxAngle: 0.42, steerResponse: 6, gears: GEARS_BUS, redlineRpm: 4600 },
];

const flightControls = {
  pitch: 0.95,
  roll: 1.45,
  yaw: 0.62,
  response: 4.8,
  damping: 0.72,
  stability: 0.62,
} as const;

const helicopterControls = {
  pitch: 0.72,
  roll: 0.9,
  yaw: 1.05,
  response: 4,
  damping: 1.15,
  stability: 1.25,
} as const;

const AIRCRAFT: readonly VehicleDef[] = [
  {
    id: "air_helicopter",
    label: "Maverick 44",
    body: "#e7e9ee",
    cabin: "#17202b",
    price: 12000,
    collisionRadius: 2.2,
    dynamics: { type: "aircraft", tuning: { kind: "rotorcraft", mass: 5.4, maxThrust: 19, maxSpeed: 62, drag: 0.032, sideDrag: 0.075, lift: 0, stallSpeed: 1, hoverThrust: 64, rotorResponse: 2.8, groundEffectHeight: 10, controls: helicopterControls } },
  },
  {
    id: "air_trainer",
    label: "Pelican Trainer",
    body: "#f4d35e",
    cabin: "#243447",
    price: 16000,
    collisionRadius: 2.4,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 4.6, maxThrust: 45, maxSpeed: 78, drag: 0.019, sideDrag: 0.04, lift: 12.4, stallSpeed: 11, controls: { ...flightControls, stability: 1.05 } } },
  },
  {
    id: "air_prop",
    label: "Marlin Prop",
    body: "#e85d4a",
    cabin: "#e7f1f5",
    price: 26000,
    collisionRadius: 2.6,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 5, maxThrust: 56, maxSpeed: 105, drag: 0.016, sideDrag: 0.035, lift: 13.2, stallSpeed: 14, controls: flightControls } },
  },
  {
    id: "air_jet",
    label: "Barracuda XR",
    body: "#697582",
    cabin: "#10151b",
    price: 90000,
    collisionRadius: 3,
    dynamics: { type: "aircraft", tuning: { kind: "fixedWing", mass: 6.8, maxThrust: 96, maxSpeed: 190, drag: 0.011, sideDrag: 0.024, lift: 15.5, stallSpeed: 25, afterburnerMultiplier: 1.55, controls: { ...flightControls, pitch: 1.25, roll: 2.05, yaw: 0.52, stability: 0.38 } } },
  },
  {
    id: "air_vtol",
    label: "Harrier V",
    body: "#3d5a45",
    cabin: "#111b18",
    price: 110000,
    collisionRadius: 3,
    dynamics: { type: "aircraft", tuning: { kind: "vtol", mass: 7.2, maxThrust: 88, maxSpeed: 155, drag: 0.014, sideDrag: 0.032, lift: 14.8, stallSpeed: 22, hoverThrust: 88, rotorResponse: 3.2, vtolTransitionSpeed: 38, afterburnerMultiplier: 1.35, controls: { ...flightControls, stability: 0.72 } } },
  },
];

export const VEHICLES: readonly VehicleDef[] = [
  ...CAR_SPECS.map(
    (spec): VehicleDef => ({
      id: spec.id,
      label: spec.label,
      body: spec.body,
      cabin: spec.cabin,
      price: spec.price,
      collisionRadius: spec.collisionRadius,
      dynamics: { type: "ground", tuning: car(spec) },
    }),
  ),
  ...AIRCRAFT,
];

export const vehicleById = (id: string): VehicleDef | undefined => VEHICLES.find((vehicle) => vehicle.id === id);

export function vehicleEntry() {
  return {
    role: "vehicle" as const,
    movement: { walkSpeed: 0 },
    stats: { health: { max: 300, min: 0 } },
    receive: { damage: { order: ["health"] } },
  };
}
