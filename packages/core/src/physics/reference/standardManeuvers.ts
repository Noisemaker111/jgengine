import type { AxisInput } from "../../input/axisInput";
import type { CourseSubject } from "../handlingProbe";

/** Settings for {@link measureStandardManeuvers}; every field but `wheelbase` has a default. */
export interface StandardManeuverOptions {
  /** Wheelbase, m: separates the geometric (Ackermann) steer from understeer and sizes the path follower. */
  wheelbase: number;
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** ISO 4138 circle radius, m (default `40`). */
  circleRadius?: number;
  /** ISO 7401 test speed, m/s (default 80 km/h). */
  stepSpeed?: number;
  /** ISO 7401 steady-state lateral acceleration the step is sized for, m/s² (default `4`). */
  stepLateralAccel?: number;
  /** Vehicle width and length for the ISO 3888-1 cone lanes, m (default `1.75` × `4.2`). */
  vehicleWidth?: number;
  vehicleLength?: number;
  /** Tests to run (default all); a skipped test reports `NaN`. */
  tests?: readonly StandardManeuver[];
}

/** One of the standard tests {@link measureStandardManeuvers} can run. */
export type StandardManeuver = "circle" | "stepSteer" | "laneChange";

/** Results of the standard handling tests, as the standards define them. `NaN` means the test could not be run. */
export interface StandardManeuverReport {
  /**
   * ISO 4138 constant radius: road-wheel angle minus the Ackermann angle `L/R`, per g of lateral acceleration,
   * least-squares slope between 0.1 g and 0.4 g, degrees/g. Positive understeers.
   */
  steadyStateUndersteer: number;
  /** ISO 4138: highest lateral acceleration held on the circle, g. */
  steadyStateMaxG: number;
  /** ISO 7401: steer input (`AxisInput.steer`) that holds `stepLateralAccel` at `stepSpeed`. */
  stepSteer: number;
  /** ISO 7401: seconds from 50% steer to 90% of steady yaw rate. */
  stepResponseTime: number;
  /** ISO 7401: seconds from 50% steer to peak yaw rate. */
  stepPeakResponseTime: number;
  /** ISO 7401: peak yaw rate over steady yaw rate (`1` is no overshoot). */
  stepOvershoot: number;
  /** ISO 3888-1 double lane change, speed held: highest entry speed that clears every cone lane, m/s (`0` if none from 40 km/h). */
  laneChangeSpeed: number;
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

function launchTo(subject: CourseSubject, speed: number, dt: number): number {
  let last = 0;
  for (let i = 0; i < Math.ceil(60 / dt); i += 1) {
    last = subject.tick(dt, axis(1, 0, 0)).forwardSpeed;
    if (last >= speed) break;
  }
  for (let i = 0; i < Math.ceil(1 / dt); i += 1) {
    const hold = holdSpeed(speed, last);
    last = subject.tick(dt, axis(hold.throttle, hold.brake, 0)).forwardSpeed;
  }
  return last;
}

function sideslip(step: { forwardSpeed: number; lateralSpeed: number }): number {
  return Math.hypot(step.forwardSpeed, step.lateralSpeed) < 1 ? 0 : Math.atan2(Math.abs(step.lateralSpeed), step.forwardSpeed);
}

function wrap(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Steady-state circle (ISO 4138 constant-radius method): a yaw-rate driver holds the circle while speed creeps up. */
function steadyStateCircle(create: () => CourseSubject, wheelbase: number, radius: number, dt: number): { understeer: number; maxG: number } {
  const car = create();
  let speed = launchTo(car, 5, dt);
  let target = 5;
  let steer = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  let maxG = 0;
  const ackermann = wheelbase / radius;
  for (let i = 0; i < Math.ceil(150 / dt); i += 1) {
    target += 0.2 * dt;
    const hold = holdSpeed(target, speed);
    const step = car.tick(dt, axis(hold.throttle, hold.brake, steer));
    speed = step.forwardSpeed;
    const wanted = speed / radius;
    const actual = -step.yawRate;
    steer = clamp(steer + 1.5 * (wanted - actual) * dt, 0, 1);
    const holding = i * dt > 3 && Math.abs(actual - wanted) < wanted * 0.03 && sideslip(step) < 12 / RAD_TO_DEG;
    const g = (Math.abs(step.yawRate) * speed) / G;
    if (holding) {
      maxG = Math.max(maxG, (speed * speed) / radius / G);
      if (g >= 0.1 && g <= 0.4) {
        xs.push(g);
        ys.push((Math.abs(step.steerAngle) - ackermann) * RAD_TO_DEG);
      }
    }
    if (steer >= 1 && actual < wanted * 0.9) break;
    if (sideslip(step) > 45 / RAD_TO_DEG || speed < 2) break;
  }
  let understeer = Number.NaN;
  if (xs.length > 10) {
    const n = xs.length;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let k = 0; k < n; k += 1) {
      const x = xs[k] ?? 0;
      const y = ys[k] ?? 0;
      sx += x;
      sy += y;
      sxx += x * x;
      sxy += x * y;
    }
    const denominator = n * sxx - sx * sx;
    if (denominator > 1e-9) understeer = (n * sxy - sx * sy) / denominator;
  }
  return { understeer, maxG };
}

/** Step steer (ISO 7401): size the input for `accel` at `speed`, then step it in 0.15 s with throttle held. */
function stepSteer(create: () => CourseSubject, speed: number, accel: number, dt: number): { input: number; response: number; peak: number; overshoot: number } {
  const failed = { input: Number.NaN, response: Number.NaN, peak: Number.NaN, overshoot: Number.NaN };
  let input = 0;
  {
    const car = create();
    let current = launchTo(car, speed, dt);
    const wanted = accel / speed;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < Math.ceil(8 / dt); i += 1) {
      const hold = holdSpeed(speed, current);
      const step = car.tick(dt, axis(hold.throttle, hold.brake, input));
      current = step.forwardSpeed;
      input = clamp(input + 1.5 * (wanted + step.yawRate) * dt, 0, 1);
      if (i * dt >= 6) {
        sum += input;
        count += 1;
      }
    }
    input = count > 0 ? sum / count : 0;
  }
  if (!(input > 0) || input >= 1) return { ...failed, input };

