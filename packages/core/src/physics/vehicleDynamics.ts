import type { AxisInput } from "../input/axisInput";
import type { GripCurve } from "./vehicleBody";
import { sampleGripCurve } from "./vehicleBody";

/**
 * One axle's tire, in physical terms. Lateral force follows a simplified Pacejka curve
 * `μ·Fz·sin(C·atan(B·α))` whose `B`/`C` are solved from `peakSlipAngle` and `slideGrip`, so the three
 * numbers read the way a driver feels them: how much grip, how early it peaks, how much is left sliding.
 */
export interface VehicleTireTuning {
  /** Peak friction coefficient μ on an ideal surface (0.7 worn street … 1.1 sport … 1.6 slick/arcade). */
  peakGrip: number;
  /** Slip angle in radians where lateral force peaks (0.07 stiff race tire … 0.2 soft, forgiving tire). */
  peakSlipAngle: number;
  /** Fraction of peak force left at a full 90° slide, `0..1` (0.6 snappy … 0.95 drift-friendly). */
  slideGrip: number;
}

/** Engine and gearbox. Drive force at the wheels = torque · curve(rpm) · gear · finalDrive · efficiency / wheelRadius. */
export interface VehicleGearboxTuning {
  kind: "gearbox";
  /** Peak engine torque, N·m. */
  peakTorque: number;
  /** Torque multiplier by normalized rpm (`0` = idle, `1` = redline); same shape as a grip curve. */
  torqueCurve: GripCurve;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  /** Seconds of reduced drive during a shift. */
  shiftSeconds: number;
  gears: readonly number[];
  reverseGear: number;
  finalDrive: number;
  /** Driven wheel radius, m. */
  wheelRadius: number;
  /** Driveline efficiency `0..1` (default `0.85`). */
  efficiency?: number;
  /** Engine-braking torque at the crank with the throttle closed, N·m (default `0.12 · peakTorque`). */
  engineBrakeTorque?: number;
  /** Clutch-slip rpm the engine holds while launching from rest (default halfway between idle and peak). */
  launchRpm?: number;
}

/** Single-speed drive (electric, kart, arcade ball-car): force capped by power, so top speed comes out of drag. */
export interface VehicleDirectDriveTuning {
  kind: "direct";
  /** Maximum tractive force at the wheels, N. */
  maxForce: number;
  /** Maximum power, W; force falls off as `power / speed` above the crossover. */
  maxPower: number;
  /** Reverse force as a fraction of `maxForce` (default `0.5`). */
  reverseScale?: number;
  /** Throttle-off drag force at the wheels, N (default `0.08 · maxForce`). */
  coastForce?: number;
}

/** Steering rack: lock, speed-sensitive lock, rack speed, and caster self-alignment. */
export interface VehicleSteeringTuning {
  /** Front-wheel lock at parking speed, rad. */
  maxAngle: number;
  /** Lock at and above `highSpeedAt`, rad; lower = calmer at speed. */
  highSpeedAngle: number;
  /** Speed where lock reaches `highSpeedAngle`, m/s. */
  highSpeedAt: number;
  /** Rack speed toward the requested angle, rad/s — a keyboard tap and a stick flick both pass through this. */
  rate: number;
  /** Rack speed back to centre when the request is released or reversed, rad/s (default `rate`). */
  returnRate?: number;
  /**
   * Caster self-alignment `0..1`: the fraction of the car's sideslip the front wheels steer into on their
   * own. `0` leaves every catch to the driver (sim), `~0.3` is a real street car, `0.8+` catches slides for
   * the player (arcade).
   */
  selfAlign?: number;
}

/** Electronic and arcade assists; each is a strength `0..1`, `0`/omitted = off. */
export interface VehicleAssistTuning {
  /** Anti-lock: caps brake force below the tire's remaining grip so the front keeps steering. */
  abs?: number;
  /** Traction control: caps drive force below the driven axle's remaining grip. */
  tractionControl?: number;
  /**
   * Stability (yaw) control: a corrective yaw torque once sideslip exceeds `maxSideslip`. Real ESC is subtle
   * (`~0.3`); arcade street cars that can't spin out sit near `1`.
   */
  stability?: number;
  /** Sideslip in rad that `stability` allows before it intervenes (default `0.2`, ≈11°). */
  maxSideslip?: number;
}

