// @skill jgengine-world
import { standardAtmosphere, STANDARD_GRAVITY, type AtmosphereModel } from "./standardAtmosphere";

type Vec3 = [number, number, number];

/** An Earth: gravity with the J2 oblateness term, an ellipsoid surface for altitude, and a rotation rate. */
export interface EarthModel {
  /** Gravitational parameter, m³/s². */
  mu: number;
  equatorialRadius: number;
  flattening: number;
  /** Second zonal harmonic; `0` for a spherical field. */
  j2: number;
  /** Sidereal rotation rate, rad/s; `0` for a non-rotating Earth. */
  rotationRate: number;
}

/** WGS 84 Earth (NIMA TR8350.2): μ, equatorial radius, flattening, J2 and rotation rate. */
export const WGS84_EARTH: EarthModel = { mu: 3.986004418e14, equatorialRadius: 6378137, flattening: 1 / 298.257223563, j2: 1.08262668e-3, rotationRate: 7.292115e-5 };

/** One engine. Thrust is given in vacuum; at altitude it loses ambient pressure times its nozzle exit area. */
export interface RocketEngine {
  /** Vacuum thrust over the stage's burn time, `[seconds since stage ignition, N]`, linear between, zero past the last point. */
  thrust: readonly (readonly [number, number])[];
  /** Vacuum specific impulse, s: mass flow is vacuum thrust over `Isp·g0`. */
  specificImpulse: number;
  /** Nozzle exit area, m². */
  exitArea: number;
  /** Shutdown, seconds since stage ignition (default: when the curve ends or the stage's propellant runs out). */
  cutoff?: number;
}

/** Axial-force coefficient by Mach number and the normal-force slope, for one stack configuration. */
export interface RocketAero {
  /** Reference area, m². */
  area: number;
  /** `[Mach, C_A]` points, linear between, held flat past the ends: the drag rise through Mach 1 lives here. */
  axialForce: readonly (readonly [number, number])[];
  /** Normal-force slope, per rad of total angle of attack. */
  normalForceSlope: number;
  /** Centre of pressure, m from the vehicle base. */
  centerOfPressure: number;
}

/** A stage: a uniform cylinder of structure and propellant, its engines, and the aerodynamics of the stack it is the bottom of. */
export interface RocketStage {
  name: string;
  /** Mass at burnout, kg: structure, residuals and anything else that leaves with the stage. */
  dryMass: number;
  /** Usable propellant, kg. */
  propellant: number;
  /** Station of the stage's base and its length, m from the vehicle base; radius, m. */
  station: number;
  length: number;
  radius: number;
  engines: readonly RocketEngine[];
  /** Station of the engines' gimbal point, m from the vehicle base (default the stage's base). */
  gimbalStation?: number;
  /** Largest gimbal angle, rad (default `0`). */
  gimbal?: number;
  /** Seconds from the previous stage's separation to this stage's ignition (default `0`). */
  ignitionDelay?: number;
  aero: RocketAero;
}

/** A vehicle: its stages from the first to burn upward, and a payload riding on top of the last one. */
export interface RocketDesign {
  name: string;
  stages: readonly RocketStage[];
  payload: { mass: number; station: number; length: number; radius: number };
  /** Gimbal actuator bandwidth, 1/s (default `20`), and rate limit, rad/s (default `0.2`). */
  actuator?: { bandwidth?: number; rate?: number };
}

/** Where and how the vehicle stands at its first step. */
export interface RocketLaunch {
  /** Geodetic latitude and longitude, rad. */
  latitude: number;
  longitude: number;
  /** Height above the ellipsoid, m (default `0`). */
  altitude?: number;
  /** Direction the pitch plane faces, rad from north (east positive). */
  azimuth: number;
  /** Mission clock at the first step, s (default `0`); the first stage ignited at `0`. */
  time?: number;
}

/** Gimbal commands, `-1..1` of the stage's largest angle: positive pitch turns the vehicle about body +y (nose toward −z), positive yaw about body +z (nose toward +y). */
export interface RocketControl {
  pitch: number;
  yaw: number;
}

