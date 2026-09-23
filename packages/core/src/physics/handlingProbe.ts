import type { AxisInput } from "../input/axisInput";
import type { AircraftVector, RigidAircraft, RigidAircraftInput, RigidAircraftStep } from "./aircraftDynamics";

/** The slice of a vehicle sim {@link measureHandling} drives: `VehicleDynamics` and `KinematicVehicle` both fit. */
export interface HandlingSubject {
  tick(dt: number, input: AxisInput): { forwardSpeed: number; lateralSpeed: number; yawRate: number };
  velocity(): readonly [number, number];
}

/** Scenario settings for {@link measureHandling}; every field has a default. */
export interface HandlingProbeOptions {
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** Entry speed for the step-steer, lift-off and handbrake tests, m/s (default `25`). */
  cornerSpeed?: number;
  /** Steer input for the step-steer test (default `1`: a held keyboard key, the harshest common case). */
  stepSteer?: number;
  /** Steer input held through the lift-off test (default `0.3`). */
  liftOffSteer?: number;
}

/** Deterministic feel metrics, in the units drivers and reviewers use. `Infinity` means the target was never reached. */
export interface HandlingReport {
  /** Standing start to 100 km/h, s. */
  zeroTo100: number;
  /** Speed after 40 s of full throttle, m/s. */
  topSpeed: number;
  /** Full brake from 100 km/h to rest, m. */
  brake100To0: number;
  /** Peak lateral acceleration (perpendicular to travel) on a slow steer ramp at 20 m/s while sideslip stays under 12°, g. */
  maxLateralG: number;
  /** Seconds from a step steer until yaw rate first reaches 90% of its peak — turn-in latency. */
  turnIn: number;
  /** Peak |sideslip| during the step steer, degrees. */
  stepPeakSideslipDeg: number;
  /** Yaw rate at the end of the 3 s step steer, rad/s. */
  stepSteadyYawRate: number;
  /** Share of entry speed left after the 3 s step steer. */
  stepSpeedRetained: number;
  /** The step steer ended with sideslip over 60°: the car spun. */
  spun: boolean;
  /** Yaw rate 0.5 s after lifting off mid-corner divided by the yaw rate before: `>1` tucks in, `<1` pushes wide. */
  liftOffYawGain: number;
  /** Peak |sideslip| from a 0.6 s steer-plus-handbrake pull, degrees. */
  handbrakePeakSideslipDeg: number;
  /** Seconds after releasing that pull, with no input, until sideslip stays under 5° for 0.3 s; `Infinity` if it never does within 3 s. */
  handbrakeRecoverySeconds: number;
  /** Peak |sideslip| holding full throttle and full steer for 2 s from 12 m/s — the keyboard player's corner, degrees. */
  powerSteerPeakSideslipDeg: number;
  /** The full-throttle full-steer hold ended with sideslip over 60°. */
  powerSteerSpun: boolean;
}

const KMH100 = 100 / 3.6;
const RAD_TO_DEG = 180 / Math.PI;

function input(throttle: number, brake: number, steer: number, handbrake = 0): AxisInput {
  return { throttle, brake, steer, handbrake };
}

function sideslipOf(step: { forwardSpeed: number; lateralSpeed: number }): number {
  return Math.hypot(step.forwardSpeed, step.lateralSpeed) < 1 ? 0 : Math.atan2(Math.abs(step.lateralSpeed), step.forwardSpeed);
}

function holdSpeed(target: number, current: number): { throttle: number; brake: number } {
  const error = target - current;
  return error >= 0 ? { throttle: Math.min(1, error * 0.6 + 0.25), brake: 0 } : { throttle: 0, brake: Math.min(1, -error * 0.3) };
}

function speedOf(subject: HandlingSubject): number {
  const [vx, vz] = subject.velocity();
  return Math.hypot(vx, vz);
}

function launchTo(subject: HandlingSubject, speed: number, dt: number): number {
  let last = 0;
  for (let i = 0; i < Math.ceil(60 / dt); i += 1) {
    last = subject.tick(dt, input(1, 0, 0)).forwardSpeed;
    if (last >= speed) break;
  }
  for (let i = 0; i < Math.ceil(0.5 / dt); i += 1) {
    const hold = holdSpeed(speed, last);
    last = subject.tick(dt, input(hold.throttle, hold.brake, 0)).forwardSpeed;
  }
  return last;
}

