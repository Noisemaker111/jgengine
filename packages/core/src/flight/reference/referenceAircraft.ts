// @skill jgengine-world
import { calibratedAirspeed, standardAtmosphere, standardGravity, type AtmosphereModel, type AtmosphereSample } from "./standardAtmosphere";

/** Three numbers, body axes (x forward, y right, z down) or north-east-down axes. */
export type ReferenceVector = [number, number, number];

/** Air data the aerodynamic model reads, SI units and radians. */
export interface ReferenceAirData {
  /** True airspeed, m/s. */
  airspeed: number;
  /** Angle of attack, rad. */
  alpha: number;
  /** Sideslip, rad, positive with the relative wind from the right. */
  beta: number;
  mach: number;
  /** Dynamic pressure, Pa. */
  dynamicPressure: number;
  /** Air density, kg/m³. */
  density: number;
  /** Geometric altitude above mean sea level, m. */
  altitude: number;
  /** Height of the centre of gravity above the ground, m. */
  heightAboveGround: number;
  /** Body roll, pitch and yaw rates, rad/s. */
  p: number;
  q: number;
  r: number;
  /** The air state at this altitude. */
  air: AtmosphereSample;
}

/** Surface deflections, rad, in the model's own sign convention. */
export interface ReferenceSurfaces {
  elevator: number;
  aileron: number;
  rudder: number;
  flap: number;
}

/**
 * Body-axis aerodynamic coefficients about the centre of gravity, written by a model's `aerodynamics`. Forces are
 * `q̄·S·C`, rolling and yawing moments `q̄·S·b·C`, pitching moment `q̄·S·c̄·C`.
 */
export interface ReferenceAeroCoefficients {
  cx: number;
  cy: number;
  cz: number;
  cl: number;
  cm: number;
  cn: number;
  /** Derivatives of `cx`, `cz`, `cm` with respect to `α̇·c̄/2V`; the integrator solves the implicit α̇ term exactly. */
  cxAlphaDot: number;
  czAlphaDot: number;
  cmAlphaDot: number;
}

/** What a propulsion model writes each evaluation: body-axis force and moment, rotor angular momentum, state rates. */
export interface ReferencePropulsionOutput {
  force: ReferenceVector;
  moment: ReferenceVector;
  /** Angular momentum of spinning engine parts in body axes, kg·m²/s; it adds the gyroscopic moment. */
  angularMomentum: ReferenceVector;
  /** Time derivative of each propulsion state. */
  rates: number[];
  /** Thrust along body x, N, for telemetry. */
  thrust: number;
  /** Shaft power delivered to a propeller, W, for telemetry (0 for a jet). */
  shaftPower: number;
  /** Shaft speed, rev/min, for telemetry (0 for a jet). */
  rpm: number;
}

/** An engine and whatever it drives, with its own integrated states. */
export interface ReferencePropulsion {
  /** Names of the integrated states, in order. */
  readonly stateNames: readonly string[];
  /**
   * Writes the steady states for a throttle setting in this air (trim and a clean start). `surfaces` are the control
   * actuator positions, for propulsion they drive (a rotor's cyclic and tail pitch).
   */
  settle(throttle: number, air: ReferenceAirData, state: number[], surfaces?: ReferenceSurfaces): void;
  /** Evaluates forces, moments and state rates. `state` holds this model's states only. */
  evaluate(state: readonly number[], throttle: number, air: ReferenceAirData, out: ReferencePropulsionOutput, surfaces?: ReferenceSurfaces): void;
}

/** One surface actuator: where full pilot input puts it, and how fast it gets there. */
export interface ReferenceActuator {
  /** Deflection at full positive pilot input (nose up, right roll, nose right), rad. */
  atFullPositive: number;
  /** Deflection at full negative pilot input, rad. */
  atFullNegative: number;
  /** First-order bandwidth, rad/s. */
  bandwidth: number;
  /** Slew rate limit, rad/s. */
  rateLimit: number;
}

/**
 * One landing gear leg: a massless strut spring-damper at the wheel's contact point and a tyre with rolling
 * resistance, brakes and slip-angle side force that saturates at the friction limit.
 */