/** Aero and resistance. Uses air density 1.225 kg/m³. */
export interface VehicleAeroTuning {
  /** Drag coefficient × frontal area, m² (0.6 sports car … 1.0 SUV). */
  dragArea?: number;
  /** Lift coefficient × area producing downforce, m² (0 road car … 3 race car). */
  downforceArea?: number;
  /** Share of downforce on the front axle, `0..1` (default `0.45`). */
  downforceFront?: number;
  /** Rolling-resistance coefficient (default `0.015`). */
  rollingResistance?: number;
}

/**
 * Tuning for {@link createVehicleDynamics}. Every number is a physical quantity in SI units (kg, m, N,
 * N·m, rad, s), so a feel target maps to a knob a person can reason about: more rear grip or a lower
 * centre of mass for stability, softer tires for forgiveness, more drive to the rear for power oversteer.
 */
export interface VehicleDynamicsTuning {
  /** Total mass, kg. */
  massKg: number;
  /** Axle-to-axle distance, m. */
  wheelbase: number;
  /** Share of static weight on the front axle, `0..1` (0.6 front-engined FWD … 0.45 mid-engine). */
  frontWeight: number;
  /** Centre-of-mass height, m; drives longitudinal and lateral load transfer and body attitude. */
  comHeight: number;
  /** Track width, m. */
  trackWidth: number;
  /** Yaw inertia as a dynamic index `Iz / (m·a·b)` (default `1`; `<1` rotates eagerly, `>1` lazily). */
  yawInertiaIndex?: number;
  /**
   * Share of lateral load transfer taken by the front axle, `0..1` (default `0.5`). The classic balance knob:
   * more front → the front saturates first (understeer), less → the rear does (oversteer).
   */
  rollStiffnessFront?: number;
  /** Tire load sensitivity `0..0.5`: how much an axle's grip drops as load moves across it (default `0.2`). */
  loadSensitivity?: number;
  front: VehicleTireTuning;
  /** Rear tire; defaults to `front`. */
  rear?: VehicleTireTuning;
  /** Share of drive force to the front axle, `0..1` (`0` RWD, `1` FWD, `0.35` rear-biased AWD). */
  driveFront: number;
  powertrain: VehicleGearboxTuning | VehicleDirectDriveTuning;
  /** Peak service-brake force across all wheels, N. */
  brakeForce: number;
  /** Share of brake force on the front axle, `0..1` (default `0.65`). */
  brakeFront?: number;
  /** Rear lateral grip multiplier while the handbrake is fully on (default `0.35`). */
  handbrakeGrip?: number;
  steering: VehicleSteeringTuning;
  assists?: VehicleAssistTuning;
  aero?: VehicleAeroTuning;
  /**
   * Drive governor, m/s: drive force fades out over the last 0.5 m/s below it (arcade caps, electronic
   * limiters). Thrust, slopes and impulses can still carry the car past it. Omit to let power and drag decide.
   */
  speedLimit?: number;
  /** Reverse speed cap, m/s (default `8`). */
  reverseSpeed?: number;
  /** Body roll stiffness, N·m/rad, for the visual lean (default derived for ~3° at 1 g). */
  rollStiffness?: number;
  /** Body pitch stiffness, N·m/rad, for dive and squat (default derived for ~2° at 1 g). */
  pitchStiffness?: number;
  /** Suspension settle rate for load transfer and body attitude, 1/s (default `8`). */
  suspensionResponse?: number;
  /** Largest integration substep, s (default `1/240`); ticks are split so the result does not depend on frame rate. */
  maxSubstep?: number;
  /** Brake held near standstill drives in reverse (default `true`). Set `false` for a separate reverse action. */
  reverseOnBrake?: boolean;
}

/** Per-tick overrides layered over tuning: boost, grip zones, damage. Each scale defaults to `1`. */
export interface VehicleDynamicsModifiers {
  driveScale?: number;
  brakeScale?: number;
  gripScale?: number;
  steerScale?: number;
  /** Thrust along the heading that bypasses the tires, N — boost, a rocket, a tow. */
  thrust?: number;
}

/** World hooks for one vehicle instance. */
export interface VehicleDynamicsOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Grip multiplier by world position (gravel, ice, wet paint); default `1`. */
  surfaceFriction?: (x: number, z: number) => number;
  /** Clamp a planar move (walls, bounds); velocity is rederived from the allowed displacement. */
  clampMove?: (from: readonly [number, number], to: readonly [number, number]) => readonly [number, number];
}