/**
 * Drives fresh instances from `create` through fixed scenarios (launch, top speed, braking, a slow steer
 * ramp, a step steer, a mid-corner lift-off, a handbrake pull, full throttle with full steer) and reports the feel metrics a test can
 * assert. Deterministic: the same subject and options always produce the same report, so a tuning change
 * shows up as a number moving, not an opinion.
 * @capability handling-metrics measure a vehicle's feel as numbers — 0–100, braking, lateral g, turn-in, sideslip, spin
 */
export function measureHandling(create: () => HandlingSubject, options: HandlingProbeOptions = {}): HandlingReport {
  const dt = options.dt ?? 1 / 60;
  const cornerSpeed = options.cornerSpeed ?? 25;
  const stepSteer = options.stepSteer ?? 1;
  const liftOffSteer = options.liftOffSteer ?? 0.3;

  let zeroTo100 = Number.POSITIVE_INFINITY;
  let topSpeed = 0;
  {
    const car = create();
    for (let i = 1; i <= Math.ceil(40 / dt); i += 1) {
      const step = car.tick(dt, input(1, 0, 0));
      if (zeroTo100 === Number.POSITIVE_INFINITY && step.forwardSpeed >= KMH100) zeroTo100 = i * dt;
      topSpeed = step.forwardSpeed;
    }
  }

  let brake100To0 = Number.POSITIVE_INFINITY;
  {
    const car = create();
    if (launchTo(car, KMH100, dt) >= KMH100 - 1) {
      let distance = 0;
      for (let i = 0; i < Math.ceil(20 / dt); i += 1) {
        const step = car.tick(dt, input(0, 1, 0));
        distance += Math.max(0, step.forwardSpeed) * dt;
        if (step.forwardSpeed <= 0.3) {
          brake100To0 = distance;
          break;
        }
      }
    }
  }

  let maxLateralG = 0;
  {
    const car = create();
    let speed = launchTo(car, 20, dt);
    let previous = car.velocity();
    let filtered = 0;
    for (let i = 0; i < Math.ceil(6 / dt); i += 1) {
      const steer = Math.min(1, (i * dt) / 6);
      const hold = holdSpeed(20, speed);
      const step = car.tick(dt, input(hold.throttle, hold.brake, steer));
      speed = step.forwardSpeed;
      const velocity = car.velocity();
      const ax = (velocity[0] - previous[0]) / dt;
      const az = (velocity[1] - previous[1]) / dt;
      previous = velocity;
      const travel = Math.max(1e-6, Math.hypot(velocity[0], velocity[1]));
      const lateral = Math.abs(ax * velocity[1] - az * velocity[0]) / travel;
      filtered += (lateral - filtered) * 0.1;
      if (sideslipOf(step) < 12 / RAD_TO_DEG) maxLateralG = Math.max(maxLateralG, filtered / 9.81);
    }
  }

  let turnIn = Number.POSITIVE_INFINITY;
  let stepPeakSideslipDeg = 0;
  let stepSteadyYawRate = 0;
  let stepSpeedRetained = 0;
  let spun = false;
  {
    const car = create();
    const entry = launchTo(car, cornerSpeed, dt);
    const yaw: number[] = [];
    let last = { forwardSpeed: entry, lateralSpeed: 0, yawRate: 0 };
    for (let i = 0; i < Math.ceil(3 / dt); i += 1) {
      last = car.tick(dt, input(0.35, 0, stepSteer));
      yaw.push(Math.abs(last.yawRate));
      stepPeakSideslipDeg = Math.max(stepPeakSideslipDeg, sideslipOf(last) * RAD_TO_DEG);
    }
    const window = yaw.slice(0, Math.ceil(1.5 / dt));
    const peak = Math.max(...window);
    const index = window.findIndex((value) => value >= peak * 0.9);
    if (peak > 1e-3 && index >= 0) turnIn = (index + 1) * dt;
    stepSteadyYawRate = Math.abs(last.yawRate);
    stepSpeedRetained = entry > 0 ? speedOf(car) / entry : 0;
    spun = sideslipOf(last) > 60 / RAD_TO_DEG || last.forwardSpeed < 0;
  }

  let liftOffYawGain = 1;
  {
    const car = create();
    let speed = launchTo(car, cornerSpeed, dt);
    let yawBefore = 0;
    for (let i = 0; i < Math.ceil(2.5 / dt); i += 1) {
      const hold = holdSpeed(cornerSpeed, speed);
      const step = car.tick(dt, input(hold.throttle, hold.brake, liftOffSteer));
      speed = step.forwardSpeed;
      yawBefore = Math.abs(step.yawRate);
    }
    let yawAfter = yawBefore;
    for (let i = 0; i < Math.ceil(0.5 / dt); i += 1) yawAfter = Math.abs(car.tick(dt, input(0, 0, liftOffSteer)).yawRate);
    liftOffYawGain = yawBefore > 1e-3 ? yawAfter / yawBefore : 1;
  }

  let handbrakePeakSideslipDeg = 0;
  let handbrakeRecoverySeconds = Number.POSITIVE_INFINITY;
  {
    const car = create();
    launchTo(car, 20, dt);
    const pullTicks = Math.ceil(0.6 / dt);
    let settledSince = -1;
    for (let i = 0; i < pullTicks + Math.ceil(3 / dt); i += 1) {
      const pulling = i < pullTicks;
      const step = car.tick(dt, input(0, 0, pulling ? 1 : 0, pulling ? 1 : 0));
      const slip = sideslipOf(step) * RAD_TO_DEG;
      if (i * dt < 1.5) handbrakePeakSideslipDeg = Math.max(handbrakePeakSideslipDeg, slip);
      if (pulling) continue;
      if (slip >= 5) settledSince = -1;
      else if (settledSince < 0) settledSince = i;
      if (settledSince >= 0 && (i - settledSince) * dt >= 0.3) {
        handbrakeRecoverySeconds = (settledSince - pullTicks) * dt;
        break;
      }
    }
  }

  let powerSteerPeakSideslipDeg = 0;
  let powerSteerSpun = false;
  {
    const car = create();
    launchTo(car, 12, dt);
    let last = { forwardSpeed: 0, lateralSpeed: 0, yawRate: 0 };
    for (let i = 0; i < Math.ceil(2 / dt); i += 1) {
      last = car.tick(dt, input(1, 0, 1));
      powerSteerPeakSideslipDeg = Math.max(powerSteerPeakSideslipDeg, sideslipOf(last) * RAD_TO_DEG);
    }
    powerSteerSpun = sideslipOf(last) > 60 / RAD_TO_DEG || last.forwardSpeed < 0;
  }

  return {
    zeroTo100,
    topSpeed,
    brake100To0,
    maxLateralG,
    turnIn,
    stepPeakSideslipDeg,
    stepSteadyYawRate,
    stepSpeedRetained,
    spun,
    liftOffYawGain,
    handbrakePeakSideslipDeg,
    handbrakeRecoverySeconds,
    powerSteerPeakSideslipDeg,
    powerSteerSpun,
  };
}

