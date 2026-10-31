// @skill jgengine-world
import {
  referenceEuler,
  referenceQuaternion,
  type ReferenceAircraft,
  type ReferenceAircraftState,
  type ReferenceAirData,
  type ReferencePilotInput,
  type ReferenceSurfaces,
} from "./referenceAircraft";
import { matrixEigenvalues, solveLinearSystem, type Eigenvalue } from "@jgengine/core/math/linearAlgebra";

/** Flight state in wind axes and Euler angles, the form Stevens & Lewis tabulate: SI units and radians. */
export interface WindAxisState {
  /** True airspeed, m/s. */
  airspeed: number;
  alpha: number;
  beta: number;
  bank: number;
  pitch: number;
  heading: number;
  p: number;
  q: number;
  r: number;
  north: number;
  east: number;
  altitude: number;
}

/**
 * Builds a reference state from wind-axis flight variables, still air.
 * @capability wind-axis-state build a reference aircraft state from airspeed, alpha, beta and Euler angles
 */
export function referenceStateFromWindAxes(flight: WindAxisState, surfaces: ReferenceSurfaces, propulsion: readonly number[]): ReferenceAircraftState {
  const { airspeed, alpha, beta } = flight;
  return {
    time: 0,
    position: [flight.north, flight.east, -flight.altitude],
    velocity: [airspeed * Math.cos(alpha) * Math.cos(beta), airspeed * Math.sin(beta), airspeed * Math.sin(alpha) * Math.cos(beta)],
    attitude: referenceQuaternion(flight.heading, flight.pitch, flight.bank),
    rates: [flight.p, flight.q, flight.r],
    surfaces: { ...surfaces },
    propulsion: [...propulsion],
  };
}

/**
 * Wind-axis flight variables of a reference state, still air.
 * @capability wind-axis-state read airspeed, alpha, beta and Euler angles from a reference aircraft state
 */
export function windAxesOf(state: ReferenceAircraftState): WindAxisState {
  const [u, v, w] = state.velocity;
  const airspeed = Math.hypot(u, v, w);
  const euler = referenceEuler(state.attitude);
  return {
    airspeed,
    alpha: Math.atan2(w, u),
    beta: Math.asin(Math.max(-1, Math.min(1, v / Math.max(1e-9, airspeed)))),
    bank: euler.bank,
    pitch: euler.pitch,
    heading: euler.heading,
    p: state.rates[0],
    q: state.rates[1],
    r: state.rates[2],
    north: state.position[0],
    east: state.position[1],
    altitude: -state.position[2],
  };
}

/**
 * Time derivative of the wind-axis variables at a state: airspeed, α and β rates from the body accelerations, Euler
 * rates from the body rates, and the navigation rates. Still air.
 * @capability wind-axis-rates state rates in wind-axis variables for check cases and linearisation
 */
export function windAxisRates(aircraft: ReferenceAircraft, state: ReferenceAircraftState, input: ReferencePilotInput): WindAxisState {
  const rate = aircraft.derivative(state, input);
  const [u, v, w] = state.velocity;
  const [du, dv, dw] = rate.velocity;
  const vt = Math.hypot(u, v, w);
  const uw = u * u + w * w;
  const dvt = (u * du + v * dv + w * dw) / vt;
  const euler = referenceEuler(state.attitude);
  const [p, q, r] = state.rates;
  const sph = Math.sin(euler.bank);
  const cph = Math.cos(euler.bank);
  const tth = Math.tan(euler.pitch);
  const cth = Math.cos(euler.pitch);
  return {
    airspeed: dvt,
    alpha: (u * dw - w * du) / uw,
    beta: ((vt * dv - v * dvt) * Math.cos(Math.asin(v / vt))) / uw,
    bank: p + tth * (q * sph + r * cph),
    pitch: q * cph - r * sph,
    heading: (q * sph + r * cph) / cth,
    p: rate.rates[0],
    q: rate.rates[1],
    r: rate.rates[2],
    north: rate.position[0],
    east: rate.position[1],
    altitude: -rate.position[2],
  };
}

/** A steady flight condition to trim for. */
export interface TrimCondition {
  /** True airspeed, m/s. */
  airspeed: number;
  /** Geometric altitude, m. */
  altitude: number;
  /** Flight path angle, rad (default `0`, level). */
  flightPathAngle?: number;
}

