// @skill jgengine-world
import { createCoefficientTable, evenBreakpoints, type CoefficientTable } from "./coefficientTable";
import type { ReferenceAircraftModel, ReferenceAirData, ReferenceGearLeg, ReferencePropulsion } from "./referenceAircraft";
import type { AtmosphereSample } from "./standardAtmosphere";

const FT = 0.3048;
const SLUG = 14.59390294;
const LBF = 4.4482216152605;
const SLUG_FT2 = SLUG * FT * FT;
const RAD_TO_DEG = 180 / Math.PI;
const DEG = Math.PI / 180;

const ALPHA = { breakpoints: evenBreakpoints(-10, 45, 12), extrapolate: "linear" } as const;
const ELEVATOR = { breakpoints: evenBreakpoints(-24, 24, 5), extrapolate: "linear" } as const;
const BETA_HALF = { breakpoints: evenBreakpoints(0, 30, 7), extrapolate: "linear" } as const;
const BETA_FULL = { breakpoints: evenBreakpoints(-30, 30, 7), extrapolate: "linear" } as const;

// NASA TP-1538 (Nguyen et al., 1979) low-speed F-16 data in the reduced form of Stevens & Lewis, Appendix A.
// Rows follow the first axis, columns the 12 angles of attack from −10° to 45° in 5° steps.

const CX = createCoefficientTable([ELEVATOR, ALPHA], [
  -0.099, -0.081, -0.081, -0.063, -0.025, 0.044, 0.097, 0.113, 0.145, 0.167, 0.174, 0.166,
  -0.048, -0.038, -0.04, -0.021, 0.016, 0.083, 0.127, 0.137, 0.162, 0.177, 0.179, 0.167,
  -0.022, -0.02, -0.021, -0.004, 0.032, 0.094, 0.128, 0.13, 0.154, 0.161, 0.155, 0.138,
  -0.04, -0.038, -0.039, -0.025, 0.006, 0.062, 0.087, 0.085, 0.1, 0.11, 0.104, 0.091,
  -0.083, -0.073, -0.076, -0.072, -0.046, 0.012, 0.024, 0.025, 0.043, 0.053, 0.047, 0.04,
]);

const CZ = createCoefficientTable([ALPHA], [0.77, 0.241, -0.1, -0.415, -0.731, -1.053, -1.355, -1.646, -1.917, -2.12, -2.248, -2.229]);

const CM = createCoefficientTable([ELEVATOR, ALPHA], [
  0.205, 0.168, 0.186, 0.196, 0.213, 0.251, 0.245, 0.238, 0.252, 0.231, 0.198, 0.192,
  0.081, 0.077, 0.107, 0.11, 0.11, 0.141, 0.127, 0.119, 0.133, 0.108, 0.081, 0.093,
  -0.046, -0.02, -0.009, -0.005, -0.006, 0.01, 0.006, -0.001, 0.014, 0.0, -0.013, 0.032,
  -0.174, -0.145, -0.121, -0.127, -0.129, -0.102, -0.097, -0.113, -0.087, -0.084, -0.069, -0.006,
  -0.259, -0.202, -0.184, -0.193, -0.199, -0.15, -0.16, -0.167, -0.104, -0.076, -0.041, -0.005,
]);

const CL = createCoefficientTable([BETA_HALF, ALPHA], [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  -0.001, -0.004, -0.008, -0.012, -0.016, -0.019, -0.02, -0.02, -0.015, -0.008, -0.013, -0.015,
  -0.003, -0.009, -0.017, -0.024, -0.03, -0.034, -0.04, -0.037, -0.016, -0.002, -0.01, -0.019,
  -0.001, -0.01, -0.02, -0.03, -0.039, -0.044, -0.05, -0.049, -0.023, -0.006, -0.014, -0.027,
  0.0, -0.01, -0.022, -0.034, -0.047, -0.046, -0.059, -0.061, -0.033, -0.036, -0.035, -0.035,
  0.007, -0.01, -0.023, -0.034, -0.049, -0.046, -0.068, -0.071, -0.06, -0.058, -0.062, -0.059,
  0.009, -0.011, -0.023, -0.037, -0.05, -0.047, -0.074, -0.079, -0.091, -0.076, -0.077, -0.076,
]);