/** The slice of a sprung vehicle sim {@link measureRide} drives; a `VehicleDynamics` with `suspension` fits. */
export interface RideSubject {
  tick(
    dt: number,
    input: AxisInput,
  ): {
    position: readonly [number, number, number];
    forwardSpeed: number;
    bodyPitch: number;
    bodyRoll: number;
    lateralAccel: number;
    airborne: boolean;
  };
  applyImpulse(dvx: number, dvz: number, dvy?: number): void;
}

/** Deterministic ride metrics for a sprung vehicle. */
export interface RideReport {
  /** Seconds after a 1 m/s upward kick until the body stays within 5 mm of its rest height. */
  settleSeconds: number;
  /** Largest drop below rest height after that kick, divided by the largest rise above it. */
  heaveOvershoot: number;
  /** Peak nose-down pitch under full braking from 25 m/s, degrees. */
  brakeDiveDeg: number;
  /** Body roll per g of lateral acceleration in a steady half-lock corner at 20 m/s, degrees/g. */
  rollGradient: number;
  /** Times the car leaves the ground again after landing from a 4 m/s vertical launch. */
  landingBounces: number;
}

/**
 * Drives fresh sprung vehicles from `create` through a vertical kick, a hard stop, a steady corner and a
 * launch-and-land, and reports how the body moves: how fast it settles, how much it dives and rolls, and
 * whether a landing bounces.
 * @capability ride-metrics measure a sprung vehicle's ride — settle time, dive, roll per g, landing bounce
 */
