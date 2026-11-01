import { clamp } from "../math/scalar";
import { DEFAULT_GRIP_CURVE, gripCurvePeak, type GripCurve } from "./gripCurve";
import { withVehicleEffects, type VehicleDynamicsTuning, type VehicleEffectName, type VehicleEffects } from "./vehicleDynamics";

const GRAVITY = 9.81;

/** An optional gearbox for a {@link VehicleSpec}: the HUD gets a gear and rpm, and shifts cost a beat of drive. */
export interface VehicleSpecGearbox {
  /** Forward ratios, first to top. */
  gears: readonly number[];
  /** Redline rpm (default `7200`). */
  redlineRpm?: number;
  idleRpm?: number;
  /** Torque against normalised rpm (default a broad street curve). */
  torqueCurve?: GripCurve;
  /** Seconds a shift cuts drive (default `0.14`). */
  shiftSeconds?: number;
  finalDrive?: number;
  wheelRadius?: number;
}

/** Drive: how fast the car goes and how it gets there. */
export interface VehicleSpecEngine {
  /** Top speed, m/s. A governor holds it, so drive stays smooth up to it. */
  topSpeed: number;
  /** Launch acceleration, m/s²; the tires can still spin if `tires.grip` cannot hold it. */
  accel: number;
  /** Reverse top speed, m/s (default 30% of `topSpeed`, at most 9). */
  reverseSpeed?: number;
  /** Peak power, W (default enough for `accel` to taper gently toward `topSpeed`). */
  power?: number;
  /** Deceleration with the throttle lifted, m/s² (default `1`; a `gearbox` car brakes on its engine and adds this on top only when set). */
  coast?: number;
  /** Drive to the front axle, `0` RWD … `1` FWD (default `0`, or `0.5` when `accel` needs both axles). */
  driveFront?: number;
  /** Gear and rpm; omit for a single-speed drive. */
  gearbox?: VehicleSpecGearbox;
}

/** Brakes: what the pedal asks for and how the handbrake behaves. */
export interface VehicleSpecBrakes {
  /** Braking deceleration the brakes ask for, m/s²; grip caps what is delivered. */
  brake: number;
  /** Rear grip left under full handbrake, `0..1` (default from `tires.drift`). */
  handbrakeGrip?: number;
  /** Anti-lock brakes, `0` off … `1` full (default `0.7`). */
  abs?: number;
}

/** Steering: lock, rack speed and self-alignment. */
export interface VehicleSpecSteering {
  /** Yaw rate at `turnSpeed` with full lock, rad/s: how hard the car turns in at town speed. */
  turnRate: number;
  /** The speed `turnRate` is quoted at, m/s (default `10`). */
  turnSpeed?: number;
  /** Rack speed toward full lock, rad/s (default `3.8`; returns 1.5× faster). */
  steerRate?: number;
  /** Caster self-alignment: share of a slide the front wheels steer into on their own (default `0.495 + 0.25·drift`). */
  selfAlign?: number;
}

/** Tires: peak grip, compound and rear balance. */
export interface VehicleSpecTires {
  /** Peak tire grip, in g (0.7 bus, 0.9 street, 1.2 sport, 1.5 arcade). */
  grip: number;
  /**
   * Tire compound: grip (`0..1` of `grip`) against slip, the sideways/forward speed ratio. Where the curve
   * peaks is where the tire breaks away; its value at slip `1` is what is left fully sideways. Default
   * {@link DEFAULT_GRIP_CURVE}, a street tire.
   */
  gripCurve?: GripCurve;
  /** Rear balance, `0` planted … `1` loose: less rear grip, more front roll stiffness share, a sharper handbrake. Default `0.2`. */
  drift?: number;
}

/** Driver aids that keep the car on the road. */
export interface VehicleSpecAids {
  /** Traction control, `0` off … `1` full (default `0.49·(1 − drift/2)`). */
  tractionControl?: number;
  /** Stability control, `0` off … `1` an arcade car that cannot spin (default `0.82`). */
  stability?: number;
  /** Sideslip stability control allows before it steps in, rad (default `0.15 + 0.45·drift`). */
  maxSideslip?: number;
}

/** Chassis: mass, geometry, body motion and aero. */
export interface VehicleSpecChassis {
  /** Mass, kg (default `1300`). Heavier cars shove lighter ones and carry more into walls. */
  weight?: number;
  /** Wheelbase, m (default `2.6`). */
  wheelbase?: number;
  /** Track width, m (default `1.6`). */
  trackWidth?: number;
  /** Centre-of-mass height, m (default `0.5`). */
  comHeight?: number;
  /** Body roll and pitch: `0` stiff … `1` soft (default `0.5`). */
  bodyRoll?: number;
  /** Sprung suspension riding the terrain: omit or `0` for none (flat), `0.1` stiff … `1` soft. */
  suspension?: number;
  /** Aero downforce area, m² — grip that grows with speed (default `0`). */
  downforce?: number;
}

