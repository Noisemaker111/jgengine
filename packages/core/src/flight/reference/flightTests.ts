// @skill jgengine-world
import { createRigidAircraft, type RigidAircraftOptions, type RigidAircraftTuning } from "../aircraftDynamics";
import { trimReferenceAircraft } from "./aircraftTrim";
import { createReferenceAircraft, type ReferenceAircraftModel, type ReferenceAircraftOptions, type ReferenceActuator } from "./referenceAircraft";

/** Stick, throttle and brakes, the `RigidAircraftInput` shape. */
export interface FlightTestControls {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  brake: number;
}

/** What a flight test reads each tick, in the same units and signs for every subject. */
export interface FlightTestSample {
  time: number;
  /** Height above the start, m. */
  altitude: number;
  climbRate: number;
  /** True airspeed, m/s. */
  airspeed: number;
  /** Equivalent airspeed, m/s (true airspeed for a constant-density game model). */
  equivalentAirspeed: number;
  /** Rad; positive nose up, right wing down, nose right. */
  pitch: number;
  bank: number;
  heading: number;
  /** Rad/s; positive nose up, right roll, nose right. */
  pitchRate: number;
  rollRate: number;
  /** Horizontal distance from the start, m. */
  distance: number;
  onGround: boolean;
  stalled: boolean;
  /** Sideslip, rad, positive with the body moving to its right. */
  sideslip: number;
  /** Mach number, or `0` where the model has none. */
  mach: number;
}

/** Anything the flight tests can fly: the reference sim or a game model behind an adapter. */
export interface FlightTestSubject {
  readonly name: string;
  /** A comfortable cruise speed to start the tests from, equivalent airspeed m/s. */
  readonly cruiseSpeed: number;
  /** Starts level at an equivalent airspeed, m/s, heading north; returns the steady pitch stick and throttle it needs, when known. */
  startAirborne(equivalentAirspeed: number, altitudeOffset?: number): { pitch: number; throttle: number };
  /** Starts at rest on the runway, brakes on. */
  startOnGround(): void;
  step(dt: number, controls: FlightTestControls): FlightTestSample;
  /** Fastest the subject's data is valid for, Mach (default no limit). */
  readonly maxMach?: number;
}

/** Results of {@link runFlightTests}, SI units. `NaN` where a test could not finish. */
export interface FlightTestReport {
  /** Lowest equivalent airspeed reached holding altitude at idle, wings level, m/s. */
  stallSpeed: number;
  /** Level top speed at full throttle, true airspeed m/s. */
  maxLevelSpeed: number;
  /** Best steady climb at full throttle over a sweep of climb speeds, m/s. */
  maxClimbRate: number;
  /** Equivalent airspeed of that best climb, m/s. */
  bestClimbSpeed: number;
  /** Peak roll rate under full aileron from level flight at twice the stall speed, deg/s. */
  rollRate: number;
  /** Best level turn rate at full throttle that holds its speed (zero excess power) over a sweep of speeds, deg/s. */
  sustainedTurnRate: number;
  /** Equivalent airspeed of that best sustained turn, m/s. */
  sustainedTurnSpeed: number;
  /** Ground roll from brake release to lift-off at full throttle, rotating at 1.1× stall speed, m. */
  takeoffGroundRoll: number;
}

/** Scenario settings. */
export interface FlightTestOptions {
  /** Control tick, s (default `1/60`). */
  dt?: number;
  /** Pitch loop gains, stick per rad and stick per rad/s (default `1`, `0.2`). */
  pitchGain?: number;
  pitchDamping?: number;
  /** Speeds the sustained turn sweep tries, as multiples of the stall speed (default 1.4 to 5). */
  turnSpeeds?: readonly number[];
  /** Climb speeds tried, as multiples of the stall speed (default 1.2 to 2.2). */
  climbSpeeds?: readonly number[];
  /** Pitch attitude held after rotation, rad (default `0.2`). */
  rotationPitch?: number;
}