/** Serializable integrator state: position and velocity in Earth-centred inertial axes (z north, x through the launch meridian at `t = 0`). */
export interface RocketState {
  time: number;
  stage: number;
  /** Mission time each stage ignited, s; `NaN` before. */
  ignitions: number[];
  position: Vec3;
  velocity: Vec3;
  /** Body-to-inertial attitude `[w, x, y, z]`; body x is the vehicle axis toward the nose. */
  attitude: [number, number, number, number];
  /** Body rates, rad/s. */
  rates: Vec3;
  /** Gimbal angles `[pitch, yaw]`, rad. */
  gimbal: [number, number];
  /** Usable propellant per stage, kg. */
  propellant: number[];
}

/** One readout. Angles in rad, SI units; directions are inertial unit vectors. */
export interface RocketSample {
  time: number;
  stage: number;
  mass: number;
  /** Height above the ellipsoid, m; geodetic latitude and longitude, rad. */
  altitude: number;
  latitude: number;
  longitude: number;
  inertialSpeed: number;
  /** Speed relative to the rotating atmosphere, m/s. */
  earthSpeed: number;
  /** Climb angle of the inertial and the Earth-relative velocity above the local horizontal. */
  inertialFlightPathAngle: number;
  earthFlightPathAngle: number;
  mach: number;
  dynamicPressure: number;
  angleOfAttack: number;
  thrust: number;
  /** Non-gravitational acceleration, m/s²: what an accelerometer on the vehicle reads. */
  sensedAcceleration: number;
  /** Great-circle distance over the ground from the launch site, m. */
  surfaceRange: number;
  position: Vec3;
  velocity: Vec3;
  /** Earth-relative velocity, inertial axes. */
  airVelocity: Vec3;
  axis: Vec3;
  /** Body +y and +z axes. */
  side: Vec3;
  normal: Vec3;
  up: Vec3;
  north: Vec3;
  east: Vec3;
  rates: Vec3;
}

/** Options: Earth and atmosphere models and the integration step. */
export interface RocketOptions {
  earth?: EarthModel;
  /** Atmosphere by height above the ellipsoid (default the U.S. Standard Atmosphere 1976; return zero density and pressure for vacuum). */
  atmosphere?: AtmosphereModel;
  /** RK4 step, s (default `0.02`). */
  substep?: number;
}

/** A rocket in flight. */
export interface Rocket {
  readonly design: RocketDesign;
  /** Advances `dt` seconds in RK4 substeps; staging happens between substeps. */
  step(dt: number, control: RocketControl): RocketSample;
  sample(): RocketSample;
  snapshot(): RocketState;
  restore(state: RocketState): void;
  /** Back to the launch pad. */
  reset(): void;
}

function curveAt(curve: readonly (readonly [number, number])[], x: number, flat: boolean): number {
  const first = curve[0];
  if (first === undefined) return 0;
  if (x <= first[0]) return flat || x === first[0] ? first[1] : 0;
  for (let i = 1; i < curve.length; i += 1) {
    const b = curve[i];
    const a = curve[i - 1];
    if (a === undefined || b === undefined) break;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1e-12, b[0] - a[0]);
  }
  return flat ? (curve.at(-1)?.[1] ?? 0) : 0;
}

function rotate(q: readonly number[], v: readonly number[], out: Vec3): Vec3 {
  const w = q[0] ?? 1;
  const x = q[1] ?? 0;
  const y = q[2] ?? 0;
  const z = q[3] ?? 0;
  const vx = v[0] ?? 0;
  const vy = v[1] ?? 0;
  const vz = v[2] ?? 0;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
  return out;
}

function rotateInverse(q: readonly number[], v: readonly number[], out: Vec3): Vec3 {
  return rotate([q[0] ?? 1, -(q[1] ?? 0), -(q[2] ?? 0), -(q[3] ?? 0)], v, out);
}

/**
 * Earth-centred Earth-fixed position of a geodetic point, m.
 * @capability rocket-6dof geodetic latitude, longitude and height to Earth-fixed coordinates
 */
export function geodeticToEarthFixed(earth: EarthModel, latitude: number, longitude: number, altitude: number): Vec3 {
  const e2 = earth.flattening * (2 - earth.flattening);
  const n = earth.equatorialRadius / Math.sqrt(1 - e2 * Math.sin(latitude) ** 2);
  return [(n + altitude) * Math.cos(latitude) * Math.cos(longitude), (n + altitude) * Math.cos(latitude) * Math.sin(longitude), (n * (1 - e2) + altitude) * Math.sin(latitude)];
}