export interface ReferenceGearLeg {
  name: string;
  /** Tyre contact point with the strut fully extended, body axes m from the centre of gravity. */
  at: ReferenceVector;
  /** Strut spring rate, N/m. */
  stiffness: number;
  /** Strut damping, N·s/m. */
  damping: number;
  /** Strut travel before it bottoms, m; past it the spring is ten times stiffer. */
  travel: number;
  /** Rolling resistance coefficient with brakes off. */
  rollingFriction: number;
  /** Braking friction coefficient at full brake; `0` for an unbraked wheel. */
  brakeFriction: number;
  /** Peak side friction coefficient. */
  sideFriction: number;
  /** Side force per unit load per radian of slip angle before it saturates (cornering stiffness over load). */
  corneringStiffness: number;
  /** Steering angle at full yaw pedal, rad; `0` for a fixed or castering wheel. */
  steering: number;
}

/** Mass and inertia about the centre of gravity, body axes. */
export interface ReferenceMassProperties {
  massKg: number;
  /** kg·m²; `ixz` is the product of inertia (positive with the nose-down principal axis tilt convention of Stevens & Lewis). */
  ixx: number;
  iyy: number;
  izz: number;
  ixz: number;
}

/** A complete reference airframe: geometry, mass, aerodynamics, controls, propulsion and gear. */
export interface ReferenceAircraftModel {
  readonly name: string;
  readonly mass: ReferenceMassProperties;
  /** Reference wing area, m². */
  readonly wingArea: number;
  /** Reference span, m. */
  readonly span: number;
  /** Mean aerodynamic chord, m. */
  readonly chord: number;
  /** Writes body-axis coefficients about the centre of gravity. */
  aerodynamics(air: ReferenceAirData, surfaces: ReferenceSurfaces, out: ReferenceAeroCoefficients): void;
  readonly controls: { elevator: ReferenceActuator; aileron: ReferenceActuator; rudder: ReferenceActuator; flap?: ReferenceActuator };
  readonly propulsion: ReferencePropulsion;
  readonly gear: readonly ReferenceGearLeg[];
  /** Angle of attack where the wing's lift peaks, rad; telemetry reports `stalled` past it. */
  readonly stallAlpha: number;
}

/** Pilot input, the same shape as `RigidAircraftInput`. */
export interface ReferencePilotInput {
  /** `0..1`. */
  throttle: number;
  /** `-1..1`, positive nose up. */
  pitch: number;
  /** `-1..1`, positive right roll. */
  roll: number;
  /** `-1..1`, positive nose right (also steers the nosewheel). */
  yaw: number;
  /** Wheel brakes, `0..1`. */
  brake?: number;
  /** Flap lever, `0..1`. */
  flap?: number;
}

/** Serializable integrator state. */
export interface ReferenceAircraftState {
  time: number;
  /** North, east, down position, m (down is minus altitude). */
  position: ReferenceVector;
  /** Velocity over the ground in body axes, m/s. */
  velocity: ReferenceVector;
  /** Unit quaternion `[w, x, y, z]` taking body axes to north-east-down axes. */
  attitude: [number, number, number, number];
  /** Body rates p, q, r, rad/s. */
  rates: ReferenceVector;
  surfaces: ReferenceSurfaces;
  /** Propulsion states in `model.propulsion.stateNames` order. */
  propulsion: number[];
}

/** Telemetry for the current state. */
export interface ReferenceAircraftSample {
  time: number;
  position: ReferenceVector;
  altitude: number;
  heightAboveGround: number;
  /** Velocity over the ground, north-east-down, m/s. */
  groundVelocity: ReferenceVector;
  /** Rate of climb, m/s. */
  climbRate: number;
  /** True airspeed, m/s. */
  airspeed: number;
  /** Equivalent airspeed, m/s. */
  equivalentAirspeed: number;
  /** Calibrated airspeed, m/s. */
  calibratedAirspeed: number;
  mach: number;
  alpha: number;
  beta: number;
  /** Euler angles, rad (yaw-pitch-roll order). */
  heading: number;
  pitch: number;
  bank: number;
  /** Body rates, rad/s. */
  p: number;
  q: number;
  r: number;
  /** Load factor along body −z, g. */
  loadFactor: number;
  surfaces: ReferenceSurfaces;
  thrust: number;
  shaftPower: number;
  rpm: number;
  /** Vertical load on each gear leg, N, in `model.gear` order. */
  gearLoads: number[];
  onGround: boolean;
  stalled: boolean;
}