const CN = createCoefficientTable([BETA_HALF, ALPHA], [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0.018, 0.019, 0.018, 0.019, 0.019, 0.018, 0.013, 0.007, 0.004, -0.014, -0.017, -0.033,
  0.038, 0.042, 0.042, 0.042, 0.043, 0.039, 0.03, 0.017, 0.004, -0.035, -0.047, -0.057,
  0.056, 0.057, 0.059, 0.058, 0.058, 0.053, 0.032, 0.012, 0.002, -0.046, -0.071, -0.073,
  0.064, 0.077, 0.076, 0.074, 0.073, 0.057, 0.029, 0.007, 0.012, -0.034, -0.065, -0.041,
  0.074, 0.086, 0.093, 0.089, 0.08, 0.062, 0.049, 0.022, 0.028, -0.012, -0.002, -0.013,
  0.079, 0.09, 0.106, 0.106, 0.096, 0.08, 0.068, 0.03, 0.064, 0.015, 0.011, -0.001,
]);

const DLDA = createCoefficientTable([BETA_FULL, ALPHA], [
  -0.041, -0.052, -0.053, -0.056, -0.05, -0.056, -0.082, -0.059, -0.042, -0.038, -0.027, -0.017,
  -0.041, -0.053, -0.053, -0.053, -0.05, -0.051, -0.066, -0.043, -0.038, -0.027, -0.023, -0.016,
  -0.042, -0.053, -0.052, -0.051, -0.049, -0.049, -0.043, -0.035, -0.026, -0.016, -0.018, -0.014,
  -0.04, -0.052, -0.051, -0.052, -0.048, -0.048, -0.042, -0.037, -0.031, -0.026, -0.017, -0.012,
  -0.043, -0.049, -0.048, -0.049, -0.043, -0.042, -0.042, -0.036, -0.025, -0.021, -0.016, -0.011,
  -0.044, -0.048, -0.048, -0.047, -0.042, -0.041, -0.02, -0.028, -0.013, -0.014, -0.011, -0.01,
  -0.043, -0.049, -0.047, -0.045, -0.042, -0.037, -0.003, -0.013, -0.01, -0.003, -0.007, -0.008,
]);

const DLDR = createCoefficientTable([BETA_FULL, ALPHA], [
  0.005, 0.017, 0.014, 0.01, -0.005, 0.009, 0.019, 0.005, -0.0, -0.005, -0.011, 0.008,
  0.007, 0.016, 0.014, 0.014, 0.013, 0.009, 0.012, 0.005, 0.0, 0.004, 0.009, 0.007,
  0.013, 0.013, 0.011, 0.012, 0.011, 0.009, 0.008, 0.005, -0.002, 0.005, 0.003, 0.005,
  0.018, 0.015, 0.015, 0.014, 0.014, 0.014, 0.014, 0.015, 0.013, 0.011, 0.006, 0.001,
  0.015, 0.014, 0.013, 0.013, 0.012, 0.011, 0.011, 0.01, 0.008, 0.008, 0.007, 0.003,
  0.021, 0.011, 0.01, 0.011, 0.01, 0.009, 0.008, 0.01, 0.006, 0.005, 0.0, 0.001,
  0.023, 0.01, 0.011, 0.011, 0.011, 0.01, 0.008, 0.01, 0.006, 0.014, 0.02, 0.0,
]);

const DNDA = createCoefficientTable([BETA_FULL, ALPHA], [
  0.001, -0.027, -0.017, -0.013, -0.012, -0.016, 0.001, 0.017, 0.011, 0.017, 0.008, 0.016,
  0.002, -0.014, -0.016, -0.016, -0.014, -0.019, -0.021, 0.002, 0.012, 0.016, 0.015, 0.011,
  -0.006, -0.008, -0.006, -0.006, -0.005, -0.008, -0.005, 0.007, 0.004, 0.007, 0.006, 0.006,
  -0.011, -0.011, -0.01, -0.009, -0.008, -0.006, 0.0, 0.004, 0.007, 0.01, 0.004, 0.01,
  -0.015, -0.015, -0.014, -0.012, -0.011, -0.008, -0.002, 0.002, 0.006, 0.012, 0.011, 0.011,
  -0.024, -0.01, -0.004, -0.002, -0.001, 0.003, 0.014, 0.006, -0.001, 0.004, 0.004, 0.006,
  -0.022, 0.002, -0.003, -0.005, -0.003, -0.001, -0.009, -0.009, -0.001, 0.003, -0.002, 0.001,
]);