export function measureRide(create: () => RideSubject, options: { dt?: number } = {}): RideReport {
  const dt = options.dt ?? 1 / 60;
  const neutral = input(0, 0, 0);

  let settleSeconds = Number.POSITIVE_INFINITY;
  let heaveOvershoot = 0;
  {
    const car = create();
    const rest = car.tick(dt, neutral).position[1];
    car.applyImpulse(0, 0, 1);
    let lastOutside = 0;
    let rise = 0;
    let drop = 0;
    const ticks = Math.ceil(6 / dt);
    for (let i = 1; i <= ticks; i += 1) {
      const offset = car.tick(dt, neutral).position[1] - rest;
      rise = Math.max(rise, offset);
      drop = Math.max(drop, -offset);
      if (Math.abs(offset) > 0.005) lastOutside = i;
    }
    if (lastOutside < ticks) settleSeconds = lastOutside * dt;
    heaveOvershoot = rise > 0 ? drop / rise : 0;
  }

  let brakeDiveDeg = 0;
  {
    const car = create();
    let speed = 0;
    for (let i = 0; i < Math.ceil(30 / dt) && speed < 25; i += 1) speed = car.tick(dt, input(1, 0, 0)).forwardSpeed;
    for (let i = 0; i < Math.ceil(1.5 / dt); i += 1) brakeDiveDeg = Math.max(brakeDiveDeg, car.tick(dt, input(0, 1, 0)).bodyPitch * RAD_TO_DEG);
  }

  let rollGradient = 0;
  {
    const car = create();
    let speed = 0;
    for (let i = 0; i < Math.ceil(30 / dt) && speed < 20; i += 1) speed = car.tick(dt, input(1, 0, 0)).forwardSpeed;
    let step = car.tick(dt, neutral);
    for (let i = 0; i < Math.ceil(2.5 / dt); i += 1) {
      const hold = holdSpeed(20, step.forwardSpeed);
      step = car.tick(dt, input(hold.throttle, hold.brake, 0.5));
    }
    const g = Math.abs(step.lateralAccel) / 9.81;
    rollGradient = g > 0.05 ? (Math.abs(step.bodyRoll) * RAD_TO_DEG) / g : 0;
  }

  let landingBounces = 0;
  {
    const car = create();
    car.tick(dt, neutral);
    car.applyImpulse(0, 0, 4);
    let wasAirborne = false;
    let landed = false;
    for (let i = 0; i < Math.ceil(4 / dt); i += 1) {
      const airborne = car.tick(dt, neutral).airborne;
      if (wasAirborne && !airborne) landed = true;
      else if (landed && !wasAirborne && airborne) landingBounces += 1;
      wasAirborne = airborne;
    }
  }

  return { settleSeconds, heaveOvershoot, brakeDiveDeg, rollGradient, landingBounces };
}

/** The slice of a jumping vehicle sim {@link measureAir} drives; a `VehicleDynamics` with `suspension`, `jump` and `air` fits. */
export interface AirSubject {
  tick(
    dt: number,
    input: AxisInput,
    modifiers?: { air?: { pitch: number; yaw: number; roll: number } },
  ): { position: readonly [number, number, number]; airborne: boolean };
  jump(): boolean;
  snapshot(): { pitchRate: number; yawRate: number; rollRate: number };
}

/** Deterministic jump and air-control metrics. */
export interface AirReport {
  /** Peak height above the resting height after one standing jump, m. */
  jumpApexHeight: number;
  /** Seconds from the jump to that peak. */
  jumpApexTime: number;
  /** Peak height with a second jump pressed at the first jump's apex, m (equals `jumpApexHeight` without a double jump). */
  doubleJumpApexHeight: number;
  /** Angular rate reached after 0.4 s of full input in the air, rad/s, per axis. */
  airPitchRate: number;
  airYawRate: number;
  airRollRate: number;
}

/**
 * Jumps a fresh vehicle from rest and holds full air input on each axis, reporting jump height and timing,
 * double-jump height, and how fast the body rotates in the air.
 * @capability air-metrics measure a vehicle's jumps and air control — apex height and time, double jump, air rotation rates
 */
export function measureAir(create: () => AirSubject, options: { dt?: number } = {}): AirReport {
  const dt = options.dt ?? 1 / 60;
  const neutral = input(0, 0, 0);

  const flight = (secondJumpAtApex: boolean) => {
    const car = create();
    const rest = car.tick(dt, neutral).position[1];
    car.jump();
    let apex = 0;
    let apexTime = 0;
    let rising = true;
    let last = rest;
    for (let i = 1; i <= Math.ceil(4 / dt); i += 1) {
      const y = car.tick(dt, neutral).position[1];
      if (rising && y < last) {
        rising = false;
        if (secondJumpAtApex) car.jump();
      }
      if (y - rest > apex) {
        apex = y - rest;
        apexTime = i * dt;
      }
      last = y;
    }
    return { apex, apexTime };
  };
  const single = flight(false);
  const double = flight(true);

  const rateAfter = (air: { pitch: number; yaw: number; roll: number }, key: "pitchRate" | "yawRate" | "rollRate") => {
    const car = create();
    car.tick(dt, neutral);
    car.jump();
    for (let i = 0; i < Math.ceil(0.4 / dt); i += 1) car.tick(dt, neutral, { air });
    return Math.abs(car.snapshot()[key]);
  };

  return {
    jumpApexHeight: single.apex,
    jumpApexTime: single.apexTime,
    doubleJumpApexHeight: double.apex,
    airPitchRate: rateAfter({ pitch: 1, yaw: 0, roll: 0 }, "pitchRate"),
    airYawRate: rateAfter({ pitch: 0, yaw: 1, roll: 0 }, "yawRate"),
    airRollRate: rateAfter({ pitch: 0, yaw: 0, roll: 1 }, "rollRate"),
  };
}