/** Serializable integrator state: everything {@link VehicleDynamics.restore} needs to resume bit-for-bit. */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  steerAngle: number;
  gearIndex: number;
  reversing: boolean;
  shiftRemaining: number;
  rpm: number;
  longitudinalAccel: number;
  lateralAccel: number;
  bodyPitch: number;
  bodyRoll: number;
}

/** Result of one {@link VehicleDynamics.tick}: pose plus the telemetry camera, audio, haptics and HUD read. */
export interface VehicleDynamicsStep {
  position: readonly [number, number, number];
  heading: number;
  /** Signed speed along the heading, m/s. */
  forwardSpeed: number;
  /** Lateral speed, m/s (same sign convention as `KinematicVehicleStep.lateralSpeed`). */
  lateralSpeed: number;
  yawRate: number;
  /** Front-wheel angle, rad; positive steers the heading down, like `AxisInput.steer`. */
  steerAngle: number;
  /** Body sideslip β, rad: angle between heading and velocity. */
  sideslip: number;
  slipAngleFront: number;
  slipAngleRear: number;
  /** Share of each axle's friction budget in use, `0..1+`; `≥1` means that axle is sliding. Squeal, rumble and HUD key off it. */
  frontSaturation: number;
  rearSaturation: number;
  /** Lateral acceleration, m/s²; positive toward the car's right, the way `steer > 0` turns. */
  lateralAccel: number;
  longitudinalAccel: number;
  frontLoad: number;
  rearLoad: number;
  /** Surface multiplier sampled this tick. */
  surface: number;
  /** One-based forward gear; `-1` in reverse. */
  gear: number;
  rpm: number;
  /** Throttle `0..1` actually applied after traction control and the rev limiter — engine audio load. */
  engineLoad: number;
  wheelspin: boolean;
  wheelLock: boolean;
  absActive: boolean;
  tractionLimited: boolean;
  stabilityActive: boolean;
  bodyPitch: number;
  bodyRoll: number;
  /** Always `0`: ground-plane sim. Present so `tickDrivableVehicle` can drive it. */
  airOffset: number;
  airborne: boolean;
}

/**
 * Force-based planar car: a two-axle ("bicycle") model where yaw comes from tire forces rather than being
 * commanded, so understeer, oversteer, lift-off rotation, trail-braking, power slides and handbrake turns
 * emerge from the numbers instead of from special cases. Deterministic for a given `dt` sequence; ticks are
 * split into fixed substeps. Pairs with `tickDrivableVehicle` for the entity pose and `measureHandling`
 * for asserting feel.
 */