const DNDR = createCoefficientTable([BETA_FULL, ALPHA], [
  -0.018, -0.052, -0.052, -0.052, -0.054, -0.049, -0.059, -0.051, -0.03, -0.037, -0.026, -0.013,
  -0.028, -0.051, -0.043, -0.046, -0.045, -0.049, -0.057, -0.052, -0.03, -0.033, -0.03, -0.008,
  -0.037, -0.041, -0.038, -0.04, -0.04, -0.038, -0.037, -0.03, -0.027, -0.024, -0.019, -0.013,
  -0.048, -0.045, -0.045, -0.045, -0.044, -0.045, -0.047, -0.048, -0.049, -0.045, -0.033, -0.016,
  -0.043, -0.044, -0.041, -0.041, -0.04, -0.038, -0.034, -0.035, -0.035, -0.029, -0.022, -0.009,
  -0.052, -0.034, -0.036, -0.036, -0.035, -0.028, -0.024, -0.023, -0.02, -0.016, -0.01, -0.014,
  -0.062, -0.034, -0.027, -0.028, -0.027, -0.027, -0.023, -0.023, -0.019, -0.009, -0.025, -0.01,
]);

/** Damping derivatives by angle of attack: CXq, CYr, CYp, CZq, Clr, Clp, Cmq, Cnr, Cnp. */
const DAMPING: readonly CoefficientTable[] = [
  [-0.267, -0.11, 0.308, 1.34, 2.08, 2.91, 2.76, 2.05, 1.5, 1.49, 1.83, 1.21],
  [0.882, 0.852, 0.876, 0.958, 0.962, 0.974, 0.819, 0.483, 0.59, 1.21, -0.493, -1.04],
  [-0.108, -0.108, -0.188, 0.11, 0.258, 0.226, 0.344, 0.362, 0.611, 0.529, 0.298, -2.27],
  [-8.8, -25.8, -28.9, -31.4, -31.2, -30.7, -27.7, -28.2, -29.0, -29.8, -38.3, -35.3],
  [-0.126, -0.026, 0.063, 0.113, 0.208, 0.23, 0.319, 0.437, 0.68, 0.1, 0.447, -0.33],
  [-0.36, -0.359, -0.443, -0.42, -0.383, -0.375, -0.329, -0.294, -0.23, -0.21, -0.12, -0.1],
  [-7.21, -0.54, -5.23, -5.26, -6.11, -6.64, -5.69, -6.0, -6.2, -6.4, -6.6, -6.0],
  [-0.38, -0.363, -0.378, -0.386, -0.37, -0.453, -0.55, -0.582, -0.595, -0.637, -1.02, -0.84],
  [0.061, 0.052, 0.052, -0.012, -0.013, -0.024, 0.05, 0.15, 0.13, 0.158, 0.24, 0.15],
].map((row) => createCoefficientTable([ALPHA], row));

const MACH = { breakpoints: evenBreakpoints(0, 1, 6), extrapolate: "linear" } as const;
const ALTITUDE_FT = { breakpoints: evenBreakpoints(0, 50000, 6), extrapolate: "linear" } as const;

/** Installed thrust, lbf, by Mach (rows, 0 to 1.0) and altitude (columns, 0 to 50 000 ft). */
const THRUST_IDLE = createCoefficientTable([MACH, ALTITUDE_FT], [
  1060, 670, 880, 1140, 1500, 1860,
  635, 425, 690, 1010, 1330, 1700,
  60, 25, 345, 755, 1130, 1525,
  -1020, -710, -300, 350, 910, 1360,
  -2700, -1900, -1300, -247, 600, 1100,
  -3600, -1400, -595, -342, -200, 700,
]);
const THRUST_MIL = createCoefficientTable([MACH, ALTITUDE_FT], [
  12680, 9150, 6200, 3950, 2450, 1400,
  12680, 9150, 6313, 4040, 2470, 1400,
  12610, 9312, 6610, 4290, 2600, 1560,
  12640, 9839, 7090, 4660, 2840, 1660,
  12390, 10176, 7750, 5320, 3250, 1930,
  11680, 9848, 8050, 6100, 3800, 2310,
]);
const THRUST_MAX = createCoefficientTable([MACH, ALTITUDE_FT], [
  20000, 15000, 10800, 7000, 4000, 2500,
  21420, 15700, 11225, 7323, 4435, 2600,
  22700, 16860, 12250, 8154, 5000, 2835,
  24240, 18910, 13760, 9285, 5700, 3215,
  26070, 21075, 15975, 11115, 6860, 3950,
  28886, 23319, 18300, 13484, 8642, 5057,
]);

/**
 * Commanded power level, percent, for a throttle position `0..1` (the throttle gearing; 77% throttle is military power).
 * @capability f16-reference F-16 throttle gearing to engine power command
 */