/** Wind at a point and time: mean wind plus any turbulence, north-east-down m/s. */
export type ReferenceWind = (position: ReferenceVector, time: number) => ReferenceVector;

/** World hooks for a reference aircraft. */
export interface ReferenceAircraftOptions {
  /** Default {@link standardAtmosphere}. */
  atmosphere?: AtmosphereModel;
  /** Gravity at a geometric altitude, m/s² (default inverse-square from 9.80665). */
  gravity?: (altitude: number) => number;
  wind?: ReferenceWind;
  /** Ground elevation above mean sea level at a north/east point, m (default `0`). */
  groundElevation?: (north: number, east: number) => number;
  /** Fixed RK4 step, s (default `1/400`). */
  step?: number;
}

/** Where and how a reference aircraft starts. */
export interface ReferenceInitialCondition {
  north?: number;
  east?: number;
  /** Geometric altitude of the centre of gravity, m. */
  altitude: number;
  /** True airspeed along the flight path, m/s. */
  airspeed: number;
  /** Rad. */
  heading?: number;
  pitch?: number;
  bank?: number;
  /** Angle of attack, rad; the body pitches up by this over the flight path. */
  alpha?: number;
  throttle?: number;
}

/** A reference 6-DOF aircraft: rigid body, quaternion attitude, fixed-step RK4. */
export interface ReferenceAircraft {
  readonly model: ReferenceAircraftModel;
  readonly options: Readonly<Required<Omit<ReferenceAircraftOptions, "wind">>> & { wind: ReferenceWind | undefined };
  /** Advances `dt` seconds in equal RK4 steps no longer than the configured step. */
  step(dt: number, input: ReferencePilotInput): ReferenceAircraftSample;
  sample(): ReferenceAircraftSample;
  snapshot(): ReferenceAircraftState;
  restore(state: ReferenceAircraftState): void;
  reset(initial: ReferenceInitialCondition): void;
  /** Puts the aircraft at rest with every gear leg loaded on level ground under `north`/`east`, after settling. */
  restOnGround(north?: number, east?: number, heading?: number): void;
  /** Time derivative of a state under an input, in state shape; surfaces and propulsion rates included. */
  derivative(state: ReferenceAircraftState, input: ReferencePilotInput): ReferenceAircraftState;
  /** Telemetry of an arbitrary state. */
  sampleOf(state: ReferenceAircraftState, input?: ReferencePilotInput): ReferenceAircraftSample;
}

const BASE = 17;
const IDLE: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };

/**
 * Quaternion `[w, x, y, z]` from yaw-pitch-roll Euler angles, rad.
 * @capability reference-aircraft attitude quaternion from heading, pitch and bank
 */
export function referenceQuaternion(heading: number, pitch: number, bank: number): [number, number, number, number] {
  const cy = Math.cos(heading / 2);
  const sy = Math.sin(heading / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cr = Math.cos(bank / 2);
  const sr = Math.sin(bank / 2);
  return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy];
}

/**
 * Yaw-pitch-roll Euler angles, rad, of a body-to-NED quaternion `[w, x, y, z]`.
 * @capability reference-aircraft Euler angles from an attitude quaternion
 */
export function referenceEuler(q: readonly [number, number, number, number]): { heading: number; pitch: number; bank: number } {
  const [q0, q1, q2, q3] = q;
  const c11 = q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3;
  const c21 = 2 * (q1 * q2 + q0 * q3);
  const c31 = 2 * (q1 * q3 - q0 * q2);
  const c32 = 2 * (q2 * q3 + q0 * q1);
  const c33 = q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3;
  return { heading: Math.atan2(c21, c11), pitch: -Math.asin(Math.max(-1, Math.min(1, c31))), bank: Math.atan2(c32, c33) };
}