/** A vehicle sim {@link measureCourse} can drive along a line: a {@link HandlingSubject} that also reports its pose and front-wheel angle. */
export interface CourseSubject {
  tick(dt: number, input: AxisInput): { forwardSpeed: number; lateralSpeed: number; yawRate: number; steerAngle: number };
  velocity(): readonly [number, number];
  pose(): { position: readonly [number, number, number]; heading: number };
}

/** Settings for {@link measureCourse}; every field but `wheelbase` has a default. */
export interface CourseProbeOptions {
  /** Wheelbase, m — needed to separate geometric steer from understeer. */
  wheelbase: number;
  dt?: number;
  /** Skidpad radius, m (default `30`). */
  skidpadRadius?: number;
  /** Distance between slalom cones, m (default `18`). */
  slalomSpacing?: number;
  /** How far the weaving line swings either side of the cones, m (default `3.5`). */
  slalomOffset?: number;
}

/** Deterministic driven-course metrics. */
export interface CourseReport {
  /**
   * Understeer gradient, degrees of extra front-wheel angle per g of lateral acceleration, from a slow steer
   * ramp at 20 m/s between 0.1 and 0.4 g. Positive understeers, negative oversteers, near 0 is neutral.
   */
  understeerGradient: number;
  /** Highest lateral acceleration held on a circle of `skidpadRadius`, g. */
  skidpadG: number;
  /**
   * Fastest entry speed at which a pure-pursuit driver weaves 8 centre-line cones, passing each on the
   * correct side with at least 1.2 m of clearance and without sliding past 30°, m/s (`0` if none).
   */
  slalomSpeed: number;
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Drives a fresh vehicle from `create` through a steer ramp, a skidpad and a slalom with simple
 * deterministic drivers, and reports understeer gradient, skidpad g and the fastest clean slalom.
 * @capability course-metrics measure a vehicle on driven tests — understeer gradient, skidpad g, slalom speed
 */
export function measureCourse(create: () => CourseSubject, options: CourseProbeOptions): CourseReport {
  const dt = options.dt ?? 1 / 60;
  const wheelbase = options.wheelbase;
  const radius = options.skidpadRadius ?? 30;
  const spacing = options.slalomSpacing ?? 18;
  const offset = options.slalomOffset ?? 3.5;

  let understeerGradient = Number.NaN;
  {
    const car = create();
    let speed = launchTo(car, 20, dt);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < Math.ceil(8 / dt); i += 1) {
      const steer = Math.min(1, (i * dt) / 8) * 0.5;
      const hold = holdSpeed(20, speed);
      const step = car.tick(dt, input(hold.throttle, hold.brake, steer));
      speed = step.forwardSpeed;
      const lateralG = Math.abs(step.yawRate * speed) / 9.81;
      if (lateralG < 0.1 || lateralG > 0.4 || speed < 5 || sideslipOf(step) > 4 / RAD_TO_DEG) continue;
      const geometric = Math.atan((wheelbase * Math.abs(step.yawRate)) / speed);
      sum += ((Math.abs(step.steerAngle) - geometric) * RAD_TO_DEG) / lateralG;
      count += 1;
    }
    if (count > 0) understeerGradient = sum / count;
  }

  let skidpadG = 0;
  {
    const car = create();
    let speed = launchTo(car, 8, dt);
    let target = 8;
    let steer = 0;
    for (let i = 0; i < Math.ceil(60 / dt); i += 1) {
      target += 0.25 * dt;
      const hold = holdSpeed(target, speed);
      const step = car.tick(dt, input(hold.throttle, hold.brake, steer));
      speed = step.forwardSpeed;
      const wanted = speed / radius;
      const actual = -step.yawRate;
      steer = Math.max(0, Math.min(1, steer + 1.5 * (wanted - actual) * dt));
      const holding = Math.abs(actual - wanted) < wanted * 0.03 && sideslipOf(step) < 12 / RAD_TO_DEG;
      if (i * dt > 3 && holding) skidpadG = Math.max(skidpadG, (speed * speed) / radius / 9.81);
      if (steer >= 1 && actual < wanted * 0.9) break;
      if (sideslipOf(step) > 45 / RAD_TO_DEG) break;
    }
  }

