// @skill jgengine-world
import type { AeroTable, AeroTerm } from "./aeroTable";
import type { AircraftEffects } from "./aircraftEffects";
import type { AircraftSurface, RigidAircraftTuning } from "./aircraftDynamics";
import { propellerLoads, settledShaftSpeed, type AircraftPropeller } from "./propeller";
import { rotorInflowLoads } from "./rotorInflow";

const DEG = Math.PI / 180;
const FT = 0.3048;
const LB = 0.45359237;
const SLUG = 14.59390294;
const SLUG_FT2 = SLUG * FT * FT;
const GRAVITY = 9.80665;

/** The published airframes {@link aircraftFromReference} knows, and the class names that start from them. */
export type AircraftReferenceId = "cessna-172" | "f-16" | "bo-105" | "saturn-v" | "trainer" | "jet" | "light-helicopter" | "rocket";

/** Every id {@link aircraftFromReference} accepts. */
export const AIRCRAFT_REFERENCE_IDS: readonly AircraftReferenceId[] = ["cessna-172", "f-16", "bo-105", "saturn-v", "trainer", "jet", "light-helicopter", "rocket"];

function evenly(start: number, end: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + ((end - start) * i) / (count - 1));
}

function table(inputs: AeroTable["inputs"], breakpoints: readonly (readonly number[])[], values: readonly number[]): AeroTable {
  return { inputs, breakpoints, values, extrapolate: "linear" };
}

/** Two wing panels, a tailplane and a fin: the simple model a reference airframe falls back to at strength 0. */
function simpleSurfaces(area: number, span: number, tailArm: number, cl0: number, slope: number, stall: number, cd0: number, k: number): AircraftSurface[] {
  const panel = { area: area / 2, liftSlope: slope, stallAngle: stall, postStallLift: 0.55, incidence: cl0 / slope, cd0, inducedDrag: k, control: { roll: 0.3 } };
  return [
    { at: [span / 4, 0, 0], ...panel },
    { at: [-span / 4, 0, 0], ...panel },
    { at: [0, 0.1, -tailArm], area: area * 0.2, liftSlope: 4, cd0: 0.01, inducedDrag: 0.05, control: { pitch: 0.5 } },
    { at: [0, 0.6, -tailArm], normal: [1, 0, 0], area: area * 0.1, liftSlope: 3.5, cd0: 0.01, inducedDrag: 0.05, control: { yaw: 0.5 } },
  ];
}

/** Cessna 172N geometry (POH §1, FAA TCDS 3A12). */
const C172 = { area: 174 * FT * FT, span: 35.83 * FT, chord: 4.9 * FT };

/** Roskam's airplane A (the Cessna 182, same 174 ft² NACA 2412 wing) cruise derivatives, stability axes, per rad. */
const C172_DERIVATIVES = {
  cl0: 0.307, clAlpha: 4.41, clAlphaDot: 1.7, clQ: 3.9, clElevator: 0.43,
  cm0: 0.04, cmAlpha: -0.613, cmAlphaDot: -7.27, cmQ: -12.4, cmElevator: -1.122,
  cdAlpha: 0.121, cd1: 0.032,
  cyBeta: -0.393, cyP: -0.075, cyR: 0.214, cyRudder: 0.187,
  clBeta: -0.0923, clP: -0.484, clR: 0.0798, clAileron: 0.229, clRudder: 0.0147,
  cnBeta: 0.0587, cnP: -0.0278, cnR: -0.0937, cnAileron: -0.0216, cnRudder: -0.0645,
} as const;

/**
 * Cessna 172N lift and drag through the stall, as the reference airframe builds them: Roskam's linear lift curve, a
 * round-over to `CL_max = 0.9 × 1.6` (NACA 2412, DATCOM), Viterna–Corrigan post-stall lift and drag, and the
 * parabolic polar through Roskam's cruise point.
 */