  const car = create();
  let current = launchTo(car, speed, dt);
  let throttle = 0.3;
  for (let i = 0; i < Math.ceil(1 / dt); i += 1) {
    const hold = holdSpeed(speed, current);
    throttle = hold.throttle;
    current = car.tick(dt, axis(hold.throttle, hold.brake, 0)).forwardSpeed;
  }
  const ramp = 0.15;
  const yaw: number[] = [];
  for (let i = 1; i <= Math.ceil(5 / dt); i += 1) {
    const t = i * dt;
    const steer = input * Math.min(1, t / ramp);
    yaw.push(Math.abs(car.tick(dt, axis(throttle, 0, steer)).yawRate));
  }
  const tail = yaw.slice(-Math.ceil(1 / dt));
  const steady = tail.reduce((total, value) => total + value, 0) / Math.max(1, tail.length);
  if (!(steady > 1e-3)) return { ...failed, input };
  let peakIndex = 0;
  let peakValue = 0;
  let firstNinety = -1;
  yaw.forEach((value, index) => {
    if (value > peakValue) {
      peakValue = value;
      peakIndex = index;
    }
    if (firstNinety < 0 && value >= 0.9 * steady) firstNinety = index;
  });
  const half = ramp / 2;
  return {
    input,
    response: firstNinety < 0 ? Number.NaN : (firstNinety + 1) * dt - half,
    peak: (peakIndex + 1) * dt - half,
    overshoot: peakValue / steady,
  };
}

interface Lane {
  from: number;
  to: number;
  right: number;
  left: number;
}

/**
 * Double lane change (ISO 3888-1 lanes): a path follower drives the lane centres at the entry speed; any body corner
 * outside a lane fails. The standard lifts the throttle after the first lane; speed is held here instead so a game
 * model's strong coast drag does not end the run before the handling is tested.
 */