export function f16PowerCommand(throttle: number): number {
  return throttle <= 0.77 ? 64.94 * throttle : 217.38 * throttle - 117.38;
}

function powerRate(power: number, command: number): number {
  const reciprocalTau = (dp: number): number => (dp <= 25 ? 1 : dp >= 50 ? 0.1 : 1.9 - 0.036 * dp);
  if (command >= 50) {
    if (power >= 50) return 5 * (command - power);
    return reciprocalTau(60 - power) * (60 - power);
  }
  if (power >= 50) return 5 * (40 - power);
  return reciprocalTau(command - power) * (command - power);
}

/**
 * Installed thrust, N, at a power level (percent), altitude (m) and Mach: idle to military below 50%, military to full afterburner above.
 * @capability f16-reference F-16 engine thrust by power, altitude and Mach
 */
export function f16Thrust(power: number, altitude: number, mach: number): number {
  const point = [mach, Math.max(0, altitude / FT)];
  const military = THRUST_MIL.sample(point);
  const lbf =
    power < 50
      ? THRUST_IDLE.sample(point) + (military - THRUST_IDLE.sample(point)) * power * 0.02
      : military + (THRUST_MAX.sample(point) - military) * (power - 50) * 0.02;
  return lbf * LBF;
}

/** Engine angular momentum along body x, kg·m²/s (160 slug·ft²/s). */
const ENGINE_MOMENTUM = 160 * SLUG_FT2;

const f16Propulsion: ReferencePropulsion = {
  stateNames: ["power"],
  settle(throttle, _air, state) {
    state[0] = f16PowerCommand(throttle);
  },
  evaluate(state, throttle, air, out) {
    const power = state[0] ?? 0;
    const thrust = f16Thrust(power, air.altitude, air.mach);
    out.force[0] = thrust;
    out.force[1] = 0;
    out.force[2] = 0;
    out.moment[0] = 0;
    out.moment[1] = 0;
    out.moment[2] = 0;
    out.angularMomentum[0] = ENGINE_MOMENTUM;
    out.angularMomentum[1] = 0;
    out.angularMomentum[2] = 0;
    out.rates[0] = powerRate(power, f16PowerCommand(throttle));
    out.thrust = thrust;
    out.shaftPower = 0;
    out.rpm = 0;
  },
};

/** Options for {@link createF16Model}. */
export interface F16ModelOptions {
  /** Centre of gravity, fraction of the mean aerodynamic chord (default `0.35`, the data's reference). */
  xcg?: number;
}

/**
 * Landing gear from published F-16 dimensions (4.0 m wheelbase, 2.37 m track); the centre of gravity's height and its
 * position over the wheelbase are estimates, sized for about 11% of the weight on the nosewheel.
 */
const F16_GEAR: readonly ReferenceGearLeg[] = [
  { name: "nose", at: [3.55, 0, 1.75], stiffness: 100000, damping: 12000, travel: 0.3, rollingFriction: 0.03, brakeFriction: 0, sideFriction: 0.8, corneringStiffness: 8, steering: 32 * DEG },
  { name: "left main", at: [-0.45, -1.18, 1.75], stiffness: 300000, damping: 30000, travel: 0.3, rollingFriction: 0.03, brakeFriction: 0.4, sideFriction: 0.8, corneringStiffness: 8, steering: 0 },
  { name: "right main", at: [-0.45, 1.18, 1.75], stiffness: 300000, damping: 30000, travel: 0.3, rollingFriction: 0.03, brakeFriction: 0.4, sideFriction: 0.8, corneringStiffness: 8, steering: 0 },
];

/**
 * The F-16 of Stevens & Lewis, *Aircraft Control and Simulation* (2nd ed., Appendix A): NASA TP-1538 (Nguyen et al.,
 * 1979) wind-tunnel data reduced to coefficient tables in angle of attack (−10° to 45°), sideslip and elevator, damping
 * derivatives by angle of attack, the F100 thrust table by altitude and Mach with its power-lag dynamics, and engine
 * gyroscopic momentum. 20 500 lb, 300 ft² wing. Subsonic and below 45° angle of attack; outside that the tables
 * extrapolate. Elevator, aileron and rudder actuators are the book's 20.2 rad/s first-order lags with 60, 80 and
 * 120 °/s rate limits. Gear geometry is estimated (see source).
 * @capability f16-reference NASA TP-1538 F-16 coefficient-table reference airframe with thrust table and power lag
 */