/**
 * Geodetic latitude, longitude and height of an Earth-fixed point by Bowring's method (millimetre accurate near the surface).
 * @capability rocket-6dof Earth-fixed coordinates to geodetic latitude, longitude and height
 */
export function earthFixedToGeodetic(earth: EarthModel, point: readonly number[]): { latitude: number; longitude: number; altitude: number } {
  const x = point[0] ?? 0;
  const y = point[1] ?? 0;
  const z = point[2] ?? 0;
  const a = earth.equatorialRadius;
  const b = a * (1 - earth.flattening);
  const e2 = earth.flattening * (2 - earth.flattening);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.hypot(x, y);
  const theta = Math.atan2(z * a, p * b);
  const latitude = Math.atan2(z + ep2 * b * Math.sin(theta) ** 3, p - e2 * a * Math.cos(theta) ** 3);
  const n = a / Math.sqrt(1 - e2 * Math.sin(latitude) ** 2);
  const altitude = Math.abs(Math.cos(latitude)) > 1e-9 ? p / Math.cos(latitude) - n : Math.abs(z) - b;
  return { latitude, longitude: Math.atan2(y, x), altitude };
}

/**
 * Gravitational acceleration with the J2 term, m/s², inertial axes with z along the rotation axis.
 * @capability rocket-6dof Earth gravity with J2 oblateness
 */
export function earthGravity(earth: EarthModel, position: readonly number[], out: Vec3 = [0, 0, 0]): Vec3 {
  const x = position[0] ?? 0;
  const y = position[1] ?? 0;
  const z = position[2] ?? 0;
  const r2 = x * x + y * y + z * z;
  const r = Math.sqrt(r2);
  const k = earth.mu / (r2 * r);
  const j = 1.5 * earth.j2 * ((earth.equatorialRadius * earth.equatorialRadius) / r2);
  const zz = (5 * z * z) / r2;
  out[0] = -k * x * (1 + j * (1 - zz));
  out[1] = -k * y * (1 + j * (1 - zz));
  out[2] = -k * z * (1 + j * (3 - zz));
  return out;
}

interface Derived {
  mass: number;
  massFlow: number;
  thrust: number;
  sensed: number;
  mach: number;
  dynamicPressure: number;
  alpha: number;
  airVelocity: Vec3;
  altitude: number;
  latitude: number;
  longitude: number;
}

const POSITION = 0;
const VELOCITY = 3;
const ATTITUDE = 6;
const RATES = 10;
const GIMBAL = 13;
const PROPELLANT = 15;

/**
 * Creates a {@link Rocket}: a 6-DOF rigid body in Earth-centred inertial axes on a rotating ellipsoidal Earth, gravity
 * with J2, the U.S. Standard Atmosphere 1976 moving with the Earth, stages that burn, lose mass and inertia and drop
 * away, vacuum thrust less ambient pressure on each nozzle exit, gimballed engines on rate-limited actuators, jet
 * damping, and axial and normal aerodynamic force through Mach. Each stage is a uniform cylinder, so the centre of
 * mass and inertia follow the propellant down. RK4 over position, velocity, attitude quaternion, body rates, gimbal
 * angles and propellant.
 * @capability rocket-6dof multistage rocket ascent on a rotating Earth: thrust curves, gimbal, staging, drag through Mach, max-Q
 */
