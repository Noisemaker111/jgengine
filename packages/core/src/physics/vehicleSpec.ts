import { DEFAULT_GRIP_CURVE, gripCurvePeak, type GripCurve } from "./gripCurve";
import type { VehicleDynamicsTuning } from "./vehicleDynamics";

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

/**
 * The feel knobs for a car, in numbers a designer can reason about. {@link vehicleTuning} turns a spec into
 * the force-based {@link VehicleDynamicsTuning} `createVehicleDynamics` runs, so every car — kart, street
 * car, bus or drift machine — rides the same tire model and a spec only says how it should feel.
 * Start from a {@link VEHICLE_STYLES} preset and override what the game needs.
 */
export interface VehicleSpec {
  /** Top speed, m/s. A governor holds it, so drive stays smooth up to it. */
  topSpeed: number;
  /** Launch acceleration, m/s²; the tires can still spin if `grip` cannot hold it. */
  accel: number;
  /** Braking deceleration the brakes ask for, m/s²; grip caps what is delivered. */
  brake: number;
  /** Reverse top speed, m/s (default 30% of `topSpeed`, at most 9). */
  reverseSpeed?: number;
  /** Yaw rate at `turnSpeed` with full lock, rad/s: how hard the car turns in at town speed. */
  turnRate: number;
  /** The speed `turnRate` is quoted at, m/s (default `10`). */
  turnSpeed?: number;
  /** Peak tire grip, in g (0.7 bus, 0.9 street, 1.2 sport, 1.5 arcade). */
  grip: number;
  /**
   * Tire compound: grip (`0..1` of `grip`) against slip, the sideways/forward speed ratio. Where the curve
   * peaks is where the tire breaks away; its value at slip `1` is what is left fully sideways. Default
   * {@link DEFAULT_GRIP_CURVE}, a street tire.
   */
  gripCurve?: GripCurve;
  /** `0` planted … `1` loose: less rear grip, a sharper handbrake, more slide before stability steps in. Default `0.2`. */
  drift?: number;
  /** Rear grip left under full handbrake, `0..1` (default from `drift`). */
  handbrakeGrip?: number;
  /** Driver aids `0` (raw) … `1` (arcade): ABS, traction control, stability and self-centring steering. Default `0.7`. */
  assist?: number;
  /** Mass, kg (default `1300`). Heavier cars shove lighter ones and carry more into walls. */
  weight?: number;
  /** Peak power, W (default enough for `accel` to taper gently toward `topSpeed`). */
  power?: number;
  /** Deceleration with the throttle lifted, m/s² (default `1`; a `gearbox` car brakes on its engine and adds this on top only when set). */
  coast?: number;
  /** Drive to the front axle, `0` RWD … `1` FWD (default `0`, or `0.5` when `accel` needs both axles). */
  driveFront?: number;
  /** Body roll and pitch: `0` stiff … `1` soft (default `0.5`). */
  bodyRoll?: number;
  /** Sprung suspension riding the terrain: omit or `0` for none (flat), `0.1` stiff … `1` soft. */
  suspension?: number;
  /** A hop: takeoff speed, m/s, and the pull back down, m/s² (default `9.81`). */
  hop?: { speed: number; gravity?: number };
  /** Gear and rpm; omit for a single-speed drive. */
  gearbox?: VehicleSpecGearbox;
  /** Wheelbase, m (default `2.6`). */
  wheelbase?: number;
  /** Track width, m (default `1.6`). */
  trackWidth?: number;
  /** Centre-of-mass height, m (default `0.5`). */
  comHeight?: number;
  /** Aero downforce area, m² — grip that grows with speed (default `0`). */
  downforce?: number;
}

/**
 * Starting points for {@link VehicleSpec}: spread one, then set the numbers a car needs. `arcade` grips
 * hard and forgives everything, `sim` keeps aids light so the car has to be driven, `drift` hangs the rear
 * out and holds a slide.
 */
export const VEHICLE_STYLES = {
  arcade: { grip: 1.5, drift: 0.15, assist: 1, bodyRoll: 0.4 },
  sim: { grip: 1.05, drift: 0.25, assist: 0.25, bodyRoll: 0.6 },
  drift: { grip: 1.1, drift: 0.85, assist: 0.55, bodyRoll: 0.6 },
} as const satisfies Record<string, Partial<VehicleSpec>>;

const DEFAULT_TORQUE: GripCurve = { points: [[0, 0.7], [0.35, 0.95], [0.6, 1], [0.85, 0.92], [1, 0.7]] };

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Build the physical tuning for a {@link VehicleSpec}. Pure and deterministic, so a parts change or a dent
 * re-derives the tuning and `retune` swaps it in without costing the car its momentum.
 *
 * @capability vehicle-spec describe a car by feel (top speed, accel, grip, turn rate, drift, assists) and get force-based handling tuned from it
 */