  let slalomSpeed = 0;
  const lineX = (z: number) => offset * Math.sin((Math.PI * z) / spacing);
  const cleanRun = (entry: number): boolean => {
    const car = create();
    let speed = launchTo(car, entry, dt);
    const start = car.pose().position;
    let cone = 0;
    for (let i = 0; i < Math.ceil(30 / dt); i += 1) {
      const pose = car.pose();
      const z = pose.position[2] - start[2];
      const coneZ = spacing * (cone + 0.5);
      if (z >= coneZ) {
        const side = Math.sign(lineX(coneZ));
        if ((pose.position[0] - start[0]) * side < 1.2) return false;
        cone += 1;
        if (cone === 8) return true;
      }
      const lookahead = Math.max(5, speed * 0.35);
      const tx = start[0] + lineX(z + lookahead);
      const tz = pose.position[2] + lookahead;
      const bearing = Math.atan2(tx - pose.position[0], tz - pose.position[2]);
      const error = wrapAngle(bearing - pose.heading);
      const hold = holdSpeed(entry, speed);
      const step = car.tick(dt, input(hold.throttle, hold.brake, Math.max(-1, Math.min(1, -error * 3))));
      speed = step.forwardSpeed;
      if (sideslipOf(step) > 30 / RAD_TO_DEG) return false;
    }
    return false;
  };
  for (let entry = 8; entry <= 40; entry += 1) {
    if (!cleanRun(entry)) break;
    slalomSpeed = entry;
  }

  return { understeerGradient, skidpadG, slalomSpeed };
}

/** The slice of a single-track sim {@link measureLean} drives; a `VehicleDynamics` with a `lean` block fits. */
export interface LeanSubject {
  tick(dt: number, input: AxisInput): { forwardSpeed: number; lean: number };
}

/** Deterministic lean metrics for a motorcycle or bicycle. */
export interface LeanReport {
  /** Lean held after 2 s of full steer at `speed`, degrees. */
  steadyLeanDeg: number;
  /** Seconds from full steer until the lean first reaches 90% of that steady lean. */
  timeToLean: number;
  /** Largest lean the wrong way in the first 0.4 s — the countersteer tip-in, degrees (`0` if none). */
  counterLeanDeg: number;
}

/**
 * Brings a fresh bike to `speed` and holds full steer, reporting how far and how fast it leans and how much it
 * tips the other way first.
 * @capability lean-metrics measure a motorcycle's lean — steady lean, time to lean, countersteer tip-in
 */
export function measureLean(create: () => LeanSubject, options: { dt?: number; speed?: number } = {}): LeanReport {
  const dt = options.dt ?? 1 / 60;
  const speed = options.speed ?? 20;
  const bike = create();
  let current = launchTo(bike as unknown as HandlingSubject, speed, dt);
  const leans: number[] = [];
  for (let i = 0; i < Math.ceil(2 / dt); i += 1) {
    const hold = holdSpeed(speed, current);
    const step = bike.tick(dt, input(hold.throttle, hold.brake, 1));
    current = step.forwardSpeed;
    leans.push(step.lean);
  }
  const steady = leans[leans.length - 1] ?? 0;
  const index = leans.findIndex((lean) => Math.sign(lean) === Math.sign(steady) && Math.abs(lean) >= Math.abs(steady) * 0.9);
  let counter = 0;
  for (let i = 0; i < Math.min(leans.length, Math.ceil(0.4 / dt)); i += 1) {
    if (Math.sign(leans[i]!) === -Math.sign(steady)) counter = Math.max(counter, Math.abs(leans[i]!));
  }
  return {
    steadyLeanDeg: Math.abs(steady) * RAD_TO_DEG,
    timeToLean: index < 0 ? Number.POSITIVE_INFINITY : (index + 1) * dt,
    counterLeanDeg: counter * RAD_TO_DEG,
  };
}

/** Where {@link measureFlight} spawns each fresh aircraft: level, heading `0` (forward `+z`). */
export interface FlightSpawn {
  position: AircraftVector;
  velocity: AircraftVector;
}

