import { type AircraftAssistTuning, type GripCurve, type RigidAircraftTuning, type VehicleSpec } from "@jgengine/core/world";

export type VehicleHandling =
  | { type: "ground"; tuning: VehicleSpec }
  | {
      type: "aircraft";
      /** Wings, a rotor, or a VTOL that switches between its lift rotors and its wings. */
      kind: AircraftKind;
      tuning: RigidAircraftTuning;
      /** Level-flight top speed at full throttle (m/s): the dash's dial range. */
      topSpeed: number;
      /** Thrust multiplier while the afterburner key is held; absent = no afterburner. */
      afterburner?: number;
    };

export type AircraftKind = "fixedWing" | "rotorcraft" | "vtol";

export interface VehicleDef {
  id: string;
  label: string;
  body: string;
  cabin: string;
  price: number;
  dynamics: VehicleHandling;
  /** Body radius (world units) the driving obstacle clamp inflates solids by, and the crash/knockdown reach (#1051). */
  collisionRadius: number;
}

/**
 * The data-first ground-car spec (#1051): a mass-and-force chassis (`massKg`/`engineForce`/`brakeForce`/
 * `tireGrip`/`comHeight`/`trackWidth`) plus steering geometry and top speed. The
 * builder below turns each row into a {@link VehicleSpec} for the engine's one car sim, so a heavy
 * high-CoM bus and a light low-CoM sports car drive measurably differently from their numbers rather
 * than from hand-tuned per-car constants. Aircraft stay on their own tuning.
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
  /** Aero downforce area, m² (grip gain with speed); default 0.3, sport ~0.5. */
  downforce?: number;
  /** Max steering lock, rad; default 0.58, bus tighter-locked (0.42) for a wide circle. */
  maxAngle?: number;
  /** Gearbox ratios; default is a 6-speed, SUV a 5-speed, bus a 4-speed. */
  gears?: readonly number[];
  /** Redline rpm; default 7600, bus ~4600. */
  redlineRpm?: number;
  /** Torque curve; muscle overrides with a punchy low end that chirps on launch. */
  torqueCurve?: GripCurve;
}

/** Street torque: strong enough off-idle that launch is not a crawl. */
const TORQUE_DEFAULT: GripCurve = { points: [[0, 0.78], [0.28, 0.94], [0.55, 1], [0.85, 0.9], [1, 0.6]] };
/** Fat low-end so a muscle car saturates its friction budget off the line and wheelspins. */
const TORQUE_MUSCLE: GripCurve = { points: [[0, 0.94], [0.28, 1], [0.6, 0.95], [0.82, 0.86], [1, 0.6]] };

const GEARS_DEFAULT: readonly number[] = [3.2, 2.18, 1.57, 1.21, 0.97, 0.8];
const GEARS_SUV: readonly number[] = [3.4, 2.1, 1.45, 1.05, 0.82];
const GEARS_BUS: readonly number[] = [4.2, 2.3, 1.4, 0.95];

/** Speed the steering lock is quoted at: `turnRate` there puts full lock on the car's own geometry. */
const TURN_SPEED = 7;