function cessnaLiftDrag(): { lift: AeroTable; drag: AeroTable; stall: number; k: number } {
  const d = C172_DERIVATIVES;
  const aspect = C172.span ** 2 / C172.area;
  const clMax = 0.9 * 1.6;
  const k = d.cdAlpha / (2 * d.cl0 * d.clAlpha);
  const cdMin = d.cd1 - k * d.cl0 * d.cl0 + 0.007;
  const knee = 0.85 * clMax;
  const alphaKnee = (knee - d.cl0) / d.clAlpha;
  const alphaStall = alphaKnee + (2 * (clMax - knee)) / d.clAlpha;
  const kneeNegative = -0.6;
  const alphaKneeNegative = (kneeNegative - d.cl0) / d.clAlpha;
  const clMin = -0.8;
  const alphaStallNegative = alphaKneeNegative - (2 * (kneeNegative - clMin)) / d.clAlpha;
  const cdMax = 1.11 + 0.018 * aspect;
  const viterna = (alpha: number, alphaS: number, clS: number) => {
    const cdS = cdMin + k * clS * clS;
    const s = Math.sin(alphaS);
    const c = Math.cos(alphaS);
    const kl = ((clS - cdMax * s * c) * s) / (c * c);
    const kd = (cdS - cdMax * s * s) / c;
    const sa = Math.sin(alpha);
    const ca = Math.cos(alpha);
    return { cl: (cdMax / 2) * Math.sin(2 * alpha) + (kl * ca * ca) / sa, cd: cdMax * sa * sa + kd * ca };
  };
  const alphas = evenly(-30, 90, 121).map((degrees) => degrees * DEG);
  const lift: number[] = [];
  const drag: number[] = [];
  for (const alpha of alphas) {
    let cl: number;
    let cd: number;
    if (alpha > alphaStall) ({ cl, cd } = viterna(alpha, alphaStall, clMax));
    else if (alpha < alphaStallNegative) {
      const mirrored = viterna(-alpha, -alphaStallNegative, -clMin);
      cl = -mirrored.cl;
      cd = mirrored.cd;
    } else {
      if (alpha > alphaKnee) cl = clMax - (clMax - knee) * ((alphaStall - alpha) / (alphaStall - alphaKnee)) ** 2;
      else if (alpha < alphaKneeNegative) cl = clMin + (kneeNegative - clMin) * ((alpha - alphaStallNegative) / (alphaKneeNegative - alphaStallNegative)) ** 2;
      else cl = d.cl0 + d.clAlpha * alpha;
      cd = cdMin + k * cl * cl;
    }
    lift.push(cl);
    drag.push(cd);
  }
  return { lift: { inputs: ["alpha"], breakpoints: [alphas], values: lift }, drag: { inputs: ["alpha"], breakpoints: [alphas], values: drag }, stall: alphaStall, k };
}

function staticPropellerThrust(propeller: AircraftPropeller): number {
  const omega = settledShaftSpeed(propeller, 0, 1, 1.225, 340.294);
  return propellerLoads(propeller, omega, 0, 1, 1.225, 340.294, { thrust: 0, torque: 0, engineTorque: 0 }).thrust;
}

/**
 * Cessna 172N at 2300 lb, flaps up, as `scripts/reference/flight/cessna172Aircraft.ts` builds it: Roskam's derivatives,
 * NACA 2412 maximum lift, Viterna–Corrigan post-stall, McCormick ground effect, a Lycoming O-320 with Gagg–Ferrar
 * lapse on a blade-element McCauley 1C160 propeller, inertia from Roskam scaled to this weight.
 */