/** A trimmed steady flight point. */
export interface TrimResult {
  alpha: number;
  beta: number;
  /** `0..1`. */
  throttle: number;
  surfaces: ReferenceSurfaces;
  pitch: number;
  state: ReferenceAircraftState;
  /** Largest remaining body acceleration, m/s² or rad/s². */
  residual: number;
  converged: boolean;
}

/**
 * Air data for a reference aircraft at rest in steady flight: no body rates, height above the ground at the origin.
 * @capability aircraft-trim air data for a steady flight condition, to settle propulsion or rotor states
 */
export function steadyAirData(aircraft: ReferenceAircraft, altitude: number, airspeed: number, alpha: number, beta: number): ReferenceAirData {
  const air = aircraft.options.atmosphere(altitude);
  return {
    airspeed,
    alpha,
    beta,
    mach: airspeed / air.speedOfSound,
    dynamicPressure: 0.5 * air.density * airspeed * airspeed,
    density: air.density,
    altitude,
    heightAboveGround: altitude - aircraft.options.groundElevation(0, 0),
    p: 0,
    q: 0,
    r: 0,
    air,
  };
}

/**
 * Trims a reference aircraft for steady wings-level flight at a speed, altitude and flight path angle: solves angle of
 * attack, sideslip, throttle, elevator, aileron and rudder so every body acceleration vanishes, with the propulsion
 * states at their steady values. Newton's method on a finite-difference Jacobian with a backtracking line search.
 * @capability aircraft-trim trim a reference aircraft for steady flight — alpha, sideslip, throttle and surfaces
 */
export function trimReferenceAircraft(aircraft: ReferenceAircraft, condition: TrimCondition, initial: { alpha?: number; throttle?: number } = {}): TrimResult {
  const gamma = condition.flightPathAngle ?? 0;
  const input: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  const build = (x: readonly number[]): ReferenceAircraftState => {
    const [alpha = 0, beta = 0, throttle = 0, elevator = 0, aileron = 0, rudder = 0] = x;
    const pitch = alpha + Math.asin(Math.max(-1, Math.min(1, Math.sin(gamma) / Math.cos(beta))));
    const propulsion = new Array<number>(aircraft.model.propulsion.stateNames.length).fill(0);
    aircraft.model.propulsion.settle(throttle, steadyAirData(aircraft, condition.altitude, condition.airspeed, alpha, beta), propulsion, { elevator, aileron, rudder, flap: 0 });
    return referenceStateFromWindAxes(
      { airspeed: condition.airspeed, alpha, beta, bank: 0, pitch, heading: 0, p: 0, q: 0, r: 0, north: 0, east: 0, altitude: condition.altitude },
      { elevator, aileron, rudder, flap: 0 },
      propulsion,
    );
  };
  const residual = (x: readonly number[]): number[] => {
    input.throttle = x[2] ?? 0;
    const rate = aircraft.derivative(build(x), input);
    return [rate.velocity[0], rate.velocity[1], rate.velocity[2], rate.rates[0] * 10, rate.rates[1] * 10, rate.rates[2] * 10];
  };
  const norm = (r: readonly number[]): number => Math.sqrt(r.reduce((sum, value) => sum + value * value, 0));
  let x = [initial.alpha ?? 0.05, 0, initial.throttle ?? 0.3, 0, 0, 0];
  let r = residual(x);
  for (let iteration = 0; iteration < 60 && norm(r) > 1e-10; iteration += 1) {
    const jacobian: number[][] = [];
    for (let row = 0; row < 6; row += 1) jacobian.push(new Array<number>(6).fill(0));
    for (let col = 0; col < 6; col += 1) {
      const step = 1e-6;
      const up = [...x];
      const down = [...x];
      up[col] = (up[col] ?? 0) + step;
      down[col] = (down[col] ?? 0) - step;
      const ru = residual(up);
      const rd = residual(down);
      for (let row = 0; row < 6; row += 1) {
        const line = jacobian[row];
        if (line !== undefined) line[col] = ((ru[row] ?? 0) - (rd[row] ?? 0)) / (2 * step);
      }
    }
    const flat = Float64Array.from(jacobian.flat());
    const step = Float64Array.from(r, (value) => -value);
    solveLinearSystem(flat, step, r.length);
    const delta = Array.from(step);
    let scale = 1;
    let accepted = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const next = x.map((value, i) => value + scale * (delta[i] ?? 0));
      next[2] = Math.max(0, Math.min(1, next[2] ?? 0));
      const nr = residual(next);
      if (norm(nr) < norm(r)) {
        x = next;
        r = nr;
        accepted = true;
        break;
      }
      scale *= 0.5;
    }
    if (!accepted) break;
  }
  const state = build(x);
  const worst = Math.max(...r.map((value, i) => Math.abs(i >= 3 ? value / 10 : value)));
  return {
    alpha: x[0] ?? 0,
    beta: x[1] ?? 0,
    throttle: x[2] ?? 0,
    surfaces: { ...state.surfaces },
    pitch: referenceEuler(state.attitude).pitch,
    state,
    residual: worst,
    converged: worst < 1e-6,
  };
}