export function createF16Model(options: F16ModelOptions = {}): ReferenceAircraftModel {
  const xcg = options.xcg ?? 0.35;
  const xcgr = 0.35;
  const span = 30 * FT;
  const chord = 11.32 * FT;
  const point2 = [0, 0];
  const point1 = [0];
  return {
    name: "F-16 (NASA TP-1538)",
    mass: { massKg: SLUG / 1.57e-3, ixx: 9496 * SLUG_FT2, iyy: 55814 * SLUG_FT2, izz: 63100 * SLUG_FT2, ixz: 982 * SLUG_FT2 },
    wingArea: 300 * FT * FT,
    span,
    chord,
    stallAlpha: 32 * DEG,
    controls: {
      elevator: { atFullPositive: -25 * DEG, atFullNegative: 25 * DEG, bandwidth: 20.2, rateLimit: 60 * DEG },
      aileron: { atFullPositive: -21.5 * DEG, atFullNegative: 21.5 * DEG, bandwidth: 20.2, rateLimit: 80 * DEG },
      rudder: { atFullPositive: -30 * DEG, atFullNegative: 30 * DEG, bandwidth: 20.2, rateLimit: 120 * DEG },
    },
    propulsion: f16Propulsion,
    gear: F16_GEAR,
    aerodynamics(air: ReferenceAirData, surfaces, out) {
      const alpha = air.alpha * RAD_TO_DEG;
      const beta = air.beta * RAD_TO_DEG;
      const el = surfaces.elevator * RAD_TO_DEG;
      const ail = surfaces.aileron * RAD_TO_DEG;
      const rdr = surfaces.rudder * RAD_TO_DEG;
      const vt = Math.max(1e-3, air.airspeed);
      point1[0] = alpha;
      point2[0] = el;
      point2[1] = alpha;
      const cx = CX.sample(point2);
      const cm = CM.sample(point2);
      const cy = -0.02 * beta + 0.021 * (ail / 20) + 0.086 * (rdr / 30);
      const cz = CZ.sample(point1) * (1 - (beta / 57.3) ** 2) - 0.19 * (el / 25);
      point2[0] = Math.abs(beta);
      const sign = Math.sign(beta);
      const clBeta = CL.sample(point2) * sign;
      const cnBeta = CN.sample(point2) * sign;
      point2[0] = beta;
      const cl = clBeta + DLDA.sample(point2) * (ail / 20) + DLDR.sample(point2) * (rdr / 30);
      const cn = cnBeta + DNDA.sample(point2) * (ail / 20) + DNDR.sample(point2) * (rdr / 30);
      const d = (index: number): number => DAMPING[index]?.sample(point1) ?? 0;
      const cq = (chord * air.q) / (2 * vt);
      const b2v = span / (2 * vt);
      const cxt = cx + cq * d(0);
      const cyt = cy + b2v * (d(1) * air.r + d(2) * air.p);
      const czt = cz + cq * d(3);
      out.cx = cxt;
      out.cy = cyt;
      out.cz = czt;
      out.cl = cl + b2v * (d(4) * air.r + d(5) * air.p);
      out.cm = cm + cq * d(6) + czt * (xcgr - xcg);
      out.cn = cn + b2v * (d(7) * air.r + d(8) * air.p) - cyt * (xcgr - xcg) * (chord / span);
      out.cxAlphaDot = 0;
      out.czAlphaDot = 0;
      out.cmAlphaDot = 0;
    },
  };
}

/**
 * The air-data model Stevens & Lewis run the F-16 with (their `ADC` routine): a linear-lapse troposphere density fit
 * and a 390 °R stratosphere above 35 000 ft. Use it to reproduce the book's numbers; use `standardAtmosphere` otherwise.
 * @capability f16-reference the Stevens and Lewis book atmosphere for reproducing its check cases
 */
export function stevensLewisAtmosphere(altitude: number): AtmosphereSample {
  const feet = altitude / FT;
  const tfac = 1 - 0.703e-5 * feet;
  const rankine = feet >= 35000 ? 390 : 519 * tfac;
  const density = 2.377e-3 * tfac ** 4.14 * (SLUG / FT ** 3);
  const temperature = rankine / 1.8;
  return {
    temperature,
    pressure: density * 287.053 * temperature,
    density,
    speedOfSound: Math.sqrt(1.4 * 1716.3 * rankine) * FT,
    viscosity: (1.458e-6 * temperature ** 1.5) / (temperature + 110.4),
  };
}

/** Stevens & Lewis gravity, 32.17 ft/s², in m/s². */
export const STEVENS_LEWIS_GRAVITY = 32.17 * FT;
