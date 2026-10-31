import type { AxisInput } from "@jgengine/core/input/axisInput";

/** The slice of a single-track sim the bike scenarios drive: a `VehicleDynamics` with a `lean` block or a {@link RiddenMotorcycle}. */
export interface BikeCourseSubject {
  tick(dt: number, input: AxisInput): { forwardSpeed: number; lateralSpeed: number; yawRate: number; lean: number; steerAngle: number };
  velocity(): readonly [number, number];
  pose(): { position: readonly [number, number, number]; heading: number };
}

/** Settings for {@link measureBikeHandling}. */
export interface BikeHandlingOptions {
  /** Lean the subject holds at full steer, rad: steer input is a lean request `steer · maxLean` for both kinds of bike. */
  maxLean: number;
  /** Fixed tick, s (default `1/60`). */
  dt?: number;
  /** Speed of the lean test, m/s (default `20`). */
  leanSpeed?: number;
  /** Bike width and length for the lane-change corners, m (default `0.8`, `2.1`). */
  width?: number;
  length?: number;
  /** Scenarios to run (default all); the metrics of the others are `NaN`. */
  tests?: readonly BikeScenario[];
}

/** One scenario of {@link measureBikeHandling}. */
export type BikeScenario = "launch" | "brake" | "lean" | "laneChange" | "slalom";

/** Bike metrics comparable across any {@link BikeCourseSubject}. */
export interface BikeHandlingMetrics {
  /** Standing start to 100 and 200 km/h, s. */
  zeroTo100: number;
  zeroTo200: number;
  /** 100 km/h to rest under full brake, m. */
  brake100To0: number;
  /** Lean held after 2 s of full steer at the lean-test speed, degrees, and the lateral acceleration over the last 0.5 s, g. */
  steadyLeanDeg: number;
  steadyLateralG: number;
  /** Seconds from full steer until the lean first reaches 90% of that steady lean. */
  timeToLean: number;
  /** Largest lean the wrong way in the first 0.4 s, degrees (a real bike leans the right way at once). */
  counterLeanDeg: number;
  /** Largest bar angle the wrong way in the first 0.4 s, degrees: the countersteer. */
  counterSteerDeg: number;
  /** ISO 3888-1 double lane change sized for the bike (speed held), highest clean entry speed, km/h. */
  laneChangeSpeed: number;
  /** Slalom through six cones 18 m apart, alternating sides, highest clean entry speed, km/h. */
  slalomSpeed: number;
}

const G = 9.81;
const RAD_TO_DEG = 180 / Math.PI;