function car(spec: CarSpec): VehicleSpec {
  const maxAngle = spec.maxAngle ?? 0.58;
  return {
    tires: {
      // Street cars on real tyre μ, a little looser than arcade so launch bite and handbrake slides read
    // as player skill, not ESC.
      drift: 0.3,
      grip: spec.tireGrip,
    },
    chassis: {
      bodyRoll: 0.4,
      weight: spec.massKg,
      comHeight: spec.comHeight,
      trackWidth: spec.trackWidth,
      wheelbase: spec.wheelbase,
      downforce: spec.downforce ?? 0.3,
    },
    brakes: {
      abs: 0.55,
      brake: spec.brakeForce / spec.massKg,
      handbrakeGrip: spec.handbrakeGrip,
    },
    aids: { tractionControl: 0.32725, stability: 0.73 },
    steering: {
      selfAlign: 0.5175,
      steerRate: 3.5,
      turnRate: (Math.tan(maxAngle) * TURN_SPEED) / spec.wheelbase,
      turnSpeed: TURN_SPEED,
    },
    engine: {
      topSpeed: spec.topSpeed,
      accel: spec.engineForce / spec.massKg,
      // Reverse top is a hard, low ceiling (~10–16 mph): useful for three-points, never scaled up for sports cars.
      reverseSpeed: Math.min(7, Math.max(4.5, Math.round(spec.topSpeed * 0.16 * 10) / 10)),
      // Lifting off scrubs speed like a real car rolling on its tyres, on top of engine braking.
      coast: 1.2,
      gearbox: {
        gears: spec.gears ?? GEARS_DEFAULT,
        idleRpm: 850,
        redlineRpm: spec.redlineRpm ?? 7600,
        shiftSeconds: 0.12,
        wheelRadius: 0.34,
        torqueCurve: spec.torqueCurve ?? TORQUE_DEFAULT,
      },
    },
  };
}

/**
 * Fleet forces are tuned so a midsize (cruiser/SUV class) hits ~10–13 m/s after 2 s full throttle
 * from rest, reverse stays crawl-useful (~0.2× top), and handbrakeGrip leaves enough bite for
 * controlled rear-lock slides.
 */
const CAR_SPECS: readonly CarSpec[] = [
  { id: "car_compact", label: "Pico", body: "#f2c14e", cabin: "#26292f", price: 800, massKg: 1150, engineForce: 9800, brakeForce: 11000, tireGrip: 0.92, comHeight: 0.56, trackWidth: 1.48, wheelbase: 2.42, topSpeed: 34, handbrakeGrip: 0.28, collisionRadius: 1.4 },
  { id: "car_muscle", label: "Bandolero", body: "#d64545", cabin: "#26292f", price: 2400, massKg: 1650, engineForce: 15500, brakeForce: 14000, tireGrip: 0.88, comHeight: 0.52, trackWidth: 1.6, wheelbase: 2.75, topSpeed: 42, handbrakeGrip: 0.22, collisionRadius: 1.4, torqueCurve: TORQUE_MUSCLE },
  { id: "car_sport", label: "Cicada GT", body: "#33c1b1", cabin: "#1f2228", price: 6500, massKg: 1350, engineForce: 14200, brakeForce: 17000, tireGrip: 1.08, comHeight: 0.44, trackWidth: 1.62, wheelbase: 2.58, topSpeed: 52, handbrakeGrip: 0.24, collisionRadius: 1.4, downforce: 0.5 },
  { id: "car_cop", label: "HHPD Cruiser", body: "#e8ecf2", cabin: "#1b2f52", price: 0, massKg: 1750, engineForce: 13800, brakeForce: 15500, tireGrip: 0.95, comHeight: 0.55, trackWidth: 1.6, wheelbase: 2.79, topSpeed: 40, handbrakeGrip: 0.26, collisionRadius: 1.4 },
  { id: "car_suv", label: "Vagabond", body: "#6b7d52", cabin: "#20242c", price: 3800, massKg: 2350, engineForce: 15200, brakeForce: 16500, tireGrip: 0.82, comHeight: 0.98, trackWidth: 1.66, wheelbase: 2.85, topSpeed: 36, handbrakeGrip: 0.3, collisionRadius: 1.6, gears: GEARS_SUV },
  { id: "car_bus", label: "Islander", body: "#e0a53c", cabin: "#2a2d34", price: 9000, massKg: 11000, engineForce: 34000, brakeForce: 50000, tireGrip: 0.68, comHeight: 1.35, trackWidth: 2.05, wheelbase: 7.2, topSpeed: 24, handbrakeGrip: 0.48, collisionRadius: 2.6, maxAngle: 0.42, gears: GEARS_BUS, redlineRpm: 4600 },
];

const AIR_DENSITY = 1.225;
const GRAVITY = 9.81;