/**
 * The feel knobs for a car, in numbers a designer can reason about, grouped by the part they tune.
 * {@link vehicleTuning} turns a spec into the force-based {@link VehicleDynamicsTuning}
 * `createVehicleDynamics` runs, so every car — kart, street car, bus or drift machine — rides the same tire
 * model and a spec only says how it should feel. Each driver aid is its own number, and `effects` switches
 * any physical effect off or retunes it.
 */
export interface VehicleSpec {
  engine: VehicleSpecEngine;
  brakes: VehicleSpecBrakes;
  steering: VehicleSpecSteering;
  tires: VehicleSpecTires;
  aids?: VehicleSpecAids;
  chassis?: VehicleSpecChassis;
  /** A hop: takeoff speed, m/s, and the pull back down, m/s² (default `9.81`). */
  hop?: { speed: number; gravity?: number };
  /**
   * Effects to switch off (`false`), replace or add on top of the ones the spec derives: `{ aeroDrag: false }` for a
   * car that never feels the air, `{ tireRelaxation: { length: 0.3 } }` for a lazier turn-in.
   */
  effects?: { [Name in VehicleEffectName]?: VehicleEffects[Name] | false };
}

const DEFAULT_TORQUE: GripCurve = { points: [[0, 0.7], [0.35, 0.95], [0.6, 1], [0.85, 0.92], [1, 0.7]] };

/**
 * Build the physical tuning for a {@link VehicleSpec}. Pure and deterministic, so a parts change or a dent
 * re-derives the tuning and `retune` swaps it in without costing the car its momentum.
 *
 * @capability vehicle-spec describe a car by feel (top speed, accel, grip, turn rate, balance, each aid) and get force-based handling built from separate effects
 */