function cessna172(): RigidAircraftTuning {
  const d = C172_DERIVATIVES;
  const { lift, drag, stall, k } = cessnaLiftDrag();
  const inertiaScale = 2300 / 2650;
  const propeller: AircraftPropeller = {};
  const geometry = {
    ...C172,
    axes: "stability" as const,
    travel: { pitch: { positive: -28 * DEG, negative: 23 * DEG }, roll: { positive: 17.5 * DEG, negative: -17.5 * DEG }, yaw: { positive: -16.2 * DEG, negative: 16.2 * DEG } },
  };
  const effects: AircraftEffects = {
    atmosphere: {},
    propeller,
    polar: {
      ...geometry,
      lift: [{ value: lift }, { value: d.clQ, times: "qHat" }, { value: d.clAlphaDot, times: "alphaDotHat" }, { value: d.clElevator, times: "pitch" }],
      drag: [{ value: drag }],
      side: [{ value: d.cyBeta, times: "beta" }, { value: d.cyP, times: "pHat" }, { value: d.cyR, times: "rHat" }, { value: d.cyRudder, times: "yaw" }],
      stallAngle: stall,
      inducedDrag: k,
    },
    derivatives: {
      ...geometry,
      roll: [{ value: d.clBeta, times: "beta" }, { value: d.clP, times: "pHat" }, { value: d.clR, times: "rHat" }, { value: d.clAileron, times: "roll" }, { value: d.clRudder, times: "yaw" }],
      pitch: [{ value: d.cm0 }, { value: d.cmAlpha, times: "alpha" }, { value: d.cmQ, times: "qHat" }, { value: d.cmAlphaDot, times: "alphaDotHat" }, { value: d.cmElevator, times: "pitch" }],
      yaw: [{ value: d.cnBeta, times: "beta" }, { value: d.cnP, times: "pHat" }, { value: d.cnR, times: "rHat" }, { value: d.cnAileron, times: "roll" }, { value: d.cnRudder, times: "yaw" }],
    },
    wingGroundEffect: { wingHeight: 0.9, span: C172.span },
    mainGear: { arm: 0.5 },
  };
  return {
    massKg: 2300 * LB,
    inertia: { roll: 948 * SLUG_FT2 * inertiaScale, pitch: 1346 * SLUG_FT2 * inertiaScale, yaw: 1967 * SLUG_FT2 * inertiaScale },
    surfaces: simpleSurfaces(C172.area, C172.span, 4.6, d.cl0, d.clAlpha, stall, 0.025, k),
    engine: { maxThrust: staticPropellerThrust(propeller), spoolRate: 1.5 },
    controls: { pitch: { maxDeflection: 28 * DEG, rate: 1.5 }, roll: { maxDeflection: 17.5 * DEG, rate: 1.5 }, yaw: { maxDeflection: 16.2 * DEG, rate: 1.5 } },
    gear: { height: 0.93, rollingResistance: 0.02, brakeDecel: 3.5, sideGrip: 0.8, maxPitch: 0.25 },
    effects,
  };
}

