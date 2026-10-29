import type { AxisInput } from "../../input/axisInput";

/** A car sim {@link measureCarEffects} can drive: `VehicleDynamics` and the reference car both fit. */
export interface CarEffectSubject {
  tick(
    dt: number,
    input: AxisInput,
  ): {
    forwardSpeed: number;
    lateralSpeed: number;
    yawRate: number;
    steerAngle: number;
    longitudinalAccel: number;
    lateralAccel: number;
    bodyRoll: number;
    bodyPitch: number;
    wheelLoads: readonly [number, number, number, number];
  };
  velocity(): readonly [number, number];
}

/**
 * One number per car effect, each from a test that isolates it as far as driving can: a steady circle for roll,
 * sideslip and lateral load transfer, steady braking for pitch and longitudinal transfer, coasting for drag and
 * rolling resistance, full throttle for the drivetrain, and corner transients for combined slip.
 */
export interface CarEffectMetrics {
  /** Body roll per g on a 40 m circle at 0.4 g, deg/g. */
  rollGradient: number;
  /** Body sideslip per g on that circle, deg/g; positive is nose-in (the tail steps out). */
  sideslipGradient: number;
  /** Lateral load moved outward across both axles per g, as a share of the car's weight. */
  lateralTransferPerG: number;
  /** Front axle's share of the lateral load transfer (LLTD). */
  lateralTransferFront: number;
  /** Nose-down pitch per g of steady braking at 0.5 g, deg/g. */
  pitchGradient: number;
  /** Load moved onto the front axle per g of braking, as a share of weight. */
  longitudinalTransferPerG: number;
  /** Deceleration coasting off the throttle at 100 km/h, m/s². */
  coastDecel100: number;
  /** Deceleration coasting off the throttle at 30 km/h, m/s². */
  coastDecel30: number;
  /** Standing start to 50 km/h at full throttle, s. */
  zeroTo50: number;
  /** 80 to 120 km/h at full throttle, s. */
  accel80To120: number;
  /** Steady yaw rate per rad of reported steer angle at 80 km/h and 4 m/s², 1/s. */
  yawGain80: number;
  /** ISO 7401 lateral-acceleration response: seconds from 50% steer to 90% of steady lateral acceleration. */
  lateralResponseTime: number;
  /** Path curvature after 1 s of full throttle from 0.5 g on a 40 m circle, over the curvature before: `>1` tightens. */
  powerOnCurvature: number;
  /** Path curvature after 0.7 s of 0.3 brake from 0.5 g on a 40 m circle, over the curvature before. */
  brakeInTurnCurvature: number;
  /** Path curvature 1 s after lifting from 0.5 g on a 100 m circle, over the curvature before. */
  liftOffCurvature: number;
}

/** Settings for {@link measureCarEffects}. */
export interface CarEffectProbeOptions {
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** Total mass, kg: sizes the load-transfer shares. */
  massKg: number;
  /** Static front weight share, for the longitudinal transfer baseline. */
  frontWeight: number;
}

const G = 9.81;
const RAD_TO_DEG = 180 / Math.PI;

function axis(throttle: number, brake: number, steer: number): AxisInput {
  return { throttle, brake, steer, handbrake: 0 };
}