function laneChangeClears(create: () => CourseSubject, entry: number, wheelbase: number, width: number, length: number, dt: number): boolean {
  const lane1 = 1.1 * width + 0.25;
  const lane3 = width + 1;
  const lane5 = 1.3 * width + 0.25;
  const right1 = -lane1 / 2;
  const right3 = right1 + 3.5;
  const lanes: Lane[] = [
    { from: 0, to: 15, right: right1, left: right1 + lane1 },
    { from: 45, to: 70, right: right3, left: right3 + lane3 },
    { from: 95, to: 125, right: right1, left: right1 + lane5 },
  ];
  const centre1 = right1 + lane1 / 2;
  const centre3 = right3 + lane3 / 2;
  const centre5 = right1 + lane5 / 2;
  const smooth = (t: number) => {
    const s = clamp(t, 0, 1);
    return s * s * (3 - 2 * s);
  };
  const pathY = (x: number) => {
    if (x < 15) return centre1;
    if (x < 45) return centre1 + (centre3 - centre1) * smooth((x - 15) / 30);
    if (x < 70) return centre3;
    if (x < 95) return centre3 + (centre5 - centre3) * smooth((x - 70) / 25);
    return centre5;
  };

  const car = create();
  let speed = launchTo(car, entry, dt);
  const start = car.pose();
  const origin = start.position;
  const run = 25;
  let steer = 0;
  let steerAngle = 0;
  for (let i = 0; i < Math.ceil(40 / dt); i += 1) {
    const pose = car.pose();
    // Course axes: x along the start heading (+z), y to the left (+x).
    const x = pose.position[2] - origin[2] - run;
    const y = pose.position[0] - origin[0];
    if (x > 125) return true;
    const heading = pose.heading;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    for (const lane of lanes) {
      for (const [along, across] of [
        [length / 2, width / 2],
        [length / 2, -width / 2],
        [-length / 2, width / 2],
        [-length / 2, -width / 2],
      ] as const) {
        const cx = x + along * fx - across * fy;
        const cy = y + along * fy + across * fx;
        if (cx >= lane.from && cx <= lane.to && (cy < lane.right || cy > lane.left)) return false;
      }
    }
    const lookahead = Math.max(6, speed * 0.9);
    const ty = pathY(x + lookahead);
    const bearing = Math.atan2(ty - y, lookahead);
    const error = wrap(bearing - heading);
    const wanted = -Math.atan((2 * wheelbase * Math.sin(error)) / lookahead);
    steer = clamp(steer + 40 * (wanted - steerAngle) * dt, -1, 1);
    const hold = holdSpeed(entry, speed);
    const step = car.tick(dt, axis(hold.throttle, hold.brake, steer));
    speed = step.forwardSpeed;
    steerAngle = step.steerAngle;
    if (sideslip(step) > 30 / RAD_TO_DEG || speed < entry * 0.5) return false;
  }
  return false;
}

/**
 * Runs the standard handling tests on fresh vehicles from `create`: ISO 4138 steady-state circular driving
 * (constant radius), ISO 7401 step steer, and the ISO 3888-1 double lane change. Drivers steer through
 * `AxisInput` and read the reported road-wheel angle, so any vehicle sim that fits `CourseSubject` — a game's
 * `VehicleDynamics` or the reference car — runs the same tests and gives comparable numbers.
 * @capability standard-maneuvers measure a vehicle with ISO 4138 steady-state circle, ISO 7401 step steer and ISO 3888-1 lane change
 */
export function measureStandardManeuvers(create: () => CourseSubject, options: StandardManeuverOptions): StandardManeuverReport {
  const dt = options.dt ?? 1 / 60;
  const wheelbase = options.wheelbase;
  const tests = options.tests ?? ["circle", "stepSteer", "laneChange"];
  const circle = tests.includes("circle") ? steadyStateCircle(create, wheelbase, options.circleRadius ?? 40, dt) : { understeer: Number.NaN, maxG: Number.NaN };
  const step = tests.includes("stepSteer")
    ? stepSteer(create, options.stepSpeed ?? 80 / 3.6, options.stepLateralAccel ?? 4, dt)
    : { input: Number.NaN, response: Number.NaN, peak: Number.NaN, overshoot: Number.NaN };
  const width = options.vehicleWidth ?? 1.75;
  const length = options.vehicleLength ?? 4.2;
  let laneChangeSpeed = tests.includes("laneChange") ? 0 : Number.NaN;
  if (tests.includes("laneChange")) for (let kmh = 40; kmh <= 160; kmh += 5) {
    if (!laneChangeClears(create, kmh / 3.6, wheelbase, width, length, dt)) break;
    laneChangeSpeed = kmh / 3.6;
  }
  if (tests.includes("laneChange") && laneChangeSpeed > 0) {
    for (let kmh = laneChangeSpeed * 3.6 + 1; kmh < laneChangeSpeed * 3.6 + 5; kmh += 1) {
      if (!laneChangeClears(create, kmh / 3.6, wheelbase, width, length, dt)) break;
      laneChangeSpeed = kmh / 3.6;
    }
  }
  return {
    steadyStateUndersteer: circle.understeer,
    steadyStateMaxG: circle.maxG,
    stepSteer: step.input,
    stepResponseTime: step.response,
    stepPeakResponseTime: step.peak,
    stepOvershoot: step.overshoot,
    laneChangeSpeed,
  };
}