export function vehicleTuning(spec: VehicleSpec): VehicleDynamicsTuning {
  const { engine, brakes, steering, tires } = spec;
  const aids = spec.aids ?? {};
  const chassis = spec.chassis ?? {};
  const mass = Math.max(1, chassis.weight ?? 1300);
  const wheelbase = Math.max(0.6, chassis.wheelbase ?? 2.6);
  const trackWidth = Math.max(0.3, chassis.trackWidth ?? 1.6);
  const comHeight = Math.max(0.1, chassis.comHeight ?? 0.5);
  const curve = gripCurvePeak(tires.gripCurve ?? DEFAULT_GRIP_CURVE);
  const grip = Math.max(0.05, tires.grip * (curve.peakGrip > 0 ? curve.peakGrip : 1));
  const drift = clamp(tires.drift ?? 0.2, 0, 1);
  const topSpeed = Math.max(0.5, engine.topSpeed);
  const accel = Math.max(0, engine.accel);
  const peakSlipAngle = clamp(Math.atan(curve.peakSlip), 0.06, 0.5);
  const slideGrip = clamp(curve.peakGrip > 0 ? curve.slideGrip / curve.peakGrip : 0.8, 0.05, 0.99);
  const roll = clamp(chassis.bodyRoll ?? 0.5, 0, 1);

  // Both axles drive once one axle's static load cannot hold the launch.
  const driveFront = engine.driveFront ?? (accel > grip * GRAVITY * 0.46 ? 0.5 : 0);
  const maxForce = mass * accel;
  const power = engine.power ?? maxForce * topSpeed * 0.6;

  const turnSpeed = Math.max(1, steering.turnSpeed ?? 10);
  const maxAngle = clamp(Math.atan((Math.max(0.05, steering.turnRate) * wheelbase) / turnSpeed), 0.12, 0.75);
  // At top speed the lock the grip can use plus a little past peak slip: more is just a slide.
  const highSpeedAngle = clamp((wheelbase * grip * GRAVITY) / (topSpeed * topSpeed) + peakSlipAngle * 0.9, 0.04, maxAngle);
  const rate = Math.max(0.1, steering.steerRate ?? 3.8);
  const frontShare = 0.55 - 0.1 * drift;

  const abs = clamp(brakes.abs ?? 0.7, 0, 1);
  const tractionControl = clamp(aids.tractionControl ?? 0.49 * (1 - 0.5 * drift), 0, 1);
  const stability = clamp(aids.stability ?? 0.82, 0, 1);
  const selfAlign = clamp(steering.selfAlign ?? 0.495 + 0.25 * drift, 0, 1);
  const downforce = Math.max(0, chassis.downforce ?? 0);
  const effects: VehicleEffects = {
    combinedSlip: {},
    longitudinalLoadTransfer: {},
    lateralLoadTransfer: { frontShare },
    loadSensitivity: { grip: 0.05 },
    aeroDrag: { area: 0.6 },
    rollingResistance: { coefficient: 0.015 },
    speedSensitiveSteering: { angle: highSpeedAngle, at: topSpeed * 0.8 },
    // Even a raw car keeps a floor of stability: a keyboard player cannot catch a spin by feel.
    stability: { strength: stability, maxSideslip: aids.maxSideslip ?? 0.15 + 0.45 * drift },
  };
  if (downforce > 0) effects.downforce = { area: downforce };
  if (selfAlign > 0) effects.selfAlign = { strength: selfAlign };
  if (abs > 0) effects.abs = { strength: abs };
  if (tractionControl > 0) effects.tractionControl = { strength: tractionControl };

  const gearbox = engine.gearbox;
  const tuning: VehicleDynamicsTuning = {
    massKg: mass,
    wheelbase,
    frontWeight: 0.52,
    comHeight,
    trackWidth,
    yawInertiaIndex: 1,
    front: { peakGrip: grip, peakSlipAngle, slideGrip },
    rear: { peakGrip: grip * (1.1 - 0.15 * drift), peakSlipAngle: peakSlipAngle * (1 + 0.1 * drift), slideGrip: slideGrip * (1 - 0.1 * drift) },
    driveFront: clamp(driveFront, 0, 1),
    powertrain:
      gearbox === undefined
        ? { kind: "direct", maxForce, maxPower: power, reverseScale: 0.55, coastForce: mass * Math.max(0, engine.coast ?? 1) }
        : { ...gearboxTuning(gearbox, mass, accel, topSpeed), ...(engine.coast === undefined ? {} : { coastForce: mass * Math.max(0, engine.coast) }) },
    brakeForce: mass * Math.max(0, brakes.brake),
    brakeFront: 0.62,
    handbrakeGrip: clamp(brakes.handbrakeGrip ?? 0.5 - 0.1 * drift, 0, 1),
    steering: { maxAngle, rate, returnRate: rate * 1.5 },
    effects,
    speedLimit: topSpeed,
    reverseSpeed: engine.reverseSpeed ?? Math.min(9, topSpeed * 0.3),
    rollStiffness: (mass * GRAVITY * comHeight) / (0.015 + 0.08 * roll),
    pitchStiffness: (mass * GRAVITY * comHeight) / (0.012 + 0.05 * roll),
  };
  const suspension = chassis.suspension ?? 0;
  if (suspension > 0) {
    const s = clamp(suspension, 0.05, 1);
    const sag = 0.03 + 0.09 * s;
    const springRate = (mass * GRAVITY) / 4 / sag;
    tuning.suspension = {
      springRate,
      damperRate: 0.7 * Math.sqrt((springRate * mass) / 4),
      travel: 0.12 + 0.15 * s,
      rideHeight: Math.max(0.25, comHeight * 0.9),
      antiRoll: springRate * (1.4 - roll),
      antiRollFront: frontShare,
    };
  }
  if (spec.hop !== undefined) tuning.jump = { speed: spec.hop.speed, ...(spec.hop.gravity === undefined ? {} : { gravity: spec.hop.gravity }) };
  return spec.effects === undefined ? tuning : withVehicleEffects(tuning, spec.effects);
}

function gearboxTuning(box: VehicleSpecGearbox, mass: number, accel: number, topSpeed: number): VehicleDynamicsTuning["powertrain"] {
  const gears = box.gears.length > 0 ? box.gears : [1];
  const redlineRpm = box.redlineRpm ?? 7200;
  const idleRpm = box.idleRpm ?? 850;
  const wheelRadius = box.wheelRadius ?? 0.33;
  const torqueCurve = box.torqueCurve ?? DEFAULT_TORQUE;
  const efficiency = 0.85;
  const first = gears[0] ?? 1;
  const top = gears[gears.length - 1] ?? first;
  // Top gear reaches redline a touch past top speed, so the governor, not the limiter, sets the ceiling.
  const finalDrive = box.finalDrive ?? (redlineRpm * 2 * Math.PI * wheelRadius) / (60 * topSpeed * 1.08 * top);
  const peakTorque = (mass * accel * wheelRadius) / (first * finalDrive * efficiency);
  return {
    kind: "gearbox",
    peakTorque,
    torqueCurve,
    idleRpm,
    redlineRpm,
    shiftUpRpm: redlineRpm - Math.min(700, redlineRpm * 0.1),
    shiftDownRpm: Math.max(idleRpm + 600, redlineRpm * 0.35),
    shiftSeconds: box.shiftSeconds ?? 0.14,
    gears,
    reverseGear: first,
    finalDrive,
    wheelRadius,
    efficiency,
  };
}