function axis(throttle: number, brake: number, steer: number): AxisInput {
  return { throttle, brake, steer, handbrake: 0 };
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function holdSpeed(target: number, current: number): { throttle: number; brake: number } {
  const error = target - current;
  return error >= 0 ? { throttle: Math.min(1, error * 0.6 + 0.25), brake: 0 } : { throttle: 0, brake: Math.min(1, -error * 0.3) };
}

function launchTo(subject: BikeCourseSubject, speed: number, dt: number): number {
  let last = subject.tick(dt, axis(0, 0, 0)).forwardSpeed;
  for (let i = 0; i < Math.ceil(60 / dt) && last < speed; i += 1) last = subject.tick(dt, axis(1, 0, 0)).forwardSpeed;
  for (let i = 0; i < Math.ceil(0.5 / dt); i += 1) {
    const hold = holdSpeed(speed, last);
    last = subject.tick(dt, axis(hold.throttle, hold.brake, 0)).forwardSpeed;
  }
  return last;
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Drive `pathY` (course x forward, y left) at `entry`; `fails` sees each pose in course axes. */
function followPath(
  bike: BikeCourseSubject,
  entry: number,
  maxLean: number,
  dt: number,
  pathY: (x: number) => number,
  end: number,
  fails: (x: number, y: number, heading: number) => boolean,
): boolean {
  let speed = launchTo(bike, entry, dt);
  const start = bike.pose();
  const origin = start.position;
  const heading0 = start.heading;
  const run = 25;
  for (let i = 0; i < Math.ceil(60 / dt); i += 1) {
    const pose = bike.pose();
    const dx = pose.position[2] - origin[2];
    const dy = pose.position[0] - origin[0];
    const c = Math.cos(heading0);
    const s = Math.sin(heading0);
    const x = dx * c + dy * s - run;
    const y = -dx * s + dy * c;
    const heading = wrap(pose.heading - heading0);
    if (x > end) return true;
    if (fails(x, y, heading)) return false;
    // Pure pursuit: the curvature to the look-ahead point, and the balanced lean for it.
    const lookahead = Math.max(6, speed * 0.9);
    const bearing = Math.atan2(pathY(x + lookahead) - y, lookahead);
    const curvature = (2 * Math.sin(wrap(bearing - heading))) / lookahead;
    const lean = -Math.atan((Math.max(speed, 1) ** 2 * curvature) / G);
    const hold = holdSpeed(entry, speed);
    const step = bike.tick(dt, axis(hold.throttle, hold.brake, clamp(lean / maxLean, -1, 1)));
    speed = step.forwardSpeed;
    if (Math.abs(step.lean) > 1.3 || speed < entry * 0.5) return false;
  }
  return false;
}

function smooth(t: number): number {
  const s = clamp(t, 0, 1);
  return s * s * (3 - 2 * s);
}

function laneChangeClears(create: (speed: number) => BikeCourseSubject, entry: number, options: Required<BikeHandlingOptions>): boolean {
  const { width, length } = options;
  const lane1 = 1.1 * width + 0.25;
  const lane3 = width + 1;
  const lane5 = 1.3 * width + 0.25;
  const right1 = -lane1 / 2;
  const right3 = right1 + 3.5;
  const lanes = [
    { from: 0, to: 15, right: right1, left: right1 + lane1 },
    { from: 45, to: 70, right: right3, left: right3 + lane3 },
    { from: 95, to: 125, right: right1, left: right1 + lane5 },
  ];
  const centre1 = right1 + lane1 / 2;
  const centre3 = right3 + lane3 / 2;
  const centre5 = right1 + lane5 / 2;
  const pathY = (x: number) => {
    if (x < 15) return centre1;
    if (x < 45) return centre1 + (centre3 - centre1) * smooth((x - 15) / 30);
    if (x < 70) return centre3;
    if (x < 95) return centre3 + (centre5 - centre3) * smooth((x - 70) / 25);
    return centre5;
  };
  const corners = [
    [length / 2, width / 2],
    [length / 2, -width / 2],
    [-length / 2, width / 2],
    [-length / 2, -width / 2],
  ] as const;
  return followPath(create(entry), entry, options.maxLean, options.dt, pathY, 125, (x, y, heading) => {
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    for (const lane of lanes) {
      for (const [along, across] of corners) {
        const cx = x + along * fx - across * fy;
        const cy = y + along * fy + across * fx;
        if (cx >= lane.from && cx <= lane.to && (cy < lane.right || cy > lane.left)) return true;
      }
    }
    return false;
  });
}

const CONE_SPACING = 18;
const CONES = 6;

function slalomClears(create: (speed: number) => BikeCourseSubject, entry: number, options: Required<BikeHandlingOptions>): boolean {
  // Cones on the centreline; the bike passes left of the even cones and right of the odd ones.
  const amplitude = 1.2;
  const pathY = (x: number) => (x < 0 || x > CONES * CONE_SPACING ? 0 : amplitude * Math.sin((Math.PI * x) / CONE_SPACING) * smooth(x / 6));
  let cone = 0;
  let lastX = -Infinity;
  const clear = options.width / 2 + 0.1;
  const passed = followPath(create(entry), entry, options.maxLean, options.dt, pathY, CONES * CONE_SPACING, (x, y) => {
    const at = (cone + 0.5) * CONE_SPACING;
    if (lastX < at && x >= at) {
      const side = cone % 2 === 0 ? 1 : -1;
      if (side * y < clear) return true;
      cone += 1;
    }
    lastX = x;
    return false;
  });
  return passed && cone >= CONES;
}

function highestClean(clears: (entry: number) => boolean, lowKmh: number, highKmh: number): number {
  if (!clears(lowKmh / 3.6)) return 0;
  let low = lowKmh;
  let high = highKmh;
  while (high - low > 2) {
    const mid = (low + high) / 2;
    if (clears(mid / 3.6)) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Drives fresh bikes from `create` through every bike scenario: a launch (0-100, 0-200 km/h), braking from
 * 100 km/h, a full-steer lean test like `measureLean` (plus the lateral g the lean holds), an ISO 3888-1 double lane
 * change with lanes sized for the bike, and a slalom. `create(speed)` may spawn rolling at `speed`; a subject that
 * ignores it is launched from rest. Steering is a lean request (`steer · maxLean`) for every subject, so a game bike
 * and the ridden reference motorcycle get the same inputs.
 * @capability bike-handling-compare measure any single-track sim on bike scenarios — launch, braking, lean, lane change, slalom
 */
export function measureBikeHandling(create: (speed: number) => BikeCourseSubject, options: BikeHandlingOptions): BikeHandlingMetrics {
  const full: Required<BikeHandlingOptions> = { dt: 1 / 60, leanSpeed: 20, width: 0.8, length: 2.1, tests: ["launch", "brake", "lean", "laneChange", "slalom"], ...options };
  const dt = full.dt;
  const runs = (scenario: BikeScenario) => full.tests.includes(scenario);
  let zeroTo100 = runs("launch") ? Number.POSITIVE_INFINITY : Number.NaN;
  let zeroTo200 = zeroTo100;
  if (runs("launch")) {
    const bike = create(0);
    let moving = -1;
    for (let i = 1; i <= Math.ceil(25 / dt); i += 1) {
      const step = bike.tick(dt, axis(1, 0, 0));
      // Timing starts at first motion, as a test's light barrier does.
      if (moving < 0 && step.forwardSpeed > 0.3) moving = (i - 1) * dt;
      if (zeroTo100 === Number.POSITIVE_INFINITY && step.forwardSpeed >= 100 / 3.6) zeroTo100 = i * dt - Math.max(0, moving);
      if (step.forwardSpeed >= 200 / 3.6) {
        zeroTo200 = i * dt - Math.max(0, moving);
        break;
      }
    }
  }
  let brake100To0 = runs("brake") ? Number.POSITIVE_INFINITY : Number.NaN;
  if (runs("brake")) {
    const bike = create(100 / 3.6);
    const speed = launchTo(bike, 100 / 3.6, dt);
    const start = bike.pose().position;
    for (let i = 0; i < Math.ceil(20 / dt); i += 1) {
      const step = bike.tick(dt, axis(0, 1, 0));
      if (step.forwardSpeed < 0.3) {
        const end = bike.pose().position;
        // Scale to exactly 100 km/h entry.
        brake100To0 = Math.hypot(end[0] - start[0], end[2] - start[2]) * (100 / 3.6 / Math.max(speed, 1)) ** 2;
        break;
      }
    }
  }
  const lean = (() => {
    if (!runs("lean")) return { steadyLeanDeg: Number.NaN, steadyLateralG: Number.NaN, timeToLean: Number.NaN, counterLeanDeg: Number.NaN, counterSteerDeg: Number.NaN };
    const bike = create(full.leanSpeed);
    let current = launchTo(bike, full.leanSpeed, dt);
    const leans: number[] = [];
    const steers: number[] = [];
    let lateral = 0;
    let samples = 0;
    const tail = Math.ceil(1.5 / dt);
    for (let i = 0; i < Math.ceil(2 / dt); i += 1) {
      const hold = holdSpeed(full.leanSpeed, current);
      const step = bike.tick(dt, axis(hold.throttle, hold.brake, 1));
      current = step.forwardSpeed;
      if (i >= tail) {
        lateral += Math.abs(step.yawRate * step.forwardSpeed);
        samples += 1;
      }
      leans.push(step.lean);
      steers.push(step.steerAngle);
    }
    const steady = leans[leans.length - 1] ?? 0;
    const index = leans.findIndex((value) => Math.sign(value) === Math.sign(steady) && Math.abs(value) >= Math.abs(steady) * 0.9);
    let counter = 0;
    let counterSteer = 0;
    for (let i = 0; i < Math.min(leans.length, Math.ceil(0.4 / dt)); i += 1) {
      const value = leans[i] ?? 0;
      if (Math.sign(value) === -Math.sign(steady)) counter = Math.max(counter, Math.abs(value));
      const bar = steers[i] ?? 0;
      if (Math.sign(bar) === -Math.sign(steady)) counterSteer = Math.max(counterSteer, Math.abs(bar));
    }
    return {
      steadyLeanDeg: Math.abs(steady) * RAD_TO_DEG,
      steadyLateralG: lateral / Math.max(1, samples) / G,
      timeToLean: index < 0 ? Number.POSITIVE_INFINITY : (index + 1) * dt,
      counterLeanDeg: counter * RAD_TO_DEG,
      counterSteerDeg: counterSteer * RAD_TO_DEG,
    };
  })();
  return {
    zeroTo100,
    zeroTo200,
    brake100To0,
    ...lean,
    laneChangeSpeed: runs("laneChange") ? highestClean((entry) => laneChangeClears(create, entry, full), 30, 150) : Number.NaN,
    slalomSpeed: runs("slalom") ? highestClean((entry) => slalomClears(create, entry, full), 20, 120) : Number.NaN,
  };
}