const DEG = 180 / Math.PI;
const G = 9.80665;
const TURN_ENTRY = 8;
const TURN_WINDOW = 6;
const MAX_TURN_BANK = (85 * Math.PI) / 180;
const KNOT = 0.514444;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function wrapPi(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function stickFor(actuator: ReferenceActuator, deflection: number): number {
  if (actuator.atFullPositive !== 0 && Math.sign(deflection) === Math.sign(actuator.atFullPositive)) return deflection / actuator.atFullPositive;
  if (actuator.atFullNegative !== 0) return -deflection / actuator.atFullNegative;
  return 0;
}

/**
 * Wraps a reference model as a {@link FlightTestSubject}. Airborne starts are trimmed, so a scenario begins in steady
 * flight; the air is sea-level standard at the start and the ground far below unless the test is on the runway.
 * @capability flight-tests fly a reference aircraft model through the flight tests
 */
export function referenceFlightSubject(model: ReferenceAircraftModel, cruiseSpeed: number, options: ReferenceAircraftOptions = {}): FlightTestSubject & { maxMach: number } {
  const airborne = createReferenceAircraft(model, { ...options, groundElevation: () => -20000 });
  const runway = createReferenceAircraft(model, options);
  let active = airborne;
  let startNorth = 0;
  let startEast = 0;
  let startAltitude = 0;
  const atmosphere = airborne.options.atmosphere;
  return {
    name: model.name,
    cruiseSpeed,
    maxMach: 0.95,
    startAirborne(eas, altitudeOffset = 0) {
      active = airborne;
      startAltitude = altitudeOffset;
      const density = atmosphere(altitudeOffset).density;
      const tas = eas * Math.sqrt(1.225 / density);
      const trim = trimReferenceAircraft(airborne, { airspeed: tas, altitude: altitudeOffset });
      if (trim.converged) {
        airborne.restore(trim.state);
        startNorth = 0;
        startEast = 0;
        return { pitch: stickFor(model.controls.elevator, trim.surfaces.elevator), throttle: trim.throttle };
      }
      airborne.reset({ altitude: altitudeOffset, airspeed: tas, alpha: 0.05, throttle: 0.5 });
      return { pitch: 0, throttle: 0.5 };
    },
    startOnGround() {
      active = runway;
      runway.restOnGround();
      const state = runway.snapshot();
      startNorth = state.position[0];
      startEast = state.position[1];
      startAltitude = -state.position[2];
    },
    step(dt, controls) {
      const s = active.step(dt, controls);
      return {
        time: s.time,
        altitude: s.altitude - startAltitude,
        climbRate: s.climbRate,
        airspeed: s.airspeed,
        equivalentAirspeed: s.equivalentAirspeed,
        pitch: s.pitch,
        bank: s.bank,
        heading: s.heading,
        pitchRate: s.q,
        rollRate: s.p,
        distance: Math.hypot(s.position[0] - startNorth, s.position[1] - startEast),
        onGround: s.onGround,
        stalled: s.stalled,
        sideslip: s.beta,
        mach: s.mach,
      };
    },
  };
}

/**
 * Wraps a game `RigidAircraftTuning` as a {@link FlightTestSubject}, flown exactly as the game runs it: its assists
 * stay on, air density is the model's default, and the ground is flat at `y = 0`.
 * @capability flight-tests fly a game RigidAircraft through the flight tests
 */
export function rigidAircraftFlightSubject(name: string, tuning: RigidAircraftTuning, cruiseSpeed: number, options: RigidAircraftOptions = {}): FlightTestSubject {
  const altitude = 3000;
  let aircraft = createRigidAircraft(tuning, options);
  let start: readonly [number, number, number] = [0, 0, 0];
  let time = 0;
  const density = options.airDensity;
  return {
    name,
    cruiseSpeed,
    startAirborne(eas) {
      aircraft = createRigidAircraft(tuning, { ...options, position: [0, altitude, 0], velocity: [0, 0, eas] });
      start = [0, altitude, 0];
      time = 0;
      return { pitch: 0, throttle: 0.5 };
    },
    startOnGround() {
      const height = tuning.gear?.height ?? 0;
      aircraft = createRigidAircraft(tuning, { ...options, position: [0, height, 0] });
      start = [0, height, 0];
      time = 0;
    },
    step(dt, controls) {
      const s = aircraft.tick(dt, { throttle: controls.throttle, pitch: controls.pitch, roll: controls.roll, yaw: controls.yaw, brake: controls.brake });
      time += dt;
      const rho = density === undefined ? 1.225 : density(s.position[1]);
      return {
        time,
        altitude: s.position[1] - start[1],
        climbRate: s.velocity[1],
        airspeed: s.airspeed,
        equivalentAirspeed: s.airspeed * Math.sqrt(rho / 1.225),
        pitch: s.pitch,
        bank: s.bank,
        heading: s.heading,
        pitchRate: s.pitchRate,
        rollRate: s.rollRate,
        distance: Math.hypot(s.position[0] - start[0], s.position[2] - start[2]),
        onGround: s.grounded,
        stalled: s.stalled,
        sideslip: s.sideslip,
        mach: s.airspeed / 340.294,
      };
    },
  };
}

interface Pilot {
  pitchGain: number;
  pitchDamping: number;
}

/** Elevator stick for a pitch attitude target: PI on the attitude error with rate damping. */
function createAttitudeHold(pilot: Pilot, trim: number): (sample: FlightTestSample, target: number, dt: number) => number {
  let integral = trim;
  return (sample, target, dt) => {
    const error = wrapPi(target - sample.pitch);
    integral = clamp(integral + 0.5 * pilot.pitchGain * error * dt, -1, 1);
    return clamp(integral + pilot.pitchGain * error - pilot.pitchDamping * sample.pitchRate, -1, 1);
  };
}

/** Elevator stick holding the start altitude: flight-path error sets a pitch attitude target for the attitude loop. */
function createAltitudeHold(pilot: Pilot, trim: number): (sample: FlightTestSample, dt: number) => number {
  const attitude = createAttitudeHold(pilot, trim);
  let base: number | undefined;
  return (sample, dt) => {
    base ??= sample.pitch;
    const climbTarget = clamp(-0.2 * sample.altitude, -5, 5);
    const pathError = clamp((climbTarget - sample.climbRate) / Math.max(10, sample.airspeed), -0.3, 0.3);
    base = clamp(base + 0.3 * pathError * dt, -0.5, 1);
    return attitude(sample, base + pathError, dt);
  };
}

function wingsLevel(sample: FlightTestSample, bank = 0): number {
  return clamp(2 * wrapPi(bank - sample.bank) - 0.4 * sample.rollRate, -1, 1);
}

function controls(throttle: number, pitch: number, roll: number, yaw = 0, brake = 0): FlightTestControls {
  return { throttle, pitch, roll, yaw, brake };
}

/** A test pilot's hands in manoeuvring flight: rudder keeps the ball centred, and a stall gets the stick pushed. */
function flown(sample: FlightTestSample, throttle: number, pitch: number, roll: number): FlightTestControls {
  return controls(throttle, sample.stalled ? Math.min(pitch, -0.3) : pitch, roll, clamp(3 * sample.sideslip, -1, 1));
}

/**
 * Flies one subject through the standard flight tests with simple deterministic autopilots: the idle stall at constant
 * altitude, full-throttle level top speed, a constant-speed climb sweep, a full-aileron roll at twice the stall speed,
 * a sustained turn found by bisecting the bank to zero excess power at each speed, and a full-throttle take-off. Every subject flies the same manoeuvres, so a game
 * model and a reference airframe compare metric by metric.
 * @capability flight-tests fly any aircraft model through stall, top speed, climb, roll, sustained turn and take-off tests
 */
export function runFlightTests(subject: FlightTestSubject, options: FlightTestOptions = {}): FlightTestReport {
  const dt = options.dt ?? 1 / 60;
  const pilot: Pilot = { pitchGain: options.pitchGain ?? 1, pitchDamping: options.pitchDamping ?? 0.2 };
  const steps = (seconds: number) => Math.ceil(seconds / dt);
  const maxMach = subject.maxMach ?? Number.POSITIVE_INFINITY;

  // Stall: idle, wings level, hold altitude until it can't.
  const entry = subject.cruiseSpeed;
  let stallSpeed = Number.NaN;
  {
    const trim = subject.startAirborne(entry);
    const hold = createAltitudeHold(pilot, trim.pitch);
    let sample = subject.step(dt, controls(0, trim.pitch, 0));
    let lowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < steps(240); i += 1) {
      sample = subject.step(dt, controls(0, hold(sample, dt), wingsLevel(sample), clamp(3 * sample.sideslip, -1, 1)));
      lowest = Math.min(lowest, sample.equivalentAirspeed);
      if (sample.altitude < -20) break;
    }
    stallSpeed = lowest;
  }
  if (!Number.isFinite(stallSpeed)) stallSpeed = 30;

  // Level top speed at full throttle.
  let maxLevelSpeed = Number.NaN;
  {
    const trim = subject.startAirborne(Math.max(2 * stallSpeed, 0.6 * entry));
    const hold = createAltitudeHold(pilot, trim.pitch);
    let sample = subject.step(dt, controls(1, trim.pitch, 0));
    const tail: number[] = [];
    let valid = true;
    for (let i = 0; i < steps(300); i += 1) {
      sample = subject.step(dt, flown(sample, 1, hold(sample, dt), wingsLevel(sample)));
      if (sample.mach > maxMach) {
        valid = false;
        break;
      }
      if (i >= steps(280)) tail.push(sample.airspeed);
    }
    if (valid && tail.length > 0) maxLevelSpeed = tail.reduce((a, b) => a + b, 0) / tail.length;
  }

  // Climb sweep: hold each equivalent airspeed with pitch attitude at full throttle.
  let maxClimbRate = Number.NaN;
  let bestClimbSpeed = Number.NaN;
  for (const factor of options.climbSpeeds ?? [1.2, 1.4, 1.6, 1.8, 2.0, 2.2]) {
    const target = factor * stallSpeed;
    const climb = (offset: number): number => {
      const trim = subject.startAirborne(target, offset);
      const attitude = createAttitudeHold(pilot, trim.pitch);
      let pitchTarget = 0;
      let sample = subject.step(dt, controls(1, trim.pitch, 0));
      let sum = 0;
      let count = 0;
      for (let i = 0; i < steps(30); i += 1) {
        // Too fast pitches up, too slow pitches down: the classic constant-airspeed climb.
        pitchTarget = clamp(pitchTarget + 0.02 * (sample.equivalentAirspeed - target) * dt, -0.3, 1.2);
        const command = clamp(pitchTarget + 0.03 * (sample.equivalentAirspeed - target), -0.3, 1.2);
        sample = subject.step(dt, flown(sample, 1, attitude(sample, command, dt), wingsLevel(sample)));
        if (sample.mach > maxMach) return Number.NaN;
        if (i >= steps(20)) {
          sum += sample.climbRate;
          count += 1;
        }
      }
      return Math.abs(sample.equivalentAirspeed - target) < 0.08 * target ? sum / count : Number.NaN;
    };
    const first = climb(0);
    // Start low enough that the measured window sits at the start altitude.
    const rate = Number.isFinite(first) ? climb(-25 * first) : Number.NaN;
    if (Number.isFinite(rate) && !(rate <= maxClimbRate)) {
      maxClimbRate = rate;
      bestClimbSpeed = target;
    }
  }

  const testSpeed = 2 * stallSpeed;

  // Full-aileron roll from level flight.
  let rollRate = 0;
  {
    const trim = subject.startAirborne(testSpeed);
    const attitude = createAttitudeHold(pilot, trim.pitch);
    let sample = subject.step(dt, controls(trim.throttle, trim.pitch, 0));
    const level = sample.pitch;
    for (let i = 0; i < steps(3); i += 1) {
      sample = subject.step(dt, controls(trim.throttle, attitude(sample, level, dt), 1));
      rollRate = Math.max(rollRate, Math.abs(sample.rollRate));
    }
  }

  // Sustained turn: at each speed, full throttle, the bank is bisected until the level turn's specific excess power
  // (energy height rate) measured just after roll-in is zero; that bank's measured turn rate is the sustained rate there.
  const turnAt = (target: number, bank: number): { excessPower: number; rate: number } => {
    const trim = subject.startAirborne(target);
    let sample = subject.step(dt, controls(1, trim.pitch, 0));
    let integral = trim.pitch;
    let turned = 0;
    let start: { time: number; energy: number; heading: number } | undefined;
    for (let i = 0; i < steps(TURN_ENTRY + TURN_WINDOW); i += 1) {
      const previous = sample.heading;
      const speed = Math.max(10, sample.airspeed);
      const climbTarget = clamp(-0.5 * sample.altitude, -10, 10);
      const pathRate = (0.8 * (climbTarget - sample.climbRate)) / speed;
      const loadFactor = ((pathRate * speed) / G + 1) / Math.max(0.05, Math.cos(sample.bank));
      const error = (G / speed) * (loadFactor - Math.cos(sample.bank)) - sample.pitchRate;
      integral = clamp(integral + pilot.pitchGain * 4 * error * dt, -1, 1);
      const pitch = clamp(integral + pilot.pitchGain * 2 * error, -1, 1);
      sample = subject.step(dt, flown(sample, 1, pitch, wingsLevel(sample, bank)));
      if (sample.stalled) return { excessPower: Number.NEGATIVE_INFINITY, rate: 0 };
      turned += wrapPi(sample.heading - previous);
      if (i === steps(TURN_ENTRY)) start = { time: sample.time, energy: sample.altitude + sample.airspeed ** 2 / (2 * G), heading: turned };
    }
    if (start === undefined) return { excessPower: Number.NEGATIVE_INFINITY, rate: 0 };
    const seconds = sample.time - start.time;
    const energy = sample.altitude + sample.airspeed ** 2 / (2 * G);
    return { excessPower: (energy - start.energy) / seconds, rate: (Math.abs(turned - start.heading) / seconds) * DEG };
  };
  let sustainedTurnRate = 0;
  let sustainedTurnSpeed = Number.NaN;
  for (const factor of options.turnSpeeds ?? [1.4, 1.7, 2, 2.5, 3, 3.5, 4, 5]) {
    const target = factor * stallSpeed;
    if (subject.startAirborne(target) && subject.step(dt, controls(1, 0, 0)).mach > 0.9 * maxMach) continue;
    let low = 0;
    let high = MAX_TURN_BANK;
    let best = turnAt(target, low);
    if (best.excessPower < 0) continue;
    const steepest = turnAt(target, high);
    if (steepest.excessPower >= 0) best = steepest;
    else {
      for (let i = 0; i < 10; i += 1) {
        const middle = (low + high) / 2;
        const result = turnAt(target, middle);
        if (result.excessPower >= 0) {
          low = middle;
          best = result;
        } else high = middle;
      }
    }
    if (best.rate > sustainedTurnRate) {
      sustainedTurnRate = best.rate;
      sustainedTurnSpeed = target;
    }
  }

  // Take-off: full throttle on the brakes, release, keep straight, rotate at 1.1 × stall.
  let takeoffGroundRoll = Number.NaN;
  {
    subject.startOnGround();
    let sample = subject.step(dt, controls(0, 0, 0, 0, 1));
    for (let i = 0; i < steps(3); i += 1) sample = subject.step(dt, controls(1, 0, 0, 0, 1));
    const release = sample.distance;
    const attitude = createAttitudeHold(pilot, 0);
    const rotate = 1.1 * stallSpeed;
    let rotating = false;
    let airborneFor = 0;
    let liftOff = Number.NaN;
    for (let i = 0; i < steps(120); i += 1) {
      if (sample.equivalentAirspeed >= rotate) rotating = true;
      const pitch = rotating ? attitude(sample, options.rotationPitch ?? 0.2, dt) : 0;
      const yaw = clamp(-2 * wrapPi(sample.heading) - 0.5 * 0, -1, 1);
      sample = subject.step(dt, controls(1, pitch, wingsLevel(sample), yaw, 0));
      if (!sample.onGround) {
        if (airborneFor === 0) liftOff = sample.distance - release;
        airborneFor += dt;
        if (airborneFor > 1) break;
      } else airborneFor = 0;
    }
    if (airborneFor > 1) takeoffGroundRoll = liftOff;
  }

  return { stallSpeed, maxLevelSpeed, maxClimbRate, bestClimbSpeed, rollRate: rollRate * DEG, sustainedTurnRate, sustainedTurnSpeed, takeoffGroundRoll };
}

/** Knots in one m/s. */
export const KNOTS_PER_MPS = 1 / KNOT;
