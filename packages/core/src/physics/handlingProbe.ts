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