// NASA TP-1538 (Nguyen et al., 1979) low-speed F-16 data in the reduced form of Stevens & Lewis, Appendix A. Rows follow
// the first axis, columns the 12 angles of attack from −10° to 45° in 5° steps.
const F16_ALPHA = evenly(-10, 45, 12);
const F16_ELEVATOR = evenly(-24, 24, 5);
const F16_BETA_HALF = evenly(0, 30, 7);
const F16_BETA = evenly(-30, 30, 7);
const F16_CX = [
  -0.099, -0.081, -0.081, -0.063, -0.025, 0.044, 0.097, 0.113, 0.145, 0.167, 0.174, 0.166, -0.048, -0.038, -0.04, -0.021, 0.016, 0.083, 0.127, 0.137, 0.162,
  0.177, 0.179, 0.167, -0.022, -0.02, -0.021, -0.004, 0.032, 0.094, 0.128, 0.13, 0.154, 0.161, 0.155, 0.138, -0.04, -0.038, -0.039, -0.025, 0.006, 0.062,
  0.087, 0.085, 0.1, 0.11, 0.104, 0.091, -0.083, -0.073, -0.076, -0.072, -0.046, 0.012, 0.024, 0.025, 0.043, 0.053, 0.047, 0.04,
];
const F16_CZ = [0.77, 0.241, -0.1, -0.415, -0.731, -1.053, -1.355, -1.646, -1.917, -2.12, -2.248, -2.229];
const F16_CM = [
  0.205, 0.168, 0.186, 0.196, 0.213, 0.251, 0.245, 0.238, 0.252, 0.231, 0.198, 0.192, 0.081, 0.077, 0.107, 0.11, 0.11, 0.141, 0.127, 0.119, 0.133, 0.108,
  0.081, 0.093, -0.046, -0.02, -0.009, -0.005, -0.006, 0.01, 0.006, -0.001, 0.014, 0.0, -0.013, 0.032, -0.174, -0.145, -0.121, -0.127, -0.129, -0.102,
  -0.097, -0.113, -0.087, -0.084, -0.069, -0.006, -0.259, -0.202, -0.184, -0.193, -0.199, -0.15, -0.16, -0.167, -0.104, -0.076, -0.041, -0.005,
];
const F16_CL = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.001, -0.004, -0.008, -0.012, -0.016, -0.019, -0.02, -0.02, -0.015, -0.008, -0.013, -0.015, -0.003, -0.009, -0.017,
  -0.024, -0.03, -0.034, -0.04, -0.037, -0.016, -0.002, -0.01, -0.019, -0.001, -0.01, -0.02, -0.03, -0.039, -0.044, -0.05, -0.049, -0.023, -0.006, -0.014,
  -0.027, 0.0, -0.01, -0.022, -0.034, -0.047, -0.046, -0.059, -0.061, -0.033, -0.036, -0.035, -0.035, 0.007, -0.01, -0.023, -0.034, -0.049, -0.046, -0.068,
  -0.071, -0.06, -0.058, -0.062, -0.059, 0.009, -0.011, -0.023, -0.037, -0.05, -0.047, -0.074, -0.079, -0.091, -0.076, -0.077, -0.076,
];
const F16_CN = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.018, 0.019, 0.018, 0.019, 0.019, 0.018, 0.013, 0.007, 0.004, -0.014, -0.017, -0.033, 0.038, 0.042, 0.042, 0.042,
  0.043, 0.039, 0.03, 0.017, 0.004, -0.035, -0.047, -0.057, 0.056, 0.057, 0.059, 0.058, 0.058, 0.053, 0.032, 0.012, 0.002, -0.046, -0.071, -0.073, 0.064,
  0.077, 0.076, 0.074, 0.073, 0.057, 0.029, 0.007, 0.012, -0.034, -0.065, -0.041, 0.074, 0.086, 0.093, 0.089, 0.08, 0.062, 0.049, 0.022, 0.028, -0.012,
  -0.002, -0.013, 0.079, 0.09, 0.106, 0.106, 0.096, 0.08, 0.068, 0.03, 0.064, 0.015, 0.011, -0.001,
];
const F16_DLDA = [
  -0.041, -0.052, -0.053, -0.056, -0.05, -0.056, -0.082, -0.059, -0.042, -0.038, -0.027, -0.017, -0.041, -0.053, -0.053, -0.053, -0.05, -0.051, -0.066,
  -0.043, -0.038, -0.027, -0.023, -0.016, -0.042, -0.053, -0.052, -0.051, -0.049, -0.049, -0.043, -0.035, -0.026, -0.016, -0.018, -0.014, -0.04, -0.052,
  -0.051, -0.052, -0.048, -0.048, -0.042, -0.037, -0.031, -0.026, -0.017, -0.012, -0.043, -0.049, -0.048, -0.049, -0.043, -0.042, -0.042, -0.036, -0.025,
  -0.021, -0.016, -0.011, -0.044, -0.048, -0.048, -0.047, -0.042, -0.041, -0.02, -0.028, -0.013, -0.014, -0.011, -0.01, -0.043, -0.049, -0.047, -0.045,
  -0.042, -0.037, -0.003, -0.013, -0.01, -0.003, -0.007, -0.008,
];
const F16_DLDR = [
  0.005, 0.017, 0.014, 0.01, -0.005, 0.009, 0.019, 0.005, -0.0, -0.005, -0.011, 0.008, 0.007, 0.016, 0.014, 0.014, 0.013, 0.009, 0.012, 0.005, 0.0, 0.004,
  0.009, 0.007, 0.013, 0.013, 0.011, 0.012, 0.011, 0.009, 0.008, 0.005, -0.002, 0.005, 0.003, 0.005, 0.018, 0.015, 0.015, 0.014, 0.014, 0.014, 0.014, 0.015,
  0.013, 0.011, 0.006, 0.001, 0.015, 0.014, 0.013, 0.013, 0.012, 0.011, 0.011, 0.01, 0.008, 0.008, 0.007, 0.003, 0.021, 0.011, 0.01, 0.011, 0.01, 0.009,
  0.008, 0.01, 0.006, 0.005, 0.0, 0.001, 0.023, 0.01, 0.011, 0.011, 0.011, 0.01, 0.008, 0.01, 0.006, 0.014, 0.02, 0.0,
];
const F16_DNDA = [
  0.001, -0.027, -0.017, -0.013, -0.012, -0.016, 0.001, 0.017, 0.011, 0.017, 0.008, 0.016, 0.002, -0.014, -0.016, -0.016, -0.014, -0.019, -0.021, 0.002,
  0.012, 0.016, 0.015, 0.011, -0.006, -0.008, -0.006, -0.006, -0.005, -0.008, -0.005, 0.007, 0.004, 0.007, 0.006, 0.006, -0.011, -0.011, -0.01, -0.009,
  -0.008, -0.006, 0.0, 0.004, 0.007, 0.01, 0.004, 0.01, -0.015, -0.015, -0.014, -0.012, -0.011, -0.008, -0.002, 0.002, 0.006, 0.012, 0.011, 0.011, -0.024,
  -0.01, -0.004, -0.002, -0.001, 0.003, 0.014, 0.006, -0.001, 0.004, 0.004, 0.006, -0.022, 0.002, -0.003, -0.005, -0.003, -0.001, -0.009, -0.009, -0.001,
  0.003, -0.002, 0.001,
];
const F16_DNDR = [
  -0.018, -0.052, -0.052, -0.052, -0.054, -0.049, -0.059, -0.051, -0.03, -0.037, -0.026, -0.013, -0.028, -0.051, -0.043, -0.046, -0.045, -0.049, -0.057,
  -0.052, -0.03, -0.033, -0.03, -0.008, -0.037, -0.041, -0.038, -0.04, -0.04, -0.038, -0.037, -0.03, -0.027, -0.024, -0.019, -0.013, -0.048, -0.045, -0.045,
  -0.045, -0.044, -0.045, -0.047, -0.048, -0.049, -0.045, -0.033, -0.016, -0.043, -0.044, -0.041, -0.041, -0.04, -0.038, -0.034, -0.035, -0.035, -0.029,
  -0.022, -0.009, -0.052, -0.034, -0.036, -0.036, -0.035, -0.028, -0.024, -0.023, -0.02, -0.016, -0.01, -0.014, -0.062, -0.034, -0.027, -0.028, -0.027,
  -0.027, -0.023, -0.023, -0.019, -0.009, -0.025, -0.01,
];
/** Damping derivatives by angle of attack: CXq, CYr, CYp, CZq, Clr, Clp, Cmq, Cnr, Cnp. */
const F16_DAMPING = [
  [-0.267, -0.11, 0.308, 1.34, 2.08, 2.91, 2.76, 2.05, 1.5, 1.49, 1.83, 1.21],
  [0.882, 0.852, 0.876, 0.958, 0.962, 0.974, 0.819, 0.483, 0.59, 1.21, -0.493, -1.04],
  [-0.108, -0.108, -0.188, 0.11, 0.258, 0.226, 0.344, 0.362, 0.611, 0.529, 0.298, -2.27],
  [-8.8, -25.8, -28.9, -31.4, -31.2, -30.7, -27.7, -28.2, -29.0, -29.8, -38.3, -35.3],
  [-0.126, -0.026, 0.063, 0.113, 0.208, 0.23, 0.319, 0.437, 0.68, 0.1, 0.447, -0.33],
  [-0.36, -0.359, -0.443, -0.42, -0.383, -0.375, -0.329, -0.294, -0.23, -0.21, -0.12, -0.1],
  [-7.21, -0.54, -5.23, -5.26, -6.11, -6.64, -5.69, -6.0, -6.2, -6.4, -6.6, -6.0],
  [-0.38, -0.363, -0.378, -0.386, -0.37, -0.453, -0.55, -0.582, -0.595, -0.637, -1.02, -0.84],
  [0.061, 0.052, 0.052, -0.012, -0.013, -0.024, 0.05, 0.15, 0.13, 0.158, 0.24, 0.15],
];