export function createRocket(design: RocketDesign, launch: RocketLaunch, options: RocketOptions = {}): Rocket {
  const earth = options.earth ?? WGS84_EARTH;
  const atmosphere = options.atmosphere ?? standardAtmosphere;
  const substep = options.substep ?? 0.02;
  const bandwidth = design.actuator?.bandwidth ?? 20;
  const rateLimit = design.actuator?.rate ?? 0.2;
  const stages = design.stages;
  const size = PROPELLANT + stages.length;
  const site = geodeticToEarthFixed(earth, launch.latitude, launch.longitude, launch.altitude ?? 0);
  const siteRadius = Math.hypot(site[0], site[1], site[2]);

  let time = 0;
  let stage = 0;
  let ignitions: number[] = [];
  const y = new Array<number>(size).fill(0);
  const k1 = new Array<number>(size).fill(0);
  const k2 = new Array<number>(size).fill(0);
  const k3 = new Array<number>(size).fill(0);
  const k4 = new Array<number>(size).fill(0);
  const trial = new Array<number>(size).fill(0);
  const derived: Derived = { mass: 0, massFlow: 0, thrust: 0, sensed: 0, mach: 0, dynamicPressure: 0, alpha: 0, airVelocity: [0, 0, 0], altitude: 0, latitude: 0, longitude: 0 };
  const scratch: Vec3 = [0, 0, 0];
  const scratch2: Vec3 = [0, 0, 0];
  const gravity: Vec3 = [0, 0, 0];
  const burning: boolean[] = [];

  function toEarthFixed(t: number, v: readonly number[], out: Vec3): Vec3 {
    const angle = -earth.rotationRate * t;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out[0] = c * (v[0] ?? 0) - s * (v[1] ?? 0);
    out[1] = s * (v[0] ?? 0) + c * (v[1] ?? 0);
    out[2] = v[2] ?? 0;
    return out;
  }

  function toInertial(t: number, v: readonly number[], out: Vec3): Vec3 {
    return toEarthFixed(-t, v, out);
  }

  function localAxes(latitude: number, longitude: number, t: number): { up: Vec3; north: Vec3; east: Vec3 } {
    const up = toInertial(t, [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)], [0, 0, 0]);
    const north = toInertial(t, [-Math.sin(latitude) * Math.cos(longitude), -Math.sin(latitude) * Math.sin(longitude), Math.cos(latitude)], [0, 0, 0]);
    const east = toInertial(t, [-Math.sin(longitude), Math.cos(longitude), 0], [0, 0, 0]);
    return { up, north, east };
  }

  /** Mass, centre of mass station and inertia `[axial, transverse]` of the stack from stage `from` up. */
  function massProperties(state: readonly number[], from: number): { mass: number; center: number; axial: number; transverse: number } {
    const pieces: { mass: number; station: number; length: number; radius: number }[] = [];
    for (let i = from; i < stages.length; i += 1) {
      const s = stages[i];
      if (s === undefined) continue;
      pieces.push({ mass: s.dryMass + Math.max(0, state[PROPELLANT + i] ?? 0), station: s.station, length: s.length, radius: s.radius });
    }
    pieces.push(design.payload);
    let mass = 0;
    let moment = 0;
    for (const piece of pieces) {
      mass += piece.mass;
      moment += piece.mass * (piece.station + piece.length / 2);
    }
    const center = moment / mass;
    let axial = 0;
    let transverse = 0;
    for (const piece of pieces) {
      const arm = piece.station + piece.length / 2 - center;
      axial += (piece.mass * piece.radius * piece.radius) / 2;
      transverse += piece.mass * ((piece.radius * piece.radius) / 4 + (piece.length * piece.length) / 12 + arm * arm);
    }
    return { mass, center, axial, transverse };
  }

  function derivative(t: number, state: readonly number[], control: RocketControl, out: number[]): void {
    out.fill(0);
    const active = stages[stage];
    const position: Vec3 = [state[POSITION] ?? 0, state[POSITION + 1] ?? 0, state[POSITION + 2] ?? 0];
    const velocity: Vec3 = [state[VELOCITY] ?? 0, state[VELOCITY + 1] ?? 0, state[VELOCITY + 2] ?? 0];
    const q = [state[ATTITUDE] ?? 1, state[ATTITUDE + 1] ?? 0, state[ATTITUDE + 2] ?? 0, state[ATTITUDE + 3] ?? 0];
    const norm = Math.hypot(q[0] ?? 1, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0);
    for (let i = 0; i < 4; i += 1) q[i] = (q[i] ?? 0) / norm;
    const wx = state[RATES] ?? 0;
    const wy = state[RATES + 1] ?? 0;
    const wz = state[RATES + 2] ?? 0;
    const pitch = state[GIMBAL] ?? 0;
    const yaw = state[GIMBAL + 1] ?? 0;

    const fixed = toEarthFixed(t, position, scratch);
    const geodetic = earthFixedToGeodetic(earth, fixed);
    const air = atmosphere(geodetic.altitude);
    const omega = earth.rotationRate;
    const airVelocity: Vec3 = [velocity[0] + omega * position[1], velocity[1] - omega * position[0], velocity[2]];
    const bodyAir = rotateInverse(q, airVelocity, scratch2);
    const speed = Math.hypot(bodyAir[0], bodyAir[1], bodyAir[2]);
    const mach = air.speedOfSound > 0 ? speed / air.speedOfSound : 0;
    const dynamicPressure = 0.5 * air.density * speed * speed;
    const alpha = speed > 1e-6 ? Math.atan2(Math.hypot(bodyAir[1], bodyAir[2]), bodyAir[0]) : 0;

    const props = massProperties(state, stage);
    let fx = 0;
    let fy = 0;
    let fz = 0;
    let my = 0;
    let mz = 0;
    let thrust = 0;
    let massFlow = 0;
    if (active !== undefined) {
      const burn = t - (ignitions[stage] ?? Number.NaN);
      for (let e = 0; e < active.engines.length; e += 1) {
        const engine = active.engines[e];
        if (engine === undefined || burning[e] !== true) continue;
        const vacuum = curveAt(engine.thrust, burn, true);
        if (vacuum <= 0) continue;
        massFlow += vacuum / (engine.specificImpulse * STANDARD_GRAVITY);
        thrust += Math.max(0, vacuum - air.pressure * engine.exitArea);
      }
      const lever = (active.gimbalStation ?? active.station) - props.center;
      const tx = thrust * Math.cos(pitch) * Math.cos(yaw);
      const ty = -thrust * Math.sin(yaw);
      const tz = thrust * Math.sin(pitch) * Math.cos(yaw);
      fx += tx;
      fy += ty;
      fz += tz;
      my -= lever * tz;
      mz += lever * ty;
      // Jet damping: exhaust leaving the nozzle carries away the transverse momentum the body's rotation gives it.
      my -= massFlow * lever * lever * wy;
      mz -= massFlow * lever * lever * wz;

      if (speed > 1e-6 && dynamicPressure > 0) {
        const aero = active.aero;
        const qs = dynamicPressure * aero.area;
        fx -= Math.sign(bodyAir[0]) * qs * curveAt(aero.axialForce, mach, true);
        const ny = -qs * aero.normalForceSlope * (bodyAir[1] / speed);
        const nz = -qs * aero.normalForceSlope * (bodyAir[2] / speed);
        const arm = aero.centerOfPressure - props.center;
        fy += ny;
        fz += nz;
        my -= arm * nz;
        mz += arm * ny;
      }
    }

    earthGravity(earth, position, gravity);
    const world = rotate(q, [fx, fy, fz], scratch2);
    out[POSITION] = velocity[0];
    out[POSITION + 1] = velocity[1];
    out[POSITION + 2] = velocity[2];
    out[VELOCITY] = gravity[0] + world[0] / props.mass;
    out[VELOCITY + 1] = gravity[1] + world[1] / props.mass;
    out[VELOCITY + 2] = gravity[2] + world[2] / props.mass;
    const [qw, qx, qy, qz] = [q[0] ?? 1, q[1] ?? 0, q[2] ?? 0, q[3] ?? 0];
    out[ATTITUDE] = 0.5 * (-qx * wx - qy * wy - qz * wz);
    out[ATTITUDE + 1] = 0.5 * (qw * wx + qy * wz - qz * wy);
    out[ATTITUDE + 2] = 0.5 * (qw * wy + qz * wx - qx * wz);
    out[ATTITUDE + 3] = 0.5 * (qw * wz + qx * wy - qy * wx);
    const ia = props.axial;
    const it = props.transverse;
    out[RATES] = 0;
    out[RATES + 1] = (my - (ia - it) * wz * wx) / it;
    out[RATES + 2] = (mz - (it - ia) * wx * wy) / it;
    const range = active?.gimbal ?? 0;
    for (const [index, command] of [
      [GIMBAL, control.pitch],
      [GIMBAL + 1, control.yaw],
    ] as const) {
      const target = range * Math.max(-1, Math.min(1, command));
      out[index] = Math.max(-rateLimit, Math.min(rateLimit, bandwidth * (target - (state[index] ?? 0))));
    }
    out[PROPELLANT + stage] = -massFlow;

    derived.mass = props.mass;
    derived.massFlow = massFlow;
    derived.thrust = thrust;
    derived.sensed = Math.hypot(fx, fy, fz) / props.mass;
    derived.mach = mach;
    derived.dynamicPressure = dynamicPressure;
    derived.alpha = alpha;
    derived.airVelocity = airVelocity;
    derived.altitude = geodetic.altitude;
    derived.latitude = geodetic.latitude;
    derived.longitude = geodetic.longitude;
  }

  /** Which engines burn through the coming step, decided at its start so a shutdown falls on a step boundary. */
  function ignite(t: number): void {
    const active = stages[stage];
    burning.length = 0;
    if (active === undefined) return;
    const burn = t - (ignitions[stage] ?? Number.NaN);
    const fuelled = (y[PROPELLANT + stage] ?? 0) > 0;
    for (const engine of active.engines) burning.push(fuelled && burn >= (engine.thrust[0]?.[0] ?? 0) && burn < Math.min(engine.cutoff ?? Number.POSITIVE_INFINITY, engine.thrust.at(-1)?.[0] ?? 0));
  }

  function stageDone(): boolean {
    const active = stages[stage];
    if (active === undefined || stage >= stages.length - 1) return false;
    if ((y[PROPELLANT + stage] ?? 0) <= 0) return true;
    const burn = time - (ignitions[stage] ?? Number.NaN);
    return active.engines.every((engine) => burn >= Math.min(engine.cutoff ?? Number.POSITIVE_INFINITY, engine.thrust.at(-1)?.[0] ?? 0));
  }

  function reset(): void {
    time = launch.time ?? 0;
    stage = 0;
    ignitions = stages.map((_, index) => (index === 0 ? 0 : Number.NaN));
    y.fill(0);
    const position = toInertial(time, site, [0, 0, 0]);
    const axes = localAxes(launch.latitude, launch.longitude, time);
    const heading: Vec3 = [
      Math.cos(launch.azimuth) * axes.north[0] + Math.sin(launch.azimuth) * axes.east[0],
      Math.cos(launch.azimuth) * axes.north[1] + Math.sin(launch.azimuth) * axes.east[1],
      Math.cos(launch.azimuth) * axes.north[2] + Math.sin(launch.azimuth) * axes.east[2],
    ];
    const side: Vec3 = [heading[1] * axes.up[2] - heading[2] * axes.up[1], heading[2] * axes.up[0] - heading[0] * axes.up[2], heading[0] * axes.up[1] - heading[1] * axes.up[0]];
    // Body x up, body z along the launch azimuth, body y = z × x: the attitude quaternion of that rotation matrix.
    const m = [
      [axes.up[0], side[0], heading[0]],
      [axes.up[1], side[1], heading[1]],
      [axes.up[2], side[2], heading[2]],
    ];
    const at = (r: number, c: number) => m[r]?.[c] ?? 0;
    const trace = at(0, 0) + at(1, 1) + at(2, 2);
    let q: [number, number, number, number];
    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      q = [s / 4, (at(2, 1) - at(1, 2)) / s, (at(0, 2) - at(2, 0)) / s, (at(1, 0) - at(0, 1)) / s];
    } else if (at(0, 0) > at(1, 1) && at(0, 0) > at(2, 2)) {
      const s = 2 * Math.sqrt(1 + at(0, 0) - at(1, 1) - at(2, 2));
      q = [(at(2, 1) - at(1, 2)) / s, s / 4, (at(0, 1) + at(1, 0)) / s, (at(0, 2) + at(2, 0)) / s];
    } else if (at(1, 1) > at(2, 2)) {
      const s = 2 * Math.sqrt(1 + at(1, 1) - at(0, 0) - at(2, 2));
      q = [(at(0, 2) - at(2, 0)) / s, (at(0, 1) + at(1, 0)) / s, s / 4, (at(1, 2) + at(2, 1)) / s];
    } else {
      const s = 2 * Math.sqrt(1 + at(2, 2) - at(0, 0) - at(1, 1));
      q = [(at(1, 0) - at(0, 1)) / s, (at(0, 2) + at(2, 0)) / s, (at(1, 2) + at(2, 1)) / s, s / 4];
    }
    const omega = earth.rotationRate;
    const values = [...position, -omega * position[1], omega * position[0], 0, ...q, 0, 0, 0, 0, 0, ...stages.map((s) => s.propellant)];
    for (let i = 0; i < size; i += 1) y[i] = values[i] ?? 0;
  }

  function sample(): RocketSample {
    ignite(time);
    derivative(time, y, { pitch: 0, yaw: 0 }, k1);
    const position: Vec3 = [y[POSITION] ?? 0, y[POSITION + 1] ?? 0, y[POSITION + 2] ?? 0];
    const velocity: Vec3 = [y[VELOCITY] ?? 0, y[VELOCITY + 1] ?? 0, y[VELOCITY + 2] ?? 0];
    const q = [y[ATTITUDE] ?? 1, y[ATTITUDE + 1] ?? 0, y[ATTITUDE + 2] ?? 0, y[ATTITUDE + 3] ?? 0];
    const radius = Math.hypot(...position);
    const radial = position.map((value) => value / radius);
    const climb = (v: readonly number[]) => Math.asin(Math.max(-1, Math.min(1, ((v[0] ?? 0) * (radial[0] ?? 0) + (v[1] ?? 0) * (radial[1] ?? 0) + (v[2] ?? 0) * (radial[2] ?? 0)) / Math.max(1e-9, Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0)))));
    const fixed = toEarthFixed(time, position, [0, 0, 0]);
    const cosRange = (fixed[0] * site[0] + fixed[1] * site[1] + fixed[2] * site[2]) / (Math.hypot(...fixed) * siteRadius);
    const axes = localAxes(derived.latitude, derived.longitude, time);
    return {
      time,
      stage,
      mass: derived.mass,
      altitude: derived.altitude,
      latitude: derived.latitude,
      longitude: derived.longitude,
      inertialSpeed: Math.hypot(...velocity),
      earthSpeed: Math.hypot(...derived.airVelocity),
      inertialFlightPathAngle: climb(velocity),
      earthFlightPathAngle: climb(derived.airVelocity),
      mach: derived.mach,
      dynamicPressure: derived.dynamicPressure,
      angleOfAttack: derived.alpha,
      thrust: derived.thrust,
      sensedAcceleration: derived.sensed,
      surfaceRange: Math.acos(Math.max(-1, Math.min(1, cosRange))) * siteRadius,
      position,
      velocity,
      airVelocity: [...derived.airVelocity],
      axis: rotate(q, [1, 0, 0], [0, 0, 0]),
      side: rotate(q, [0, 1, 0], [0, 0, 0]),
      normal: rotate(q, [0, 0, 1], [0, 0, 0]),
      up: axes.up,
      north: axes.north,
      east: axes.east,
      rates: [y[RATES] ?? 0, y[RATES + 1] ?? 0, y[RATES + 2] ?? 0],
    };
  }

  function advance(h: number, control: RocketControl): void {
    ignite(time);
    derivative(time, y, control, k1);
    for (let i = 0; i < size; i += 1) trial[i] = (y[i] ?? 0) + 0.5 * h * (k1[i] ?? 0);
    derivative(time + 0.5 * h, trial, control, k2);
    for (let i = 0; i < size; i += 1) trial[i] = (y[i] ?? 0) + 0.5 * h * (k2[i] ?? 0);
    derivative(time + 0.5 * h, trial, control, k3);
    for (let i = 0; i < size; i += 1) trial[i] = (y[i] ?? 0) + h * (k3[i] ?? 0);
    derivative(time + h, trial, control, k4);
    for (let i = 0; i < size; i += 1) y[i] = (y[i] ?? 0) + (h / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
    time += h;
    const norm = Math.hypot(y[ATTITUDE] ?? 1, y[ATTITUDE + 1] ?? 0, y[ATTITUDE + 2] ?? 0, y[ATTITUDE + 3] ?? 0);
    for (let i = ATTITUDE; i < ATTITUDE + 4; i += 1) y[i] = (y[i] ?? 0) / norm;
    for (let i = 0; i < stages.length; i += 1) y[PROPELLANT + i] = Math.max(0, y[PROPELLANT + i] ?? 0);
    if (stageDone()) {
      stage += 1;
      ignitions[stage] = time + (stages[stage]?.ignitionDelay ?? 0);
      y[GIMBAL] = 0;
      y[GIMBAL + 1] = 0;
    }
  }

  reset();

  return {
    design,
    step(dt, control) {
      const steps = Math.max(1, Math.ceil(dt / substep - 1e-9));
      for (let i = 0; i < steps; i += 1) advance(dt / steps, control);
      return sample();
    },
    sample,
    snapshot() {
      return {
        time,
        stage,
        ignitions: [...ignitions],
        position: [y[POSITION] ?? 0, y[POSITION + 1] ?? 0, y[POSITION + 2] ?? 0],
        velocity: [y[VELOCITY] ?? 0, y[VELOCITY + 1] ?? 0, y[VELOCITY + 2] ?? 0],
        attitude: [y[ATTITUDE] ?? 1, y[ATTITUDE + 1] ?? 0, y[ATTITUDE + 2] ?? 0, y[ATTITUDE + 3] ?? 0],
        rates: [y[RATES] ?? 0, y[RATES + 1] ?? 0, y[RATES + 2] ?? 0],
        gimbal: [y[GIMBAL] ?? 0, y[GIMBAL + 1] ?? 0],
        propellant: stages.map((_, index) => y[PROPELLANT + index] ?? 0),
      };
    },
    restore(state) {
      time = state.time;
      stage = state.stage;
      ignitions = [...state.ignitions];
      const values = [...state.position, ...state.velocity, ...state.attitude, ...state.rates, ...state.gimbal, ...state.propellant];
      for (let i = 0; i < size; i += 1) y[i] = values[i] ?? 0;
    },
    reset,
  };
}