export function vehicleTuning(spec: VehicleSpec): VehicleDynamicsTuning {
  const mass = Math.max(1, spec.weight ?? 1300);
  const wheelbase = Math.max(0.6, spec.wheelbase ?? 2.6);
  const trackWidth = Math.max(0.3, spec.trackWidth ?? 1.6);
  const comHeight = Math.max(0.1, spec.comHeight ?? 0.5);
  const curve = gripCurvePeak(spec.gripCurve ?? DEFAULT_GRIP_CURVE);
  const grip = Math.max(0.05, spec.grip * (curve.peakGrip > 0 ? curve.peakGrip : 1));
  const drift = clamp(spec.drift ?? 0.2, 0, 1);
  const assist = clamp(spec.assist ?? 0.7, 0, 1);
  const topSpeed = Math.max(0.5, spec.topSpeed);
  const accel = Math.max(0, spec.accel);
  const peakSlipAngle = clamp(Math.atan(curve.peakSlip), 0.06, 0.5);
  const slideGrip = clamp(curve.peakGrip > 0 ? curve.slideGrip / curve.peakGrip : 0.8, 0.05, 0.99);
  const roll = clamp(spec.bodyRoll ?? 0.5, 0, 1);

  // Both axles drive once one axle's static load cannot hold the launch.
  const driveFront = spec.driveFront ?? (accel > grip * GRAVITY * 0.46 ? 0.5 : 0);
  const maxForce = mass * accel;
  const power = spec.power ?? maxForce * topSpeed * 0.6;

  const turnSpeed = Math.max(1, spec.turnSpeed ?? 10);
  const maxAngle = clamp(Math.atan((Math.max(0.05, spec.turnRate) * wheelbase) / turnSpeed), 0.12, 0.75);
  // At top speed the lock the grip can use plus a little past peak slip: more is just a slide.
  const highSpeedAngle = clamp((wheelbase * grip * GRAVITY) / (topSpeed * topSpeed) + peakSlipAngle * 0.9, 0.04, maxAngle);
  const rate = 2.4 + 2 * assist;

  const gearbox = spec.gearbox;
  const tuning: VehicleDynamicsTuning = {
    massKg: mass,
    wheelbase,
    frontWeight: 0.52,
    comHeight,
    trackWidth,
    yawInertiaIndex: 1,
    rollStiffnessFront: 0.55 - 0.1 * drift,
    loadSensitivity: 0.2,
    front: { peakGrip: grip, peakSlipAngle, slideGrip },
    rear: { peakGrip: grip * (1.1 - 0.15 * drift), peakSlipAngle: peakSlipAngle * (1 + 0.1 * drift), slideGrip: slideGrip * (1 - 0.1 * drift) },
    driveFront: clamp(driveFront, 0, 1),
    powertrain:
      gearbox === undefined
        ? { kind: "direct", maxForce, maxPower: power, reverseScale: 0.55, coastForce: mass * Math.max(0, spec.coast ?? 1) }
        : { ...gearboxTuning(gearbox, mass, accel, topSpeed), ...(spec.coast === undefined ? {} : { coastForce: mass * Math.max(0, spec.coast) }) },
    brakeForce: mass * Math.max(0, spec.brake),
    brakeFront: 0.62,
    handbrakeGrip: clamp(spec.handbrakeGrip ?? 0.5 - 0.1 * drift, 0, 1),
    steering: {
      maxAngle,
      highSpeedAngle,
      highSpeedAt: topSpeed * 0.8,
      rate,
      returnRate: rate * 1.5,
      selfAlign: clamp(0.25 + 0.35 * assist + 0.25 * drift, 0, 1),
    },
    assists: {
      abs: assist,
      tractionControl: 0.7 * assist * (1 - 0.5 * drift),
      // Even a raw car keeps a floor of stability: a keyboard player cannot catch a spin by feel.
      stability: 0.4 + 0.6 * assist,
      maxSideslip: 0.15 + 0.45 * drift,
    },
    aero: { dragArea: 0.6, downforceArea: Math.max(0, spec.downforce ?? 0) },
    speedLimit: topSpeed,
    reverseSpeed: spec.reverseSpeed ?? Math.min(9, topSpeed * 0.3),
    rollStiffness: (mass * GRAVITY * comHeight) / (0.015 + 0.08 * roll),
    pitchStiffness: (mass * GRAVITY * comHeight) / (0.012 + 0.05 * roll),
  };
  const suspension = spec.suspension ?? 0;
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
    };
  }
  if (spec.hop !== undefined) tuning.jump = { speed: spec.hop.speed, ...(spec.hop.gravity === undefined ? {} : { gravity: spec.hop.gravity }) };
  return tuning;
}

function gearboxTuning(box: VehicleSpecGearbox, mass: number, accel: number, topSpeed: number): VehicleDynamicsTuning["powertrain"] {
  const gears = box.gears.length > 0 ? box.gears : [1];
  const redlineRpm = box.redlineRpm ?? 7200;
  const idleRpm = box.idleRpm ?? 850;
  const wheelRadius = box.wheelRadius ?? 0.33;
  const torqueCurve = box.torqueCurve ?? DEFAULT_TORQUE;
  const efficiency = 0.85;
  // Top gear reaches redline a touch past top speed, so the governor, not the limiter, sets the ceiling.
  const top = gears[gears.length - 1]!;
  const finalDrive = box.finalDrive ?? (redlineRpm * 2 * Math.PI * wheelRadius) / (60 * topSpeed * 1.08 * top);
  const peakTorque = (mass * accel * wheelRadius) / (gears[0]! * finalDrive * efficiency);
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
    reverseGear: gears[0]!,
    finalDrive,
    wheelRadius,
    efficiency,
  };
}