/**
 * The F-16 of Stevens & Lewis (*Aircraft Control and Simulation*, Appendix A) at a 30% chord centre of gravity, as
 * `scripts/reference/flight/f16Aircraft.ts` flies it: NASA TP-1538 tables carried from body axes into lift and drag,
 * damping derivatives by angle of attack, the centre-of-gravity shift folded into the pitching and yawing moments, and
 * an F100-PW-220 with the reference cycle's thrust lapse, spool and afterburner. The `CZ` sideslip factor, the `Ixz`
 * product of inertia and engine gyroscopic momentum are left out.
 */
function f16(): RigidAircraftTuning {
  const area = 300 * FT * FT;
  const span = 30 * FT;
  const chord = 11.32 * FT;
  const shift = 0.35 - 0.3;
  const alphas = F16_ALPHA.map((a) => a * DEG);
  const elevators = F16_ELEVATOR.map((e) => e * DEG);
  const betaHalf = F16_BETA_HALF.map((b) => b * DEG);
  const betas = F16_BETA.map((b) => b * DEG);
  const lift: number[] = [];
  const drag: number[] = [];
  const pitch: number[] = [];
  F16_ELEVATOR.forEach((elevator, row) => {
    F16_ALPHA.forEach((_, column) => {
      const alpha = alphas[column] ?? 0;
      const cx = F16_CX[row * 12 + column] ?? 0;
      const cz = (F16_CZ[column] ?? 0) - 0.19 * (elevator / 25);
      lift.push(-cz * Math.cos(alpha) + cx * Math.sin(alpha));
      drag.push(-cx * Math.cos(alpha) - cz * Math.sin(alpha));
      pitch.push((F16_CM[row * 12 + column] ?? 0) + cz * shift);
    });
  });
  const damping = (index: number) => F16_DAMPING[index] ?? [];
  const byAlpha = (values: readonly number[]): AeroTable => table(["alpha"], [alphas], values);
  const cxq = damping(0);
  const czq = damping(3);
  const liftQ = alphas.map((alpha, i) => -(czq[i] ?? 0) * Math.cos(alpha) + (cxq[i] ?? 0) * Math.sin(alpha));
  const dragQ = alphas.map((alpha, i) => -(cxq[i] ?? 0) * Math.cos(alpha) - (czq[i] ?? 0) * Math.sin(alpha));
  const aileron = 1 / (20 * DEG);
  const rudder = 1 / (30 * DEG);
  const scaled = (values: readonly number[], by: number) => values.map((value) => value * by);
  // Side force per rad: −0.02 per degree of sideslip, 0.021 at 20° aileron, 0.086 at 30° rudder.
  const side: AeroTerm[] = [
    { value: -0.02 / DEG, times: "beta" },
    { value: 0.021 * aileron, times: "roll" },
    { value: 0.086 * rudder, times: "yaw" },
    { value: byAlpha(damping(1)), times: "rHat" },
    { value: byAlpha(damping(2)), times: "pHat" },
  ];
  const yawShift = -shift * (chord / span);
  const geometry = {
    area,
    span,
    chord,
    travel: { pitch: { positive: -25 * DEG, negative: 25 * DEG }, roll: { positive: -21.5 * DEG, negative: 21.5 * DEG }, yaw: { positive: -30 * DEG, negative: 30 * DEG } },
  };
  const effects: AircraftEffects = {
    atmosphere: {},
    thrustLapse: {},
    spool: {},
    afterburner: {},
    mainGear: { arm: 0.45 },
    polar: {
      ...geometry,
      lift: [{ value: table(["pitch", "alpha"], [elevators, alphas], lift) }, { value: byAlpha(liftQ), times: "qHat" }],
      drag: [{ value: table(["pitch", "alpha"], [elevators, alphas], drag) }, { value: byAlpha(dragQ), times: "qHat" }],
      side,
      stallAngle: 32 * DEG,
    },
    derivatives: {
      ...geometry,
      roll: [
        { value: table(["absBeta", "alpha"], [betaHalf, alphas], F16_CL), times: "signBeta" },
        { value: table(["beta", "alpha"], [betas, alphas], scaled(F16_DLDA, aileron)), times: "roll" },
        { value: table(["beta", "alpha"], [betas, alphas], scaled(F16_DLDR, rudder)), times: "yaw" },
        { value: byAlpha(damping(4)), times: "rHat" },
        { value: byAlpha(damping(5)), times: "pHat" },
      ],
      pitch: [
        { value: table(["pitch", "alpha"], [elevators, alphas], pitch) },
        { value: byAlpha(damping(6).map((value, i) => value + (czq[i] ?? 0) * shift)), times: "qHat" },
      ],
      yaw: [
        { value: table(["absBeta", "alpha"], [betaHalf, alphas], F16_CN), times: "signBeta" },
        { value: table(["beta", "alpha"], [betas, alphas], scaled(F16_DNDA, aileron)), times: "roll" },
        { value: table(["beta", "alpha"], [betas, alphas], scaled(F16_DNDR, rudder)), times: "yaw" },
        { value: byAlpha(damping(7)), times: "rHat" },
        { value: byAlpha(damping(8)), times: "pHat" },
        ...side.map((term) => ({ ...term, value: typeof term.value === "number" ? term.value * yawShift : { ...term.value, values: scaled(term.value.values, yawShift) } })),
      ],
    },
  };
  const massKg = SLUG / 1.57e-3;
  return {
    massKg,
    inertia: { roll: 9496 * SLUG_FT2, pitch: 55814 * SLUG_FT2, yaw: 63100 * SLUG_FT2 },
    surfaces: simpleSurfaces(area, span, 5.5, 0.1, 3.5, 0.5, 0.02, 0.15),
    engine: { maxThrust: 56819, spoolRate: 1.5 },
    controls: { pitch: { maxDeflection: 25 * DEG, rate: 60 * DEG }, roll: { maxDeflection: 21.5 * DEG, rate: 80 * DEG }, yaw: { maxDeflection: 30 * DEG, rate: 120 * DEG } },
    gear: { height: 1.7, rollingResistance: 0.03, brakeDecel: 3.5, sideGrip: 0.8, maxPitch: 0.25 },
    effects,
  };
}