/** Scenario settings for {@link measureFlight}. */
export interface FlightProbeOptions {
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** Entry airspeed for the fixed-wing tests, m/s (default `60`). */
  cruiseSpeed?: number;
  /** Spawn altitude, m (default `1000`, or `50` for a rotorcraft). */
  altitude?: number;
  /** Collective that hovers a rotorcraft (default weight over rotor `maxThrust`). */
  hoverCollective?: number;
}

/**
 * Deterministic flight metrics. Fields that don't apply to the aircraft are `NaN`: turn and stall need wings,
 * hover drift needs a rotor.
 */
export interface FlightReport {
  /** Peak roll rate under full roll input from cruise (or a hover), deg/s. */
  rollRateDeg: number;
  /** Best turn rate held at full throttle without losing altitude or speed, deg/s. */
  sustainedTurnRateDeg: number;
  /** Slowest airspeed that still holds altitude at idle, wings level, m/s. */
  stallSpeed: number;
  /** Steady climb at full throttle holding cruise speed (full collective from a hover for a rotorcraft), m/s. */
  climbRate: number;
  /** Seconds from idle to 90% of full thrust after the throttle (and collective) go to full. */
  throttleResponse: number;
  /** Horizontal drift after 10 s hands-off at hover collective, m. */
  hoverDriftMeters: number;
}

function flightInput(throttle: number, pitch: number, roll: number, collective = 0): RigidAircraftInput {
  return { throttle, pitch: Math.max(-1, Math.min(1, pitch)), roll: Math.max(-1, Math.min(1, roll)), yaw: 0, collective };
}