export interface VehicleDynamics {
  tick(dt: number, input: AxisInput, modifiers?: VehicleDynamicsModifiers): VehicleDynamicsStep;
  pose(): { position: readonly [number, number, number]; heading: number };
  /** World velocity on the ground plane, `[vx, vz]`, m/s. */
  velocity(): readonly [number, number];
  /** Scale planar velocity and yaw rate (crash, boost pad). */
  scaleVelocity(factor: number): void;
  /** Add a world-space velocity change, m/s (impacts, knockback). */
  applyImpulse(dvx: number, dvz: number): void;
  /** Swap tuning in place (upgrades, damage, a live tuning panel) without losing momentum. */
  retune(next: VehicleDynamicsTuning): void;
  tuning(): VehicleDynamicsTuning;
  snapshot(): VehicleDynamicsState;
  restore(state: VehicleDynamicsState): void;
  resetTo(position: readonly [number, number, number], heading: number): void;
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
/** Below this speed slip angles use it as the longitudinal reference, avoiding the atan singularity at rest. */
const SLIP_REFERENCE_SPEED = 2;
const DEFAULT_SUBSTEP = 1 / 240;

interface CurveShape {
  b: number;
  c: number;
}

function tireShape(tire: VehicleTireTuning): CurveShape {
  const slide = Math.min(0.999, Math.max(0.01, tire.slideGrip));
  const c = 1 + (2 / Math.PI) * Math.acos(slide);
  const b = Math.tan(Math.PI / (2 * c)) / Math.max(0.005, tire.peakSlipAngle);
  return { b, c };
}

function lateralCurve(shape: CurveShape, alpha: number): number {
  return Math.sin(shape.c * Math.atan(shape.b * alpha));
}

/**
 * Creates a {@link VehicleDynamics}.
 * @capability vehicle-dynamics force-based car handling — tires, load transfer, drivetrain, assists — tuned with physical numbers
 */
export function createVehicleDynamics(
  initialTuning: VehicleDynamicsTuning,
  options: VehicleDynamicsOptions = {},
): VehicleDynamics {
  let tuning = initialTuning;
  let frontShape = tireShape(tuning.front);
  let rearShape = tireShape(tuning.rear ?? tuning.front);
  const surfaceFriction = options.surfaceFriction ?? (() => 1);
  const clampMove = options.clampMove;

  const state: VehicleDynamicsState = freshState(tuning, options.position ?? [0, 0, 0], options.heading ?? 0);

  function tick(dt: number, input: AxisInput, modifiers?: VehicleDynamicsModifiers): VehicleDynamicsStep {
    const maxSub = Math.max(1 / 2000, tuning.maxSubstep ?? DEFAULT_SUBSTEP);
    const steps = dt > 0 ? Math.max(1, Math.ceil(dt / maxSub - 1e-9)) : 0;
    const h = steps > 0 ? dt / steps : 0;
    const telemetry = emptyTelemetry();
    const surface = surfaceFriction(state.x, state.z);
    for (let i = 0; i < steps; i += 1) substep(h, input, modifiers, surface, telemetry);
    if (steps === 0) substep(0, input, modifiers, surface, telemetry);
    const [fx, fz] = forwardOf(state.heading);
    const forwardSpeed = state.vx * fx + state.vz * fz;
    const lateralSpeed = -state.vx * fz + state.vz * fx;
    return {
      position: [state.x, state.y, state.z],
      heading: state.heading,
      forwardSpeed,
      lateralSpeed,
      yawRate: state.yawRate,
      steerAngle: -state.steerAngle,
      sideslip: telemetry.sideslip,
      slipAngleFront: telemetry.slipFront,
      slipAngleRear: telemetry.slipRear,
      frontSaturation: telemetry.satFront,
      rearSaturation: telemetry.satRear,
      lateralAccel: state.lateralAccel,
      longitudinalAccel: state.longitudinalAccel,
      frontLoad: telemetry.loadFront,
      rearLoad: telemetry.loadRear,
      surface,
      gear: state.reversing ? -1 : state.gearIndex + 1,
      rpm: state.rpm,
      engineLoad: telemetry.engineLoad,
      wheelspin: telemetry.wheelspin,
      wheelLock: telemetry.wheelLock,
      absActive: telemetry.abs,
      tractionLimited: telemetry.traction,
      stabilityActive: telemetry.stability,
      bodyPitch: state.bodyPitch,
      bodyRoll: state.bodyRoll,
      airOffset: 0,
      airborne: false,
    };
  }

  function substep(
    h: number,
    input: AxisInput,
    modifiers: VehicleDynamicsModifiers | undefined,
    surface: number,
    out: Telemetry,
  ): void {
    const t = tuning;
    const m = t.massKg;
    const L = Math.max(0.5, t.wheelbase);
    const a = L * (1 - clamp01(t.frontWeight));
    const b = L - a;
    const iz = Math.max(1, (t.yawInertiaIndex ?? 1) * m * a * b);
    const heading = state.heading;
    const [fx, fz] = forwardOf(heading);
    const u = state.vx * fx + state.vz * fz;
    const v = -state.vx * fz + state.vz * fx;
    const r = state.yawRate;
    const speed = Math.hypot(state.vx, state.vz);

    const throttle = clamp01(input.throttle);
    const brakeInput = clamp01(input.brake);
    const handbrake = clamp01(input.handbrake);
    const steerInput = Math.max(-1, Math.min(1, input.steer)) * (modifiers?.steerScale ?? 1);

    if (t.reverseOnBrake ?? true) {
      if (!state.reversing && brakeInput > 0.1 && throttle <= 0.05 && u < 0.5) state.reversing = true;
      else if (state.reversing && (throttle > 0.1 || u > 0.5)) state.reversing = false;
    }
    const wantReverseDrive = state.reversing && brakeInput > 0;

    // Rack: requested angle is in "heading-positive" sign, the opposite of AxisInput.steer.
    const steering = t.steering;
    const lockBlend = Math.min(1, Math.abs(u) / Math.max(0.1, steering.highSpeedAt));
    const lock = steering.maxAngle + (steering.highSpeedAngle - steering.maxAngle) * lockBlend;
    const sideslipNow = Math.abs(u) > 1 ? Math.atan2(v, Math.abs(u)) : 0;
    // Caster: the wheels trail the velocity, so at `selfAlign` they steer into a slide by that share of β.
    const align = (steering.selfAlign ?? 0) * -sideslipNow * Math.sign(u || 1);
    const target = Math.max(-steering.maxAngle, Math.min(steering.maxAngle, -steerInput * lock + align));
    const toward = target - state.steerAngle;
    const returning = Math.sign(toward) !== Math.sign(state.steerAngle) && state.steerAngle !== 0;
    const rate = returning ? (steering.returnRate ?? steering.rate) : steering.rate;
    const maxMove = Math.max(0, rate) * h;
    state.steerAngle += Math.max(-maxMove, Math.min(maxMove, toward));
    const delta = state.steerAngle;

    const aero = t.aero;
    const q = 0.5 * AIR_DENSITY * u * u;
    const downforce = q * (aero?.downforceArea ?? 0);
    const downFront = aero?.downforceFront ?? 0.45;
    const weight = m * GRAVITY;
    const transferLong = (m * state.longitudinalAccel * t.comHeight) / L;
    const loadFront = Math.max(0, weight * (b / L) - transferLong + downforce * downFront);
    const loadRear = Math.max(0, weight * (a / L) + transferLong + downforce * (1 - downFront));
    const transferLat = (m * Math.abs(state.lateralAccel) * t.comHeight) / Math.max(0.3, t.trackWidth);
    const rsf = t.rollStiffnessFront ?? 0.5;
    const sens = t.loadSensitivity ?? 0.2;
    const gripScale = surface * (modifiers?.gripScale ?? 1);
    const muFront = t.front.peakGrip * gripScale * loadSensitivityFactor(transferLat * rsf, loadFront, sens);
    const rearTire = t.rear ?? t.front;
    const muRear = rearTire.peakGrip * gripScale * loadSensitivityFactor(transferLat * (1 - rsf), loadRear, sens);
    const capFront = muFront * loadFront;
    const hbGrip = 1 - handbrake * (1 - (t.handbrakeGrip ?? 0.35));
    const capRear = muRear * loadRear;

    // Axle-point velocities in the car frame: front sits `a` ahead, rear `b` behind.
    const uF = u;
    const vF = v - a * r;
    const vR = v + b * r;
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);
    const wheelLong = uF * cosD - vF * sinD;
    const wheelLat = uF * sinD + vF * cosD;
    const slipFront = Math.atan2(wheelLat, Math.max(SLIP_REFERENCE_SPEED, Math.abs(wheelLong)));
    const slipRear = Math.atan2(vR, Math.max(SLIP_REFERENCE_SPEED, Math.abs(u)));

    let drive = driveForce(throttle, wantReverseDrive ? brakeInput : 0, u, h, out) * (modifiers?.driveScale ?? 1);
    // A governor cuts drive like a limiter: forcing speed down after the fact would leave full drive
    // consuming the tire budget, and a car pinned at its cap could not turn.
    if (t.speedLimit !== undefined && drive > 0) drive *= clamp01((t.speedLimit - u) / 0.5);
    let brakeTotal = 0;
    if (!wantReverseDrive && brakeInput > 0 && Math.abs(u) > 0.05) brakeTotal = brakeInput * t.brakeForce * (modifiers?.brakeScale ?? 1);
    const brakeFrontShare = t.brakeFront ?? 0.65;
    const assists = t.assists;
    const driveFrontShare = clamp01(t.driveFront);

    let longFront = drive * driveFrontShare;
    let longRear = drive * (1 - driveFrontShare);
    let brakeF = brakeTotal * brakeFrontShare;
    let brakeR = brakeTotal * (1 - brakeFrontShare);
    // ABS and TC act on combined slip like the real systems: the longitudinal limit is what the friction
    // ellipse leaves after the cornering force the axle is already asking for.
    const frontLatUse = Math.abs(lateralCurve(frontShape, slipFront));
    const rearLatUse = Math.abs(lateralCurve(rearShape, slipRear)) * hbGrip;
    const longRoomFront = capFront * Math.sqrt(Math.max(0, 1 - frontLatUse * frontLatUse));
    const longRoomRear = capRear * Math.sqrt(Math.max(0, 1 - rearLatUse * rearLatUse));
    const abs = assists?.abs ?? 0;
    if (abs > 0) {
      const limitFront = longRoomFront * (1 - 0.2 * abs);
      const limitRear = longRoomRear * (1 - 0.2 * abs);
      if (brakeF > limitFront) {
        brakeF = limitFront + (brakeF - limitFront) * (1 - abs);
        out.abs = true;
      }
      if (brakeR > limitRear) {
        brakeR = limitRear + (brakeR - limitRear) * (1 - abs);
        out.abs = true;
      }
    }
    const tc = assists?.tractionControl ?? 0;
    if (tc > 0) {
      const limitFront = longRoomFront * (1 - 0.35 * tc);
      const limitRear = longRoomRear * (1 - 0.35 * tc);
      if (Math.abs(longFront) > limitFront) {
        longFront = Math.sign(longFront) * (limitFront + (Math.abs(longFront) - limitFront) * (1 - tc));
        out.traction = true;
      }
      if (Math.abs(longRear) > limitRear) {
        longRear = Math.sign(longRear) * (limitRear + (Math.abs(longRear) - limitRear) * (1 - tc));
        out.traction = true;
      }
    }
    const direction = Math.sign(u) || 1;
    // A locked rear (handbrake) drags at sliding friction and gives up most of its cornering force.
    const hbDrag = handbrake * capRear * rearTire.slideGrip * 0.9;
    let fxFront = longFront - direction * brakeF;
    let fxRear = longRear - direction * (brakeR + hbDrag);

    const front = combine(fxFront, capFront, frontShape, slipFront, 1, out, "front", Math.abs(longFront) > 0);
    const rear = combine(fxRear, capRear, rearShape, slipRear, hbGrip, out, "rear", Math.abs(longRear) > 0);
    fxFront = front.fx;
    fxRear = rear.fx;
    let fyFront = front.fy;
    let fyRear = rear.fy;

    // Cap lateral forces so one substep cannot push an axle's slip velocity past zero at low speed.
    if (h > 0) {
      const mFront = m * (b / L);
      const mRear = m * (a / L);
      const maxFront = (mFront * Math.abs(wheelLat)) / h;
      const maxRear = (mRear * Math.abs(vR)) / h;
      if (Math.abs(fyFront) > maxFront) fyFront = Math.sign(fyFront) * maxFront;
      if (Math.abs(fyRear) > maxRear) fyRear = Math.sign(fyRear) * maxRear;
    }

    // Car-frame forces (x forward, y along the lateral axis used by `v`).
    const frontLat = fyFront * cosD - fxFront * sinD;
    let forceLong = fxFront * cosD + fyFront * sinD + fxRear + (modifiers?.thrust ?? 0);
    const forceLat = frontLat + fyRear;
    const drag = q * (aero?.dragArea ?? 0) * Math.sign(u);
    const rolling = (aero?.rollingResistance ?? 0.015) * weight * Math.sign(u) * Math.min(1, Math.abs(u) / 0.5);
    forceLong -= drag + rolling;
    // Lateral force ahead of the CG yaws the heading negative in this frame, force behind it positive.
    let yawMoment = -a * frontLat + b * fyRear;

    const stab = assists?.stability ?? 0;
    if (stab > 0 && Math.abs(u) > 3) {
      const allowed = assists?.maxSideslip ?? 0.2;
      const excess = Math.abs(sideslipNow) - allowed;
      if (excess > 0) {
        yawMoment += -Math.sign(sideslipNow) * Math.sign(u) * stab * excess * 4 * iz * Math.max(1, Math.abs(r) + 1);
        yawMoment += -stab * r * iz * 0.6 * Math.min(1, excess * 4);
        out.stability = true;
      }
    }

    let du = forceLong / m - r * v;
    const dv = forceLat / m + r * u;
    // Brakes and rolling resistance cannot reverse the car inside one substep.
    if (h > 0 && throttle <= 0 && !wantReverseDrive && (modifiers?.thrust ?? 0) === 0) {
      const next = u + du * h;
      if (Math.sign(next) !== Math.sign(u) && u !== 0) du = -u / h;
    }
    const dr = yawMoment / iz;

    let nu = u + du * h;
    let nv = v + dv * h;
    let nr = r + dr * h;
    if (h > 0 && speed < 0.3 && throttle <= 0 && brakeInput <= 0 && Math.abs(modifiers?.thrust ?? 0) === 0) {
      nu *= Math.max(0, 1 - 6 * h);
      nv *= Math.max(0, 1 - 6 * h);
      nr *= Math.max(0, 1 - 6 * h);
    }
    const reverseCap = t.reverseSpeed ?? 8;
    if (nu < -reverseCap) nu = -reverseCap;

    state.heading = heading + nr * h;
    const [nfx, nfz] = forwardOf(state.heading);
    let nvx = nfx * nu - nfz * nv;
    let nvz = nfz * nu + nfx * nv;
    const toX = state.x + nvx * h;
    const toZ = state.z + nvz * h;
    if (clampMove !== undefined && h > 0) {
      const allowed = clampMove([state.x, state.z], [toX, toZ]);
      nvx = (allowed[0] - state.x) / h;
      nvz = (allowed[1] - state.z) / h;
      state.x = allowed[0];
      state.z = allowed[1];
    } else {
      state.x = toX;
      state.z = toZ;
    }
    state.vx = nvx;
    state.vz = nvz;
    state.yawRate = nr;

    const response = 1 - Math.exp(-(t.suspensionResponse ?? 8) * h);
    const accelLong = h > 0 ? du + r * v : 0;
    const accelLat = h > 0 ? dv - r * u : 0;
    state.longitudinalAccel += (accelLong - state.longitudinalAccel) * response;
    state.lateralAccel += (accelLat - state.lateralAccel) * response;
    const rollK = t.rollStiffness ?? (m * GRAVITY * t.comHeight) / 0.05;
    const pitchK = t.pitchStiffness ?? (m * GRAVITY * t.comHeight) / 0.035;
    state.bodyRoll = (m * state.lateralAccel * t.comHeight) / rollK;
    state.bodyPitch = (-m * state.longitudinalAccel * t.comHeight) / pitchK;

    out.sideslip = Math.abs(nu) > 1 ? Math.atan2(nv, Math.abs(nu)) : 0;
    out.slipFront = slipFront;
    out.slipRear = slipRear;
    out.loadFront = loadFront;
    out.loadRear = loadRear;
  }