/**
 * MBB Bo-105 at 2200 kg from the reference helicopter (`scripts/reference/flight/bo105Helicopter.ts`): Peterson's
 * NASA TM-110356 main rotor (the `rotorInflow` defaults), Padfield's mass, inertia, hub and tail rotor placement, two
 * Allison 250-C20B at 313 kW each through a governor (the `autorotation` defaults), a 1.2 m² drag area, tailplane and fin.
 */
function bo105(): RigidAircraftTuning {
  const radius = 16.11 * FT;
  const full = rotorInflowLoads({}, 1, radius, 1, 1, 0, 0, 1.225, Number.POSITIVE_INFINITY, 0.05, { thrust: 0, torque: 0, inflow: 0, groundEffect: 1 });
  return {
    massKg: 2200,
    inertia: { roll: 1433, pitch: 4973, yaw: 4099 },
    surfaces: [
      { at: [0, 0, -4.56], area: 0.803, liftSlope: 4.5, cd0: 0.01, inducedDrag: 0.05 },
      { at: [0, 0.98, -5.42], normal: [1, 0, 0], area: 0.805, liftSlope: 2.8, cd0: 0.01, inducedDrag: 0.05 },
    ],
    rotor: { maxThrust: full.thrust, radius, at: [0, 1.48, 0], torque: full.torque, spoolRate: 0.5, cyclic: 0.16, damping: 6000, tail: { maxThrust: 3500, at: [0, 1.72, -6] } },
    controls: { pitch: { rate: 1.5 }, roll: { rate: 1.5 }, yaw: { rate: 2 } },
    dragArea: 1.2,
    gear: { height: 1.2 },
    effects: { atmosphere: {}, rotorInflow: {}, autorotation: {} },
  };
}