interface WingSpec {
  massKg: number;
  /** Total wing area, m². */
  wingArea: number;
  span: number;
  length: number;
  maxThrust: number;
  /** Speed the wing incidence trims level flight at hands-off, m/s. */
  cruise: number;
  /** Where full throttle meets drag, m/s. */
  topSpeed: number;
  stallAngle?: number;
  /** Aileron, elevator and rudder authority (AoA per rad of deflection). */
  roll: number;
  pitch: number;
  yaw: number;
  spoolRate?: number;
  assists: AircraftAssistTuning;
}

/**
 * A rigid-body airframe from a few real numbers: two wing panels trimmed for `cruise`, a tailplane and a fin
 * on a tail arm, inertia from span and length, and a drag area that puts top speed where `maxThrust` meets
 * drag. The jgengine-world `flight-feel` recipe is the derivation.
 */
function wingAirframe(spec: WingSpec): RigidAircraftTuning {
  const slope = 5;
  const panel = spec.wingArea / 2;
  const incidence = (spec.massKg * GRAVITY) / (0.5 * AIR_DENSITY * spec.cruise * spec.cruise * spec.wingArea * slope);
  const tailArm = spec.length * 0.45;
  const tailArea = spec.wingArea * 0.2;
  const finArea = spec.wingArea * 0.1;
  const surfaceDrag = 0.02 * (spec.wingArea + tailArea + finArea);
  const dragArea = Math.max(0.05, (2 * spec.maxThrust) / (AIR_DENSITY * spec.topSpeed * spec.topSpeed) - surfaceDrag);
  const wing = { area: panel, liftSlope: slope, stallAngle: spec.stallAngle ?? 0.28, postStallLift: 0.55, incidence, control: { roll: spec.roll } };
  return {
    massKg: spec.massKg,
    inertia: { roll: spec.massKg * (spec.span / 4) ** 2, pitch: spec.massKg * (spec.length / 4) ** 2, yaw: spec.massKg * (spec.length / 4) ** 2 * 1.4 },
    surfaces: [
      { at: [spec.span / 4, 0, 0], ...wing },
      { at: [-spec.span / 4, 0, 0], ...wing },
      { at: [0, 0.1, -tailArm], area: tailArea, liftSlope: 4.2, control: { pitch: spec.pitch } },
      { at: [0, 0.6, -tailArm], normal: [1, 0, 0], area: finArea, liftSlope: 3.5, control: { yaw: spec.yaw } },
    ],
    engine: { maxThrust: spec.maxThrust, spoolRate: spec.spoolRate ?? 1.5 },
    controls: { pitch: { maxDeflection: 0.4, rate: 3 }, roll: { maxDeflection: 0.4, rate: 4 }, yaw: { maxDeflection: 0.4, rate: 3 } },
    dragArea,
    gear: { height: 1.1, sideGrip: 6 },
    assists: spec.assists,
  };
}

// Keyboard pilots: rate damping and a gentle wings-level hands-off on every plane, firmer on the trainer.
const PLANE_ASSISTS: AircraftAssistTuning = { sas: { pitch: 0.5, roll: 0.4, yaw: 0.6 }, autoLevel: 0.45, maxG: 6 };