/** One dynamic mode read from eigenvalues. */
export interface FlightMode {
  name: "short period" | "phugoid" | "dutch roll" | "roll subsidence" | "spiral";
  eigenvalue: Eigenvalue;
  /** Natural frequency, rad/s. */
  frequency: number;
  /** Damping ratio (`1` for a real root, negative when unstable). */
  damping: number;
}

/** Small-perturbation model about a trim point. */
export interface FlightLinearization {
  /** State matrix over `[airspeed, alpha, pitch, q]`. */
  longitudinal: number[][];
  /** State matrix over `[beta, bank, p, r]`. */
  lateral: number[][];
  longitudinalEigenvalues: Eigenvalue[];
  lateralEigenvalues: Eigenvalue[];
  modes: FlightMode[];
}

function modeOf(name: FlightMode["name"], eigenvalue: Eigenvalue): FlightMode {
  const frequency = Math.hypot(eigenvalue.re, eigenvalue.im);
  return { name, eigenvalue, frequency, damping: frequency > 0 ? -eigenvalue.re / frequency : 1 };
}

/**
 * Linearizes a reference aircraft about a trim point by central differences of the wind-axis equations, with
 * propulsion and actuator states held, and names the classical modes: short period and phugoid from the
 * longitudinal matrix, dutch roll, roll subsidence and spiral from the lateral one.
 * @capability flight-modes linearize a trimmed reference aircraft and read short period, phugoid, dutch roll, roll and spiral modes
 */
export function linearizeReferenceAircraft(aircraft: ReferenceAircraft, trim: TrimResult): FlightLinearization {
  const base = windAxesOf(trim.state);
  const input: ReferencePilotInput = { throttle: trim.throttle, pitch: 0, roll: 0, yaw: 0 };
  const evaluate = (flight: WindAxisState): WindAxisState =>
    windAxisRates(aircraft, referenceStateFromWindAxes(flight, trim.state.surfaces, trim.state.propulsion), input);
  const jacobian = (keys: readonly (keyof WindAxisState)[]): number[][] => {
    const rows: number[][] = keys.map(() => new Array<number>(keys.length).fill(0));
    keys.forEach((key, col) => {
      const step = key === "airspeed" ? 1e-3 * base.airspeed : 1e-5;
      const up = { ...base, [key]: base[key] + step };
      const down = { ...base, [key]: base[key] - step };
      const ru = evaluate(up);
      const rd = evaluate(down);
      keys.forEach((rowKey, row) => {
        const line = rows[row];
        if (line !== undefined) line[col] = (ru[rowKey] - rd[rowKey]) / (2 * step);
      });
    });
    return rows;
  };
  const longitudinal = jacobian(["airspeed", "alpha", "pitch", "q"]);
  const lateral = jacobian(["beta", "bank", "p", "r"]);
  const longitudinalEigenvalues = matrixEigenvalues(longitudinal.flat(), longitudinal.length);
  const lateralEigenvalues = matrixEigenvalues(lateral.flat(), lateral.length);
  const modes: FlightMode[] = [];
  const longPairs = longitudinalEigenvalues.filter((e) => e.im > 0).sort((a, b) => Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im));
  const phugoid = longPairs[0];
  const shortPeriod = longPairs[1];
  if (phugoid !== undefined && shortPeriod !== undefined) {
    modes.push(modeOf("short period", shortPeriod), modeOf("phugoid", phugoid));
  }
  const dutch = lateralEigenvalues.find((e) => e.im > 0);
  if (dutch !== undefined) modes.push(modeOf("dutch roll", dutch));
  const reals = lateralEigenvalues.filter((e) => e.im === 0).sort((a, b) => Math.abs(b.re) - Math.abs(a.re));
  const roll = reals[0];
  const spiral = reals[reals.length - 1];
  if (roll !== undefined && spiral !== undefined && reals.length >= 2) modes.push(modeOf("roll subsidence", roll), modeOf("spiral", spiral));
  return { longitudinal, lateral, longitudinalEigenvalues, lateralEigenvalues, modes };
}