/** Rocketdyne F-1 on AS-506: 7.955 MN vacuum thrust, vacuum Isp 305.5 s, 11.4 m² exit (MPR-SAT-FE-69-9). */
const F1 = { vacuumThrust: 7.955e6, specificImpulse: 305.5, exitArea: 11.4 };

/**
 * The Saturn V AS-506 (Apollo 11) S-IC flight, as the reference rocket flies it (`scripts/reference/flight/saturnV.ts`):
 * five F-1 at vacuum thrust with the centre engine cut at 135.2 s, the report's propellant, stage and upper-stack mass,
 * the axial-force coefficient through Mach, the standard atmosphere and the rotating Earth from Launch Complex 39A with
 * world `−z` along the 72.058° flight azimuth. The motor's pitch input tilts the nose toward `−z`.
 */
function saturnV(): RigidAircraftTuning {
  const flow = (5 * F1.vacuumThrust) / (F1.specificImpulse * GRAVITY);
  const burn = 135.2 - 0.3;
  const full = 5 * F1.vacuumThrust;
  const area = Math.PI * 5.03 ** 2;
  return {
    massKg: 168015 + 659277,
    inertia: { pitch: 7.0e8, yaw: 7.0e8, roll: 8.8e6 },
    surfaces: [],
    motor: {
      thrustCurve: [
        [0, full],
        [burn, full],
        [burn + 0.01, 0.8 * full],
        [400, 0.8 * full],
      ],
      propellantKg: 2071716,
      massFlow: flow,
      at: [0, 0, -62],
      gimbal: 5.16 * DEG,
    },
    dragArea: 0.3 * area,
    effects: {
      atmosphere: {},
      nozzle: { exitArea: 5 * F1.exitArea },
      machDrag: {
        area,
        coefficient: [
          [0, 0.3],
          [0.8, 0.32],
          [1, 0.45],
          [1.2, 0.52],
          [1.5, 0.48],
          [2, 0.4],
          [3, 0.32],
          [4, 0.28],
          [6, 0.24],
        ],
      },
      rotatingEarth: { latitude: 28.6082 * DEG, bearing: 72.058 * DEG + Math.PI },
    },
  };
}