  function driveForce(throttle: number, reverse: number, u: number, h: number, out: Telemetry): number {
    const pt = tuning.powertrain;
    if (pt.kind === "direct") {
      out.engineLoad = Math.max(throttle, reverse);
      if (reverse > 0) return -reverse * pt.maxForce * (pt.reverseScale ?? 0.5);
      if (throttle <= 0) return Math.abs(u) > 0.2 ? -Math.sign(u) * (pt.coastForce ?? pt.maxForce * 0.08) : 0;
      const powerLimited = pt.maxPower / Math.max(1, Math.abs(u));
      return throttle * Math.min(pt.maxForce, powerLimited);
    }
    state.shiftRemaining = Math.max(0, state.shiftRemaining - h);
    const eff = pt.efficiency ?? 0.85;
    const ratio = state.reversing ? pt.reverseGear : (pt.gears[state.gearIndex] ?? 1);
    const wheelRpm = (Math.abs(u) / Math.max(0.05, pt.wheelRadius)) * (60 / (2 * Math.PI));
    const coupled = wheelRpm * ratio * pt.finalDrive;
    const pedal = Math.max(throttle, reverse);
    const launch = pt.launchRpm ?? pt.idleRpm + (pt.redlineRpm - pt.idleRpm) * 0.35;
    const slipRpm = pt.idleRpm + (launch - pt.idleRpm) * pedal;
    const targetRpm = Math.min(pt.redlineRpm, Math.max(coupled, slipRpm, pt.idleRpm));
    const rpmResponse = 1 - Math.exp(-18 * h);
    state.rpm += (targetRpm - state.rpm) * rpmResponse;
    if (!state.reversing && state.shiftRemaining <= 0) {
      if (coupled >= pt.shiftUpRpm && state.gearIndex < pt.gears.length - 1 && pedal > 0) {
        state.gearIndex += 1;
        state.shiftRemaining = pt.shiftSeconds;
      } else if (coupled <= pt.shiftDownRpm && state.gearIndex > 0) {
        state.gearIndex -= 1;
        state.shiftRemaining = pt.shiftSeconds;
      }
    }
    const normalized = (state.rpm - pt.idleRpm) / Math.max(1, pt.redlineRpm - pt.idleRpm);
    const limiter = coupled >= pt.redlineRpm ? 0 : 1;
    const shifting = state.shiftRemaining > 0 ? 0.2 : 1;
    const toWheel = (ratio * pt.finalDrive * eff) / Math.max(0.05, pt.wheelRadius);
    out.engineLoad = pedal * limiter * shifting;
    if (pedal > 0) {
      const torque = pt.peakTorque * sampleGripCurve(pt.torqueCurve, normalized) * pedal * limiter * shifting;
      return (reverse > 0 ? -1 : 1) * torque * toWheel;
    }
    if (Math.abs(u) < 0.5) return 0;
    return -Math.sign(u) * (pt.engineBrakeTorque ?? pt.peakTorque * 0.12) * toWheel;
  }