/** Steering gains for {@link steerRocket}: attitude error and rate to gimbal command. */
export interface RocketSteeringGains {
  attitude: number;
  rate: number;
}

/**
 * Gimbal commands that turn the vehicle axis toward `target` (an inertial direction): proportional on the attitude
 * error, damped on body rate, limited to `-1..1`.
 * @capability rocket-6dof point a rocket's axis at a direction with its engine gimbal
 */
export function steerRocket(sample: RocketSample, target: readonly number[], gains: RocketSteeringGains): RocketControl {
  const ax = sample.axis;
  const length = Math.hypot(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0) || 1;
  const t = [(target[0] ?? 0) / length, (target[1] ?? 0) / length, (target[2] ?? 0) / length];
  // Rotation needed, axis × target, read on the body y and z axes.
  const error = [ax[1] * (t[2] ?? 0) - ax[2] * (t[1] ?? 0), ax[2] * (t[0] ?? 0) - ax[0] * (t[2] ?? 0), ax[0] * (t[1] ?? 0) - ax[1] * (t[0] ?? 0)];
  const about = (axis: Vec3) => (error[0] ?? 0) * axis[0] + (error[1] ?? 0) * axis[1] + (error[2] ?? 0) * axis[2];
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  return {
    pitch: clamp(gains.attitude * about(sample.side) - gains.rate * sample.rates[1]),
    yaw: clamp(gains.attitude * about(sample.normal) - gains.rate * sample.rates[2]),
  };
}