const AIRCRAFT: readonly VehicleDef[] = [
  {
    id: "air_helicopter",
    label: "Maverick 44",
    body: "#e7e9ee",
    cabin: "#17202b",
    price: 12000,
    collisionRadius: 2.2,
    dynamics: {
      type: "aircraft",
      kind: "rotorcraft",
      topSpeed: 62,
      // A light single-rotor helicopter: about 0.55 collective carries it, a third of right pedal holds the
      // nose against rotor torque, and full SAS with hover hold keeps it parked hands-off.
      tuning: {
        massKg: 1450,
        inertia: { pitch: 4000, yaw: 4500, roll: 1500 },
        surfaces: [
          { at: [0, 0.4, -6.2], area: 0.8, liftSlope: 3 },
          { at: [0, 0.6, -6.6], normal: [1, 0, 0], area: 1, liftSlope: 3 },
        ],
        rotor: { maxThrust: 26000, radius: 5.1, at: [0, 1.5, 0], torque: 10000, damping: 3500, spoolRate: 0.9, cyclic: 0.2, tail: { maxThrust: 2500, at: [0, 0, -7.5] } },
        controls: { pitch: { rate: 1.5 }, roll: { rate: 1.5 }, yaw: { rate: 2 } },
        dragArea: 2.4,
        gear: { height: 1 },
        assists: { sas: { pitch: 1, roll: 1, yaw: 1 }, hoverHold: 1 },
      },
    },
  },
  {
    id: "air_trainer",
    label: "Pelican Trainer",
    body: "#f4d35e",
    cabin: "#243447",
    price: 16000,
    collisionRadius: 2.4,
    dynamics: {
      type: "aircraft",
      kind: "fixedWing",
      topSpeed: 78,
      tuning: wingAirframe({ massKg: 750, wingArea: 22, span: 11, length: 7.5, maxThrust: 4200, cruise: 45, topSpeed: 78, roll: 0.35, pitch: 0.5, yaw: 0.5, assists: { ...PLANE_ASSISTS, autoLevel: 0.8 } }),
    },
  },
  {
    id: "air_prop",
    label: "Marlin Prop",
    body: "#e85d4a",
    cabin: "#e7f1f5",
    price: 26000,
    collisionRadius: 2.6,
    dynamics: {
      type: "aircraft",
      kind: "fixedWing",
      topSpeed: 105,
      tuning: wingAirframe({ massKg: 1100, wingArea: 18, span: 11, length: 8.5, maxThrust: 7000, cruise: 65, topSpeed: 105, roll: 0.4, pitch: 0.55, yaw: 0.55, assists: PLANE_ASSISTS }),
    },
  },
  {
    id: "air_jet",
    label: "Barracuda XR",
    body: "#697582",
    cabin: "#10151b",
    price: 90000,
    collisionRadius: 3,
    dynamics: {
      type: "aircraft",
      kind: "fixedWing",
      topSpeed: 190,
      afterburner: 1.55,
      tuning: wingAirframe({ massKg: 6000, wingArea: 40, span: 10, length: 14, maxThrust: 52000, cruise: 120, topSpeed: 190, stallAngle: 0.3, roll: 0.3, pitch: 0.6, yaw: 0.45, spoolRate: 1.2, assists: { ...PLANE_ASSISTS, autoLevel: 0.25, maxG: 8 } }),
    },
  },
  {
    id: "air_vtol",
    label: "Harrier V",
    body: "#3d5a45",
    cabin: "#111b18",
    price: 110000,
    collisionRadius: 3,
    dynamics: {
      type: "aircraft",
      kind: "vtol",
      topSpeed: 155,
      afterburner: 1.35,
      // A jump jet: its lift rotors carry it in hover mode (collective on the throttle keys), then it switches
      // to the wings and the main engine. The lift fans counter-rotate, so they add no torque; the small tail
      // fan yaws it in a hover.
      tuning: {
        ...wingAirframe({ massKg: 7000, wingArea: 34, span: 9.5, length: 14, maxThrust: 52000, cruise: 100, topSpeed: 155, stallAngle: 0.3, roll: 0.45, pitch: 0.6, yaw: 0.45, assists: PLANE_ASSISTS }),
        rotor: { maxThrust: 7000 * GRAVITY * 1.7, radius: 2.4, at: [0, 0.5, 0], torque: 0, damping: 2500, spoolRate: 1.6, cyclic: 0.22, tail: { maxThrust: 6000, at: [0, 0, -6.5] } },
        assists: { sas: { pitch: 1, roll: 1, yaw: 0.8 }, autoLevel: 0.6, hoverHold: 0.8, maxG: 7 },
      },
    },
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
