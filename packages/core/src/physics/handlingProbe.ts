import type { AxisInput } from "../input/axisInput";

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
  {
    const car = create();
    launchTo(car, 20, dt);
    for (let i = 0; i < Math.ceil(1.5 / dt); i += 1) {
      const pulling = i * dt < 0.6;
      const step = car.tick(dt, input(0, 0, pulling ? 1 : 0, pulling ? 1 : 0));
      handbrakePeakSideslipDeg = Math.max(handbrakePeakSideslipDeg, sideslipOf(step) * RAD_TO_DEG);
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