  return {
    tick,
    pose: () => ({ position: [state.x, state.y, state.z], heading: state.heading }),
    velocity: () => [state.vx, state.vz],
    scaleVelocity(factor) {
      state.vx *= factor;
      state.vz *= factor;
      state.yawRate *= factor;
    },
    applyImpulse(dvx, dvz) {
      state.vx += dvx;
      state.vz += dvz;
    },
    retune(next) {
      tuning = next;
      frontShape = tireShape(next.front);
      rearShape = tireShape(next.rear ?? next.front);
      if (next.powertrain.kind === "gearbox") {
        state.gearIndex = Math.min(state.gearIndex, next.powertrain.gears.length - 1);
      }
    },
    tuning: () => tuning,
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    resetTo(position, heading) {
      Object.assign(state, freshState(tuning, position, heading));
    },
  };
}

interface Telemetry {
  sideslip: number;
  slipFront: number;
  slipRear: number;
  satFront: number;
  satRear: number;
  loadFront: number;
  loadRear: number;
  engineLoad: number;
  wheelspin: boolean;
  wheelLock: boolean;
  abs: boolean;
  traction: boolean;
  stability: boolean;
}

function emptyTelemetry(): Telemetry {
  return {
    sideslip: 0,
    slipFront: 0,
    slipRear: 0,
    satFront: 0,
    satRear: 0,
    loadFront: 0,
    loadRear: 0,
    engineLoad: 0,
    wheelspin: false,
    wheelLock: false,
    abs: false,
    traction: false,
    stability: false,
  };
}