function wrapPi(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** A PI loop on vertical speed toward a target altitude, with pitch-rate damping; returns the pitch command. */
function createAltitudeHold(targetY: number): (step: RigidAircraftStep, dt: number) => number {
  let integral = 0;
  return (step, dt) => {
    const climbTarget = Math.max(-5, Math.min(5, 0.2 * (targetY - step.position[1])));
    const error = climbTarget - step.velocity[1];
    integral = Math.max(-1, Math.min(1, integral + 0.03 * error * dt));
    return integral + 0.05 * error - 0.3 * step.pitchRate;
  };
}

function bankHold(step: RigidAircraftStep, target: number): number {
  return 2 * wrapPi(target - step.bank) - 0.5 * step.rollRate;
}

/**
 * Flies fresh aircraft from `create` through fixed scenarios with simple deterministic autopilots: a full-aileron
 * roll, banked turns at full throttle, an idle deceleration holding altitude, a full-throttle climb at cruise
 * speed, a throttle step from idle, and a hands-off hover. `create` gets a spawn to pass straight into
 * `createRigidAircraft`. Deterministic, so a tuning change shows up as a number moving.
 * @capability flight-metrics measure an aircraft's feel as numbers — roll rate, sustained turn, stall speed, climb, throttle response, hover drift
 */
export function measureFlight(create: (spawn: FlightSpawn) => RigidAircraft, options: FlightProbeOptions = {}): FlightReport {
  const dt = options.dt ?? 1 / 60;
  const cruise = options.cruiseSpeed ?? 60;
  const probe = create({ position: [0, 0, 0], velocity: [0, 0, 0] });
  const tuning = probe.tuning();
  const rotor = tuning.rotor;
  const steps = (seconds: number) => Math.ceil(seconds / dt);

  if (rotor !== undefined) {
    const altitude = options.altitude ?? 50;
    const collective = options.hoverCollective ?? Math.min(1, (tuning.massKg * 9.81) / rotor.maxThrust);
    const hovering = () => {
      const aircraft = create({ position: [0, altitude, 0], velocity: [0, 0, 0] });
      aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 });
      return aircraft;
    };

    let rollRate = 0;
    {
      const aircraft = hovering();
      for (let i = 0; i < steps(2); i += 1) rollRate = Math.max(rollRate, Math.abs(aircraft.tick(dt, flightInput(1, 0, 1, collective)).rollRate));
    }
    let climbRate = 0;
    {
      const aircraft = hovering();
      for (let i = 0; i < steps(5); i += 1) climbRate = aircraft.tick(dt, flightInput(1, 0, 0, 1)).velocity[1];
    }
    let drift = 0;
    {
      const aircraft = hovering();
      let step = aircraft.tick(dt, flightInput(1, 0, 0, collective));
      for (let i = 1; i < steps(10); i += 1) step = aircraft.tick(dt, flightInput(1, 0, 0, collective));
      drift = Math.hypot(step.position[0], step.position[2]);
    }
    const response = throttleStep(() => {
      const aircraft = create({ position: [0, altitude, 0], velocity: [0, 0, 0] });
      aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 0 });
      return aircraft;
    }, (step) => (step.rotor?.speed ?? 0) ** 2, collective, dt);
    return {
      rollRateDeg: rollRate * RAD_TO_DEG,
      sustainedTurnRateDeg: Number.NaN,
      stallSpeed: Number.NaN,
      climbRate,
      throttleResponse: response,
      hoverDriftMeters: drift,
    };
  }

  const altitude = options.altitude ?? 1000;
  const cruising = () => create({ position: [0, altitude, 0], velocity: [0, 0, cruise] });

  let rollRate = 0;
  {
    const aircraft = cruising();
    for (let i = 0; i < steps(3); i += 1) rollRate = Math.max(rollRate, Math.abs(aircraft.tick(dt, flightInput(0.5, 0, 1)).rollRate));
  }

  let sustained = 0;
  for (let bankDeg = 10; bankDeg <= 85; bankDeg += 5) {
    const aircraft = cruising();
    const hold = createAltitudeHold(altitude);
    const bank = bankDeg / RAD_TO_DEG;
    let step = aircraft.tick(dt, flightInput(1, 0, 0));
    let speedAt20 = 0;
    let headingAt20 = 0;
    let turned = 0;
    let failed = false;
    for (let i = 1; i < steps(30); i += 1) {
      const previous = step.heading;
      step = aircraft.tick(dt, flightInput(1, hold(step, dt), bankHold(step, bank)));
      turned += wrapPi(step.heading - previous);
      if (i === steps(20)) {
        speedAt20 = step.airspeed;
        headingAt20 = turned;
      }
      if (step.stalled || Math.abs(step.position[1] - altitude) > 60) failed = true;
    }
    if (failed || step.airspeed < speedAt20 - 2) continue;
    sustained = Math.max(sustained, Math.abs(turned - headingAt20) / 10);
  }

  let stallSpeed = Number.NaN;
  {
    const aircraft = cruising();
    const hold = createAltitudeHold(altitude);
    let step = aircraft.tick(dt, flightInput(0, 0, 0));
    for (let i = 0; i < steps(120); i += 1) {
      step = aircraft.tick(dt, flightInput(0, hold(step, dt), bankHold(step, 0)));
      if (step.stalled || step.velocity[1] < -3) {
        stallSpeed = step.airspeed;
        break;
      }
    }
  }

  let climbRate = 0;
  {
    const aircraft = cruising();
    let integral = 0;
    let step = aircraft.tick(dt, flightInput(1, 0, 0));
    let sum = 0;
    for (let i = 1; i < steps(30); i += 1) {
      // Speed above cruise pitches the nose up (trading it for climb); an attitude loop flies that pitch.
      const error = step.airspeed - cruise;
      integral = Math.max(-0.3, Math.min(0.6, integral + 0.005 * error * dt));
      const pitchTarget = Math.max(-0.3, Math.min(0.8, integral + 0.02 * error));
      step = aircraft.tick(dt, flightInput(1, 3 * (pitchTarget - step.pitch) - 0.5 * step.pitchRate, bankHold(step, 0)));
      if (i >= steps(25)) sum += step.velocity[1];
    }
    climbRate = sum / (steps(30) - steps(25));
  }

  const response =
    tuning.engine === undefined
      ? Number.NaN
      : throttleStep(() => {
          const aircraft = cruising();
          aircraft.restore({ ...aircraft.snapshot(), spool: 0 });
          return aircraft;
        }, (step) => step.thrust, 0, dt);

  return {
    rollRateDeg: rollRate * RAD_TO_DEG,
    sustainedTurnRateDeg: sustained * RAD_TO_DEG,
    stallSpeed,
    climbRate,
    throttleResponse: response,
    hoverDriftMeters: Number.NaN,
  };
}

function throttleStep(create: () => RigidAircraft, thrustOf: (step: RigidAircraftStep) => number, collective: number, dt: number): number {
  const trace: number[] = [];
  const aircraft = create();
  for (let i = 0; i < Math.ceil(20 / dt); i += 1) trace.push(thrustOf(aircraft.tick(dt, flightInput(1, 0, 0, collective))));
  const final = trace[trace.length - 1] ?? 0;
  if (final <= 0) return Number.POSITIVE_INFINITY;
  const index = trace.findIndex((thrust) => thrust >= final * 0.9);
  return index < 0 ? Number.POSITIVE_INFINITY : (index + 1) * dt;
}