/** Changes to a reference's defaults: any top-level field, and per effect the parameters or `strength` to change. */
export type AircraftOverrides = Partial<Omit<RigidAircraftTuning, "effects">> & { effects?: { [K in keyof AircraftEffects]?: Partial<NonNullable<AircraftEffects[K]>> } };

function base(id: AircraftReferenceId): RigidAircraftTuning {
  if (id === "cessna-172" || id === "trainer") return cessna172();
  if (id === "f-16" || id === "jet") return f16();
  if (id === "bo-105" || id === "light-helicopter") return bo105();
  return saturnV();
}

/**
 * The full tuning of a published aircraft with every effect it has data for at full strength, so a game gets a real
 * aircraft in one line and tunes from there: `createRigidAircraft(aircraftFromReference("cessna-172"))`. The class
 * names start from the matching airframe: `trainer` the Cessna 172N, `jet` the F-16, `light-helicopter` the Bo-105,
 * `rocket` the Saturn V S-IC. `overrides` change any top-level number and each effect's parameters or `strength`
 * (`0` off … `1` as measured … past `1` stronger), so a fleet is data: one record per aircraft from a class plus a few
 * overrides. An override retunes an effect the airframe has; add a new effect on the result. `bun run perf flight`
 * checks each airframe against its reference sim.
 * @capability aircraft-references a real aircraft in one line: Cessna 172N, F-16, Bo-105 or Saturn V with every effect at full strength, plus overrides
 */
export function aircraftFromReference(id: AircraftReferenceId, overrides: AircraftOverrides = {}): RigidAircraftTuning {
  const tuning = base(id);
  const { effects: changes, ...numbers } = overrides;
  const from = tuning.effects ?? {};
  const effects: AircraftEffects = {};
  const atmosphere = merge(from.atmosphere, changes?.atmosphere);
  if (atmosphere !== undefined) effects.atmosphere = atmosphere;
  const thrustLapse = merge(from.thrustLapse, changes?.thrustLapse);
  if (thrustLapse !== undefined) effects.thrustLapse = thrustLapse;
  const spool = merge(from.spool, changes?.spool);
  if (spool !== undefined) effects.spool = spool;
  const afterburner = merge(from.afterburner, changes?.afterburner);
  if (afterburner !== undefined) effects.afterburner = afterburner;
  const propeller = merge(from.propeller, changes?.propeller);
  if (propeller !== undefined) effects.propeller = propeller;
  const polar = merge(from.polar, changes?.polar);
  if (polar !== undefined) effects.polar = polar;
  const derivatives = merge(from.derivatives, changes?.derivatives);
  if (derivatives !== undefined) effects.derivatives = derivatives;
  const mainGear = merge(from.mainGear, changes?.mainGear);
  if (mainGear !== undefined) effects.mainGear = mainGear;
  const wingGroundEffect = merge(from.wingGroundEffect, changes?.wingGroundEffect);
  if (wingGroundEffect !== undefined) effects.wingGroundEffect = wingGroundEffect;
  const machDrag = merge(from.machDrag, changes?.machDrag);
  if (machDrag !== undefined) effects.machDrag = machDrag;
  const rotorInflow = merge(from.rotorInflow, changes?.rotorInflow);
  if (rotorInflow !== undefined) effects.rotorInflow = rotorInflow;
  const autorotation = merge(from.autorotation, changes?.autorotation);
  if (autorotation !== undefined) effects.autorotation = autorotation;
  const nozzle = merge(from.nozzle, changes?.nozzle);
  if (nozzle !== undefined) effects.nozzle = nozzle;
  const rotatingEarth = merge(from.rotatingEarth, changes?.rotatingEarth);
  if (rotatingEarth !== undefined) effects.rotatingEarth = rotatingEarth;
  return { ...tuning, ...numbers, effects };
}

function merge<T extends object>(current: T | undefined, change: Partial<T> | undefined): T | undefined {
  return current === undefined || change === undefined ? current : { ...current, ...change };
}