/**
 * Friction ellipse for one axle: longitudinal demand is clamped to the budget first, then lateral force gets
 * what is left. Driving or braking hard therefore costs cornering grip on that axle, which is what turns
 * throttle into power oversteer on a RWD car and brake into rotation on corner entry.
 */
function combine(
  demandX: number,
  capacity: number,
  shape: CurveShape,
  slip: number,
  lateralScale: number,
  out: Telemetry,
  axle: "front" | "rear",
  driven: boolean,
): { fx: number; fy: number } {
  if (capacity <= 0) return { fx: 0, fy: 0 };
  let fx = demandX;
  if (Math.abs(fx) > capacity) {
    fx = Math.sign(fx) * capacity;
    if (driven && demandX > 0) out.wheelspin = true;
    else out.wheelLock = true;
  }
  const remaining = Math.sqrt(Math.max(0, 1 - (fx / capacity) ** 2));
  const fy = -capacity * lateralScale * remaining * lateralCurve(shape, slip);
  const saturation = Math.max(Math.hypot(fx, fy) / capacity, Math.abs(slip) / peakAngle(shape));
  if (axle === "front") out.satFront = Math.max(out.satFront, saturation);
  else out.satRear = Math.max(out.satRear, saturation);
  return { fx, fy };
}

function peakAngle(shape: CurveShape): number {
  return Math.tan(Math.PI / (2 * shape.c)) / shape.b;
}

function loadSensitivityFactor(transfer: number, load: number, sensitivity: number): number {
  if (load <= 0) return 1;
  const ratio = Math.min(1, transfer / load);
  return Math.max(0.5, 1 - sensitivity * ratio * ratio);
}

function forwardOf(heading: number): readonly [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function freshState(
  tuning: VehicleDynamicsTuning,
  position: readonly [number, number, number],
  heading: number,
): VehicleDynamicsState {
  return {
    x: position[0],
    y: position[1],
    z: position[2],
    heading,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steerAngle: 0,
    gearIndex: 0,
    reversing: false,
    shiftRemaining: 0,
    rpm: tuning.powertrain.kind === "gearbox" ? tuning.powertrain.idleRpm : 0,
    longitudinalAccel: 0,
    lateralAccel: 0,
    bodyPitch: 0,
    bodyRoll: 0,
  };
}