function holdSpeed(target: number, current: number): { throttle: number; brake: number } {
  const error = target - current;
  return error >= 0 ? { throttle: Math.min(1, error * 0.6 + 0.25), brake: 0 } : { throttle: 0, brake: Math.min(1, -error * 0.3) };
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

type Step = ReturnType<CarEffectSubject["tick"]>;

function launchTo(car: CarEffectSubject, speed: number, dt: number): number {
  let last = 0;
  for (let i = 0; i < Math.ceil(60 / dt); i += 1) {
    last = car.tick(dt, axis(1, 0, 0)).forwardSpeed;
    if (last >= speed) break;
  }
  for (let i = 0; i < Math.ceil(1 / dt); i += 1) {
    const hold = holdSpeed(speed, last);
    last = car.tick(dt, axis(hold.throttle, hold.brake, 0)).forwardSpeed;
  }
  return last;
}

/** Settle on a circle of `radius` at `speed` with a yaw-rate driver; returns the steer, throttle and the last second's steps. */
function holdCircle(car: CarEffectSubject, speed: number, radius: number, dt: number): { steer: number; throttle: number; steps: Step[] } {
  let current = launchTo(car, speed, dt);
  let steer = 0;
  let throttle = 0;
  const steps: Step[] = [];
  const settle = Math.ceil(7 / dt);
  const keep = Math.ceil(1 / dt);
  let steerSum = 0;
  let throttleSum = 0;
  for (let i = 0; i < settle; i += 1) {
    const hold = holdSpeed(speed, current);
    throttle = hold.throttle;
    const step = car.tick(dt, axis(hold.throttle, hold.brake, steer));
    current = step.forwardSpeed;
    steer = clamp(steer + 1.5 * (current / radius + step.yawRate) * dt, 0, 1);
    if (i >= settle - keep) {
      steps.push(step);
      steerSum += steer;
      throttleSum += throttle;
    }
  }
  return { steer: steerSum / keep, throttle: throttleSum / keep, steps };
}

function mean(steps: readonly Step[], read: (step: Step) => number): number {
  return steps.reduce((total, step) => total + read(step), 0) / Math.max(1, steps.length);
}

function curvature(step: Step): number {
  return Math.abs(step.yawRate) / Math.max(1, Math.hypot(step.forwardSpeed, step.lateralSpeed));
}

function cornerTransient(
  create: () => CarEffectSubject,
  speed: number,
  radius: number,
  seconds: number,
  input: (throttle: number) => { throttle: number; brake: number },
  dt: number,
): number {
  const car = create();
  const { steer, throttle, steps } = holdCircle(car, speed, radius, dt);
  const before = mean(steps, curvature);
  const change = input(throttle);
  let last = steps[steps.length - 1];
  for (let i = 0; i < Math.ceil(seconds / dt); i += 1) last = car.tick(dt, axis(change.throttle, change.brake, steer));
  return last === undefined || before <= 0 ? Number.NaN : curvature(last) / before;
}

/**
 * Drives fresh cars from `create` through one test per car effect and reports a number for each, so a game car
 * and the reference car can be lined up effect by effect: roll and sideslip gradients, lateral and longitudinal
 * load transfer, pitch, coast-down at two speeds, launch and in-gear acceleration, yaw gain, lateral response
 * time, and the corner transients (power on, brake in turn, lift off).
 * @capability car-effect-metrics measure a car sim one effect at a time — roll, load transfer, pitch, coast-down, launch, yaw gain, response lag, power-on and brake-in-turn
 */
export function measureCarEffects(create: () => CarEffectSubject, options: CarEffectProbeOptions): CarEffectMetrics {
  const dt = options.dt ?? 1 / 60;
  const weight = options.massKg * G;

  const circleSpeed = Math.sqrt(0.4 * G * 40);
  const circle = holdCircle(create(), circleSpeed, 40, dt);
  const ay = Math.abs(mean(circle.steps, (step) => step.lateralAccel)) / G;
  const roll = Math.abs(mean(circle.steps, (step) => step.bodyRoll)) * RAD_TO_DEG;
  // Turning right (steer > 0) the nose points inside the path when the velocity points left of the heading.
  const sideslip = mean(circle.steps, (step) => Math.atan2(-step.lateralSpeed, Math.max(1, step.forwardSpeed))) * RAD_TO_DEG;
  const frontShift = mean(circle.steps, (step) => Math.abs(step.wheelLoads[0] - step.wheelLoads[1]) / 2);
  const rearShift = mean(circle.steps, (step) => Math.abs(step.wheelLoads[2] - step.wheelLoads[3]) / 2);

  let pitchGradient = Number.NaN;
  let longitudinalTransferPerG = Number.NaN;
  {
    const car = create();
    launchTo(car, 100 / 3.6, dt);
    let brake = 0.3;
    const held: Step[] = [];
    for (let i = 0; i < Math.ceil(2.2 / dt); i += 1) {
      const step = car.tick(dt, axis(0, brake, 0));
      brake = clamp(brake + 0.4 * (0.5 * G + step.longitudinalAccel) * dt, 0, 1);
      if (i * dt >= 1.2) held.push(step);
    }
    const decel = -mean(held, (step) => step.longitudinalAccel) / G;
    if (decel > 0.2) {
      pitchGradient = (mean(held, (step) => step.bodyPitch) * RAD_TO_DEG) / decel;
      const front = mean(held, (step) => step.wheelLoads[0] + step.wheelLoads[1]) / weight;
      longitudinalTransferPerG = (front - options.frontWeight) / decel;
    }
  }

  const coast = (speed: number): number => {
    const car = create();
    launchTo(car, speed, dt);
    let start = 0;
    let end = 0;
    for (let i = 0; i < Math.ceil(1.5 / dt); i += 1) {
      const step = car.tick(dt, axis(0, 0, 0));
      if (i === Math.ceil(0.5 / dt)) start = step.forwardSpeed;
      end = step.forwardSpeed;
    }
    return (start - end) / 1;
  };

  let zeroTo50 = Number.POSITIVE_INFINITY;
  let accel80To120 = Number.POSITIVE_INFINITY;
  {
    const car = create();
    let at80 = -1;
    for (let i = 1; i <= Math.ceil(40 / dt); i += 1) {
      const speed = car.tick(dt, axis(1, 0, 0)).forwardSpeed;
      if (zeroTo50 === Number.POSITIVE_INFINITY && speed >= 50 / 3.6) zeroTo50 = i * dt;
      if (at80 < 0 && speed >= 80 / 3.6) at80 = i * dt;
      if (speed >= 120 / 3.6) {
        accel80To120 = i * dt - at80;
        break;
      }
    }
  }

  let yawGain80 = Number.NaN;
  let lateralResponseTime = Number.NaN;
  {
    const speed = 80 / 3.6;
    const sized = holdCircle(create(), speed, (speed * speed) / 4, dt);
    const steer = sized.steer;
    if (steer > 0 && steer < 1) {
      const car = create();
      let current = launchTo(car, speed, dt);
      const ramp = 0.15;
      const lateral: number[] = [];
      const tail: Step[] = [];
      const total = Math.ceil(4 / dt);
      for (let i = 1; i <= total; i += 1) {
        // Speed is held through the step so cornering drag cannot drift the lateral acceleration it times.
        const hold = holdSpeed(speed, current);
        const step = car.tick(dt, axis(hold.throttle, hold.brake, steer * Math.min(1, (i * dt) / ramp)));
        current = step.forwardSpeed;
        lateral.push(Math.abs(step.lateralAccel));
        if (i > total - Math.ceil(1 / dt)) tail.push(step);
      }
      const steady = mean(tail, (step) => Math.abs(step.lateralAccel));
      const first = lateral.findIndex((value) => value >= 0.9 * steady);
      if (first >= 0) lateralResponseTime = (first + 1) * dt - ramp / 2;
      const angle = mean(tail, (step) => Math.abs(step.steerAngle));
      if (angle > 0) yawGain80 = mean(tail, (step) => Math.abs(step.yawRate)) / angle;
    }
  }

  const cornerSpeed = Math.sqrt(0.5 * G * 40);
  return {
    rollGradient: ay > 0 ? roll / ay : Number.NaN,
    sideslipGradient: ay > 0 ? sideslip / ay : Number.NaN,
    lateralTransferPerG: ay > 0 ? (frontShift + rearShift) / weight / ay : Number.NaN,
    lateralTransferFront: frontShift + rearShift > 0 ? frontShift / (frontShift + rearShift) : Number.NaN,
    pitchGradient,
    longitudinalTransferPerG,
    coastDecel100: coast(100 / 3.6),
    coastDecel30: coast(30 / 3.6),
    zeroTo50,
    accel80To120,
    yawGain80,
    lateralResponseTime,
    powerOnCurvature: cornerTransient(create, cornerSpeed, 40, 1, () => ({ throttle: 1, brake: 0 }), dt),
    brakeInTurnCurvature: cornerTransient(create, cornerSpeed, 40, 0.7, () => ({ throttle: 0, brake: 0.3 }), dt),
    liftOffCurvature: cornerTransient(create, Math.sqrt(0.5 * G * 100), 100, 1, () => ({ throttle: 0, brake: 0 }), dt),
  };
}