/** A gravity-turn ascent: vertical rise, a pitch-over kick along the launch azimuth, then the axis follows the Earth-relative velocity. */
export interface GravityTurnProgram {
  /** Mission time the pitch-over starts, s. */
  verticalRise: number;
  /** Tilt from vertical reached at the end of the kick, rad, and how long the kick takes, s. */
  kick: number;
  kickDuration: number;
  /** Launch azimuth, rad from north. */
  azimuth: number;
}

/**
 * Where a gravity-turn ascent points the vehicle axis at a sample: the local vertical, then tilted toward the azimuth
 * through the kick, then along the Earth-relative velocity (zero angle of attack, the low-load path through max-Q).
 * @capability rocket-6dof gravity-turn ascent steering target
 */
export function gravityTurnTarget(sample: RocketSample, program: GravityTurnProgram): Vec3 {
  if (sample.time >= program.verticalRise + program.kickDuration) {
    const v = sample.airVelocity;
    const length = Math.hypot(...v) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }
  const tilt = sample.time <= program.verticalRise ? 0 : (program.kick * (sample.time - program.verticalRise)) / program.kickDuration;
  const c = Math.cos(program.azimuth);
  const s = Math.sin(program.azimuth);
  const horizontal = [c * sample.north[0] + s * sample.east[0], c * sample.north[1] + s * sample.east[1], c * sample.north[2] + s * sample.east[2]];
  return [Math.cos(tilt) * sample.up[0] + Math.sin(tilt) * (horizontal[0] ?? 0), Math.cos(tilt) * sample.up[1] + Math.sin(tilt) * (horizontal[1] ?? 0), Math.cos(tilt) * sample.up[2] + Math.sin(tilt) * (horizontal[2] ?? 0)];
}