function slew(actuator: ReferenceActuator, command: number, position: number): number {
  const target = command >= 0 ? command * actuator.atFullPositive : -command * actuator.atFullNegative;
  const rate = actuator.bandwidth * (target - position);
  return Math.max(-actuator.rateLimit, Math.min(actuator.rateLimit, rate));
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * Creates a {@link ReferenceAircraft}: a flat, non-rotating Earth 6-DOF rigid body with quaternion attitude, a full
 * inertia tensor (with the `Ixz` product) plus gyroscopic engine momentum, gravity falling off with altitude, an
 * injected atmosphere and wind, the α̇ aerodynamic terms solved implicitly, first-order rate-limited actuators,
 * propulsion states, and spring-damper gear with tyre friction. Integrates with classic fourth-order Runge–Kutta at a
 * fixed step, so halving the step cuts the error about sixteen-fold. It is a measuring stick for game flight models,
 * not a game's runtime.
 * @capability reference-aircraft 6-DOF reference flight sim — quaternion rigid body, RK4, standard atmosphere, coefficient-table aero, gear, wind
 */
export function createReferenceAircraft(model: ReferenceAircraftModel, options: ReferenceAircraftOptions = {}): ReferenceAircraft {
  const atmosphere = options.atmosphere ?? standardAtmosphere;
  const gravityAt = options.gravity ?? standardGravity;
  const windAt = options.wind;
  const groundAt = options.groundElevation ?? (() => 0);
  const h = options.step ?? 1 / 400;
  const propulsionSize = model.propulsion.stateNames.length;
  const size = BASE + propulsionSize;
  const { massKg, ixx, iyy, izz, ixz } = model.mass;
  const det = ixx * izz - ixz * ixz;

  let values: number[] = new Array<number>(size).fill(0);
  let time = 0;
  let lastInput: ReferencePilotInput = IDLE;

  const k1 = new Array<number>(size).fill(0);
  const k2 = new Array<number>(size).fill(0);
  const k3 = new Array<number>(size).fill(0);
  const k4 = new Array<number>(size).fill(0);
  const scratch = new Array<number>(size).fill(0);
  const propState = new Array<number>(propulsionSize).fill(0);
  const coefficients: ReferenceAeroCoefficients = { cx: 0, cy: 0, cz: 0, cl: 0, cm: 0, cn: 0, cxAlphaDot: 0, czAlphaDot: 0, cmAlphaDot: 0 };
  const propulsionOut: ReferencePropulsionOutput = {
    force: [0, 0, 0],
    moment: [0, 0, 0],
    angularMomentum: [0, 0, 0],
    rates: new Array<number>(propulsionSize).fill(0),
    thrust: 0,
    shaftPower: 0,
    rpm: 0,
  };
  const surfaces: ReferenceSurfaces = { elevator: 0, aileron: 0, rudder: 0, flap: 0 };
  const gearLoads = new Array<number>(model.gear.length).fill(0);
  const air: ReferenceAirData = {
    airspeed: 0,
    alpha: 0,
    beta: 0,
    mach: 0,
    dynamicPressure: 0,
    density: 0,
    altitude: 0,
    heightAboveGround: 0,
    p: 0,
    q: 0,
    r: 0,
    air: atmosphere(0),
  };
  const telemetry = { loadFactor: 1, thrust: 0, shaftPower: 0, rpm: 0, onGround: false };

  function at(source: readonly number[], index: number): number {
    return source[index] ?? 0;
  }

  /** Writes ds/dt into `out`; fills `air`, `surfaces`, `gearLoads` and `telemetry` as a side effect. */
  function evaluate(t: number, s: readonly number[], input: ReferencePilotInput, out: number[]): void {
    const pn = at(s, 0);
    const pe = at(s, 1);
    const pd = at(s, 2);
    const u = at(s, 3);
    const v = at(s, 4);
    const w = at(s, 5);
    let q0 = at(s, 6);
    let q1 = at(s, 7);
    let q2 = at(s, 8);
    let q3 = at(s, 9);
    const p = at(s, 10);
    const q = at(s, 11);
    const r = at(s, 12);
    const norm = Math.hypot(q0, q1, q2, q3) || 1;
    q0 /= norm;
    q1 /= norm;
    q2 /= norm;
    q3 /= norm;

    // Body-to-NED direction cosines.
    const c11 = q0 * q0 + q1 * q1 - q2 * q2 - q3 * q3;
    const c12 = 2 * (q1 * q2 - q0 * q3);
    const c13 = 2 * (q1 * q3 + q0 * q2);
    const c21 = 2 * (q1 * q2 + q0 * q3);
    const c22 = q0 * q0 - q1 * q1 + q2 * q2 - q3 * q3;
    const c23 = 2 * (q2 * q3 - q0 * q1);
    const c31 = 2 * (q1 * q3 - q0 * q2);
    const c32 = 2 * (q2 * q3 + q0 * q1);
    const c33 = q0 * q0 - q1 * q1 - q2 * q2 + q3 * q3;

    const altitude = -pd;
    const sample = atmosphere(altitude);
    let ua = u;
    let va = v;
    let wa = w;
    if (windAt !== undefined) {
      const [wn, we, wd] = windAt([pn, pe, pd], t);
      ua -= c11 * wn + c21 * we + c31 * wd;
      va -= c12 * wn + c22 * we + c32 * wd;
      wa -= c13 * wn + c23 * we + c33 * wd;
    }
    const airspeed = Math.max(1e-6, Math.hypot(ua, va, wa));
    const ground = groundAt(pn, pe);
    air.airspeed = airspeed;
    air.alpha = Math.atan2(wa, ua);
    air.beta = Math.asin(clamp(va / airspeed, -1, 1));
    air.mach = airspeed / sample.speedOfSound;
    air.density = sample.density;
    air.dynamicPressure = 0.5 * sample.density * airspeed * airspeed;
    air.altitude = altitude;
    air.heightAboveGround = altitude - ground;
    air.p = p;
    air.q = q;
    air.r = r;
    air.air = sample;

    surfaces.elevator = at(s, 13);
    surfaces.aileron = at(s, 14);
    surfaces.rudder = at(s, 15);
    surfaces.flap = at(s, 16);
    model.aerodynamics(air, surfaces, coefficients);

    const throttle = clamp(input.throttle, 0, 1);
    for (let i = 0; i < propulsionSize; i += 1) propState[i] = at(s, BASE + i);
    model.propulsion.evaluate(propState, throttle, air, propulsionOut, surfaces);

    const qS = air.dynamicPressure * model.wingArea;
    let fx = qS * coefficients.cx + propulsionOut.force[0];
    let fy = qS * coefficients.cy + propulsionOut.force[1];
    let fz = qS * coefficients.cz + propulsionOut.force[2];
    let mx = qS * model.span * coefficients.cl + propulsionOut.moment[0];
    let my = qS * model.chord * coefficients.cm + propulsionOut.moment[1];
    let mz = qS * model.span * coefficients.cn + propulsionOut.moment[2];

    // Gear: strut force along the ground normal, tyre forces in the ground plane.
    let loaded = false;
    const brake = clamp(input.brake ?? 0, 0, 1);
    const pedal = clamp(input.yaw, -1, 1);
    for (let i = 0; i < model.gear.length; i += 1) {
      const leg = model.gear[i];
      gearLoads[i] = 0;
      if (leg === undefined) continue;
      const [rx, ry, rz] = leg.at;
      const contactDown = pd + c31 * rx + c32 * ry + c33 * rz;
      const penetration = contactDown + ground;
      if (penetration <= 0) continue;
      // Contact point velocity: body velocity plus ω × r, to NED.
      const bu = u + q * rz - r * ry;
      const bv = v + r * rx - p * rz;
      const bw = w + p * ry - q * rx;
      const vn = c11 * bu + c12 * bv + c13 * bw;
      const ve = c21 * bu + c22 * bv + c23 * bw;
      const vd = c31 * bu + c32 * bv + c33 * bw;
      const bottomed = Math.max(0, penetration - leg.travel);
      const load = Math.max(0, leg.stiffness * (penetration + 9 * bottomed) + leg.damping * vd);
      if (load <= 0) continue;
      loaded = true;
      gearLoads[i] = load;
      const steer = leg.steering * pedal;
      const dxb = Math.cos(steer);
      const dyb = Math.sin(steer);
      let dn = c11 * dxb + c12 * dyb;
      let de = c21 * dxb + c22 * dyb;
      const dl = Math.hypot(dn, de) || 1;
      dn /= dl;
      de /= dl;
      const roll = vn * dn + ve * de;
      const side = -vn * de + ve * dn;
      const rolling = -load * (leg.rollingFriction + brake * leg.brakeFriction) * (roll / Math.sqrt(roll * roll + 0.05 * 0.05));
      const sideLimit = leg.sideFriction * load;
      const sideForce = -sideLimit * Math.tanh((leg.corneringStiffness * side) / (leg.sideFriction * (Math.abs(roll) + 0.5)));
      const fn = rolling * dn - sideForce * de;
      const fe = rolling * de + sideForce * dn;
      const fd = -load;
      const gx = c11 * fn + c21 * fe + c31 * fd;
      const gy = c12 * fn + c22 * fe + c32 * fd;
      const gz = c13 * fn + c23 * fe + c33 * fd;
      fx += gx;
      fy += gy;
      fz += gz;
      mx += ry * gz - rz * gy;
      my += rz * gx - rx * gz;
      mz += rx * gy - ry * gx;
    }

    const g = gravityAt(altitude);
    const gx = c31 * g;
    const gy = c32 * g;
    const gz = c33 * g;
    let du = fx / massKg + gx - (q * w - r * v);
    const dv = fy / massKg + gy - (r * u - p * w);
    let dw = fz / massKg + gz - (p * v - q * u);

    // α̇ terms: the force and moment they add depend on α̇, which depends on them; solve the linear loop exactly.
    const cOver2V = model.chord / (2 * airspeed);
    const kx = (qS * coefficients.cxAlphaDot * cOver2V) / massKg;
    const kz = (qS * coefficients.czAlphaDot * cOver2V) / massKg;
    let alphaDot = 0;
    const uw2 = ua * ua + wa * wa;
    if (uw2 > 1e-9 && (kx !== 0 || kz !== 0 || coefficients.cmAlphaDot !== 0)) {
      // α is measured in the air, so use the air-relative rate: a steady wind seen from rotating axes adds ω × wind.
      const duAir = du + q * (w - wa) - r * (v - va);
      const dwAir = dw + p * (v - va) - q * (u - ua);
      const base = (ua * dwAir - wa * duAir) / uw2;
      const gain = (ua * kz - wa * kx) / uw2;
      alphaDot = base / (1 - gain);
      du += kx * alphaDot;
      dw += kz * alphaDot;
      my += qS * model.chord * coefficients.cmAlphaDot * cOver2V * alphaDot;
    }

    const [hx, hy, hz] = propulsionOut.angularMomentum;
    const lx = ixx * p - ixz * r + hx;
    const ly = iyy * q + hy;
    const lz = izz * r - ixz * p + hz;
    const ex = mx - (q * lz - r * ly);
    const ey = my - (r * lx - p * lz);
    const ez = mz - (p * ly - q * lx);
    const dp = (izz * ex + ixz * ez) / det;
    const dr = (ixz * ex + ixx * ez) / det;
    const dq = ey / iyy;

    out[0] = c11 * u + c12 * v + c13 * w;
    out[1] = c21 * u + c22 * v + c23 * w;
    out[2] = c31 * u + c32 * v + c33 * w;
    out[3] = du;
    out[4] = dv;
    out[5] = dw;
    // q̇ = ½ q ⊗ (0, ω), plus a term that pulls the norm back to one.
    const drift = 1 - (at(s, 6) ** 2 + at(s, 7) ** 2 + at(s, 8) ** 2 + at(s, 9) ** 2);
    const k = 2;
    out[6] = 0.5 * (-q1 * p - q2 * q - q3 * r) + k * drift * q0;
    out[7] = 0.5 * (q0 * p + q2 * r - q3 * q) + k * drift * q1;
    out[8] = 0.5 * (q0 * q - q1 * r + q3 * p) + k * drift * q2;
    out[9] = 0.5 * (q0 * r + q1 * q - q2 * p) + k * drift * q3;
    out[10] = dp;
    out[11] = dq;
    out[12] = dr;
    out[13] = slew(model.controls.elevator, clamp(input.pitch, -1, 1), surfaces.elevator);
    out[14] = slew(model.controls.aileron, clamp(input.roll, -1, 1), surfaces.aileron);
    out[15] = slew(model.controls.rudder, clamp(input.yaw, -1, 1), surfaces.rudder);
    const flap = model.controls.flap;
    out[16] = flap === undefined ? 0 : slew(flap, clamp(input.flap ?? 0, 0, 1), surfaces.flap);
    for (let i = 0; i < propulsionSize; i += 1) out[BASE + i] = propulsionOut.rates[i] ?? 0;

    // Specific force along body −z, in g: what the pilot's seat feels.
    telemetry.loadFactor = -(fz + kz * massKg * alphaDot) / (massKg * g);
    telemetry.thrust = propulsionOut.thrust;
    telemetry.shaftPower = propulsionOut.shaftPower;
    telemetry.rpm = propulsionOut.rpm;
    telemetry.onGround = loaded;
  }

  function rk4(dt: number, input: ReferencePilotInput): void {
    evaluate(time, values, input, k1);
    for (let i = 0; i < size; i += 1) scratch[i] = at(values, i) + 0.5 * dt * at(k1, i);
    evaluate(time + 0.5 * dt, scratch, input, k2);
    for (let i = 0; i < size; i += 1) scratch[i] = at(values, i) + 0.5 * dt * at(k2, i);
    evaluate(time + 0.5 * dt, scratch, input, k3);
    for (let i = 0; i < size; i += 1) scratch[i] = at(values, i) + dt * at(k3, i);
    evaluate(time + dt, scratch, input, k4);
    for (let i = 0; i < size; i += 1) values[i] = at(values, i) + (dt / 6) * (at(k1, i) + 2 * at(k2, i) + 2 * at(k3, i) + at(k4, i));
    const n = Math.hypot(at(values, 6), at(values, 7), at(values, 8), at(values, 9)) || 1;
    for (let i = 6; i < 10; i += 1) values[i] = at(values, i) / n;
    time += dt;
  }

  function pack(state: ReferenceAircraftState): number[] {
    const out = new Array<number>(size).fill(0);
    out[0] = state.position[0];
    out[1] = state.position[1];
    out[2] = state.position[2];
    out[3] = state.velocity[0];
    out[4] = state.velocity[1];
    out[5] = state.velocity[2];
    out[6] = state.attitude[0];
    out[7] = state.attitude[1];
    out[8] = state.attitude[2];
    out[9] = state.attitude[3];
    out[10] = state.rates[0];
    out[11] = state.rates[1];
    out[12] = state.rates[2];
    out[13] = state.surfaces.elevator;
    out[14] = state.surfaces.aileron;
    out[15] = state.surfaces.rudder;
    out[16] = state.surfaces.flap;
    for (let i = 0; i < propulsionSize; i += 1) out[BASE + i] = state.propulsion[i] ?? 0;
    return out;
  }

  function unpack(source: readonly number[], t: number): ReferenceAircraftState {
    return {
      time: t,
      position: [at(source, 0), at(source, 1), at(source, 2)],
      velocity: [at(source, 3), at(source, 4), at(source, 5)],
      attitude: [at(source, 6), at(source, 7), at(source, 8), at(source, 9)],
      rates: [at(source, 10), at(source, 11), at(source, 12)],
      surfaces: { elevator: at(source, 13), aileron: at(source, 14), rudder: at(source, 15), flap: at(source, 16) },
      propulsion: Array.from({ length: propulsionSize }, (_, i) => at(source, BASE + i)),
    };
  }

  function sampleFrom(source: readonly number[], t: number, input: ReferencePilotInput): ReferenceAircraftSample {
    const rates = new Array<number>(size).fill(0);
    evaluate(t, source, input, rates);
    const attitude: [number, number, number, number] = [at(source, 6), at(source, 7), at(source, 8), at(source, 9)];
    const euler = referenceEuler(attitude);
    const altitude = -at(source, 2);
    return {
      time: t,
      position: [at(source, 0), at(source, 1), at(source, 2)],
      altitude,
      heightAboveGround: air.heightAboveGround,
      groundVelocity: [at(rates, 0), at(rates, 1), at(rates, 2)],
      climbRate: -at(rates, 2),
      airspeed: air.airspeed,
      equivalentAirspeed: air.airspeed * Math.sqrt(air.density / 1.225),
      calibratedAirspeed: calibratedAirspeed(air.airspeed, air.air),
      mach: air.mach,
      alpha: air.alpha,
      beta: air.beta,
      heading: euler.heading,
      pitch: euler.pitch,
      bank: euler.bank,
      p: at(source, 10),
      q: at(source, 11),
      r: at(source, 12),
      loadFactor: telemetry.loadFactor,
      surfaces: { ...surfaces },
      thrust: telemetry.thrust,
      shaftPower: telemetry.shaftPower,
      rpm: telemetry.rpm,
      gearLoads: [...gearLoads],
      onGround: telemetry.onGround,
      stalled: air.alpha > model.stallAlpha,
    };
  }

  function airDataAt(height: number, altitude: number, airspeed: number): ReferenceAirData {
    const sample = atmosphere(altitude);
    return {
      airspeed,
      alpha: 0,
      beta: 0,
      mach: airspeed / sample.speedOfSound,
      dynamicPressure: 0.5 * sample.density * airspeed * airspeed,
      density: sample.density,
      altitude,
      heightAboveGround: height,
      p: 0,
      q: 0,
      r: 0,
      air: sample,
    };
  }

  const aircraft: ReferenceAircraft = {
    model,
    options: { atmosphere, gravity: gravityAt, wind: windAt, groundElevation: groundAt, step: h },
    step(dt, input) {
      lastInput = input;
      const steps = dt > 0 ? Math.max(1, Math.ceil(dt / h - 1e-9)) : 0;
      const sub = steps > 0 ? dt / steps : 0;
      for (let i = 0; i < steps; i += 1) rk4(sub, input);
      return sampleFrom(values, time, input);
    },
    sample: () => sampleFrom(values, time, lastInput),
    snapshot: () => unpack(values, time),
    restore(state) {
      values = pack(state);
      time = state.time;
    },
    reset(initial) {
      const alpha = initial.alpha ?? 0;
      const pitch = (initial.pitch ?? 0) + alpha;
      const attitude = referenceQuaternion(initial.heading ?? 0, pitch, initial.bank ?? 0);
      const propulsion = new Array<number>(propulsionSize).fill(0);
      model.propulsion.settle(initial.throttle ?? 0, airDataAt(initial.altitude - groundAt(initial.north ?? 0, initial.east ?? 0), initial.altitude, initial.airspeed), propulsion, { elevator: 0, aileron: 0, rudder: 0, flap: 0 });
      values = pack({
        time: 0,
        position: [initial.north ?? 0, initial.east ?? 0, -initial.altitude],
        velocity: [initial.airspeed * Math.cos(alpha), 0, initial.airspeed * Math.sin(alpha)],
        attitude,
        rates: [0, 0, 0],
        surfaces: { elevator: 0, aileron: 0, rudder: 0, flap: 0 },
        propulsion,
      });
      time = 0;
    },
    restOnGround(north = 0, east = 0, heading = 0) {
      // Lowest leg touching, then let the struts take the weight with brakes on.
      let lowest = 0;
      for (const leg of model.gear) lowest = Math.max(lowest, leg.at[2]);
      const elevation = groundAt(north, east);
      aircraft.reset({ north, east, altitude: elevation + lowest, airspeed: 0, heading });
      const parked: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0, brake: 1 };
      for (let i = 0; i < 40; i += 1) aircraft.step(0.1, parked);
      time = 0;
    },
    derivative(state, input) {
      const out = new Array<number>(size).fill(0);
      evaluate(state.time, pack(state), input, out);
      return unpack(out, 1);
    },
    sampleOf(state, input = IDLE) {
      return sampleFrom(pack(state), state.time, input);
    },
  };
  return aircraft;
}

