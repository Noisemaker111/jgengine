// @skill jgengine-world
import { createCoefficientTable, evenBreakpoints, type CoefficientTable } from "./coefficientTable";
import { clarkYPropellerSection, createPropellerMap, type PropellerGeometry, type PropellerMap } from "./propeller";
import type { ReferenceAircraftModel, ReferenceAirData, ReferenceGearLeg, ReferencePropulsion } from "./referenceAircraft";
import { SEA_LEVEL_DENSITY } from "./standardAtmosphere";

const FT = 0.3048;
const LB = 0.45359237;
const SLUG_FT2 = 14.59390294 * FT * FT;
const DEG = Math.PI / 180;
const HP = 745.699872;

/** Cessna 172N geometry (Cessna 172N Pilot's Operating Handbook §1, FAA TCDS 3A12). */
const WING_AREA = 174 * FT * FT;
const SPAN = 35.83 * FT;
const CHORD = 4.9 * FT;
const ASPECT_RATIO = (SPAN * SPAN) / WING_AREA;

/**
 * Airplane coefficients for the same 174 ft², 36 ft, NACA 2412 wing in cruise (Roskam, *Airplane Flight Dynamics and
 * Automatic Flight Controls* Part I, Appendix B, Airplane A, the Cessna 182), stability axes, per rad.
 */
const DERIVATIVES = {
  cl0: 0.307,
  clAlpha: 4.41,
  clAlphaDot: 1.7,
  clQ: 3.9,
  clElevator: 0.43,
  cm0: 0.04,
  cmAlpha: -0.613,
  cmAlphaDot: -7.27,
  cmQ: -12.4,
  cmElevator: -1.122,
  cd0: 0.027,
  cdAlpha: 0.121,
  cd1: 0.032,
  cyBeta: -0.393,
  cyP: -0.075,
  cyR: 0.214,
  cyRudder: 0.187,
  clBeta: -0.0923,
  clP: -0.484,
  clR: 0.0798,
  clAileron: 0.229,
  clRudder: 0.0147,
  cnBeta: 0.0587,
  cnP: -0.0278,
  cnR: -0.0937,
  cnAileron: -0.0216,
  cnRudder: -0.0645,
} as const;

/**
 * Wing-body maximum lift: NACA 2412 section `cl_max = 1.6` at Re 3.1 × 10⁶ (Abbott, von Doenhoff & Stivers, NACA
 * Report 824) times 0.9 for a straight, moderately tapered wing of aspect ratio 7.4 (USAF DATCOM §4.1.3.4).
 */
const CL_MAX = 0.9 * 1.6;

interface LiftDrag {
  lift: CoefficientTable;
  drag: CoefficientTable;
  stallAlpha: number;
}

/**
 * Lift and drag by angle of attack from −30° to 90°: the linear lift curve, a quadratic round-over to `CL_MAX` that
 * keeps the slope continuous, then the Viterna–Corrigan post-stall model (NASA CP-2230, 1982), which meets the stall
 * point and runs to flat-plate lift and drag. Drag below the stall is the parabolic polar through Roskam's cruise point.
 */
function buildLiftDrag(): LiftDrag {
  const d = DERIVATIVES;
  // CD = CDmin + k·CL² through (CL1, CD1) with slope CDα at CL1.
  const k = d.cdAlpha / (2 * d.cl0 * d.clAlpha);
  const cdMin = d.cd1 - k * d.cl0 * d.cl0 + 0.0070;
  const knee = 0.85 * CL_MAX;
  const alphaKnee = (knee - d.cl0) / d.clAlpha;
  const alphaStall = alphaKnee + (2 * (CL_MAX - knee)) / d.clAlpha;
  const kneeNegative = -0.6;
  const alphaKneeNegative = (kneeNegative - d.cl0) / d.clAlpha;
  const clMin = -0.8;
  const alphaStallNegative = alphaKneeNegative - (2 * (kneeNegative - clMin)) / d.clAlpha;
  const cdMax = 1.11 + 0.018 * ASPECT_RATIO;
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
  const alphas = evenBreakpoints(-30, 90, 121);
  const lift: number[] = [];
  const drag: number[] = [];
  for (const degrees of alphas) {
    const alpha = degrees * DEG;
    let cl: number;
    let cd: number;
    if (alpha > alphaStall) ({ cl, cd } = viterna(alpha, alphaStall, CL_MAX));
    else if (alpha < alphaStallNegative) {
      const mirrored = viterna(-alpha, -alphaStallNegative, -clMin);
      cl = -mirrored.cl;
      cd = mirrored.cd;
    } else {
      if (alpha > alphaKnee) cl = CL_MAX - (CL_MAX - knee) * ((alphaStall - alpha) / (alphaStall - alphaKnee)) ** 2;
      else if (alpha < alphaKneeNegative) cl = clMin + (kneeNegative - clMin) * ((alpha - alphaStallNegative) / (alphaKneeNegative - alphaStallNegative)) ** 2;
      else cl = d.cl0 + d.clAlpha * alpha;
      cd = cdMin + k * cl * cl;
    }
    lift.push(cl);
    drag.push(cd);
  }
  const axis = [{ breakpoints: alphas }];
  return { lift: createCoefficientTable(axis, lift), drag: createCoefficientTable(axis, drag), stallAlpha: alphaStall };
}

/**
 * McCauley 1C160/DTM7553 fixed-pitch propeller: 75 in diameter, 53 in geometric pitch, two blades. The planform is a
 * representative metal GA blade (activity factor about 85), widest near 45% radius.
 */
export const C172_PROPELLER: PropellerGeometry = {
  diameter: 75 * 0.0254,
  blades: 2,
  hubFraction: 0.12,
  chord: (x) => 75 * 0.0254 * (0.1035 - (0.0552 * (x - 0.45) ** 2) / 0.3),
  bladeAngle: (x) => Math.atan((53 * 0.0254) / (Math.PI * x * 75 * 0.0254)),
  section: clarkYPropellerSection,
};

/** Lycoming O-320-H2AD rating: 160 bhp at 2700 rpm, sea level standard. */
const RATED_POWER = 160 * HP;
const RATED_SPEED = (2700 * 2 * Math.PI) / 60;
const RATED_TORQUE = RATED_POWER / RATED_SPEED;
/** Crankshaft plus propeller polar inertia, kg·m². */
const SHAFT_INERTIA = 1.9;

function createPistonPropulsion(map: PropellerMap): ReferencePropulsion {
  const diameter = C172_PROPELLER.diameter;
  const point = [0, 0];
  const propeller = (omega: number, air: ReferenceAirData): { thrust: number; torque: number } => {
    const n = Math.max(1e-3, omega / (2 * Math.PI));
    const axial = air.airspeed * Math.cos(air.alpha) * Math.cos(air.beta);
    point[0] = axial / (n * diameter);
    point[1] = Math.hypot(Math.PI * n * diameter, axial) / air.air.speedOfSound;
    const ct = map.thrust.sample(point);
    const cp = map.power.sample(point);
    return { thrust: ct * air.density * n * n * diameter ** 4, torque: (cp * air.density * n * n * diameter ** 5) / (2 * Math.PI) };
  };
  /** Shaft torque: Gagg–Ferrar altitude lapse, manifold pressure from the throttle, closed-throttle pumping loss. */
  const engineTorque = (omega: number, throttle: number, air: ReferenceAirData): number => {
    const sigma = air.density / SEA_LEVEL_DENSITY;
    const manifold = 0.08 + 0.92 * throttle;
    return RATED_TORQUE * ((1.132 * sigma - 0.132) * manifold - 0.1 * (1 - manifold) * (omega / RATED_SPEED));
  };
  return {
    stateNames: ["shaftSpeed"],
    settle(throttle, air, state) {
      let low = 20;
      let high = 450;
      for (let i = 0; i < 80; i += 1) {
        const mid = 0.5 * (low + high);
        if (engineTorque(mid, throttle, air) > propeller(mid, air).torque) low = mid;
        else high = mid;
      }
      state[0] = 0.5 * (low + high);
    },
    evaluate(state, throttle, air, out) {
      const omega = Math.max(10, state[0] ?? 0);
      const { thrust, torque } = propeller(omega, air);
      const shaft = engineTorque(omega, throttle, air);
      out.force[0] = thrust;
      out.force[1] = 0;
      out.force[2] = 0;
      // The engine twists the airframe opposite to the propeller's clockwise turn (seen from the cockpit).
      out.moment[0] = -shaft;
      out.moment[1] = 0;
      out.moment[2] = 0;
      out.angularMomentum[0] = SHAFT_INERTIA * omega;
      out.angularMomentum[1] = 0;
      out.angularMomentum[2] = 0;
      out.rates[0] = (state[0] ?? 0) < 10 && shaft < torque ? 0 : (shaft - torque) / SHAFT_INERTIA;
      out.thrust = thrust;
      out.shaftPower = shaft * omega;
      out.rpm = (omega * 60) / (2 * Math.PI);
    },
  };
}

/**
 * Tricycle gear on Cessna 172N dimensions (8 ft 3 in track, about 65 in wheelbase): spring-steel mains and an oleo
 * nose strut steered ±10° by the pedals (TCDS 3A12). Rolling friction 0.02 on a paved runway (Anderson, *Aircraft
 * Performance and Design*, §6.7), braking friction 0.4.
 */
const C172_GEAR: readonly ReferenceGearLeg[] = [
  { name: "nose", at: [1.15, 0, 1.0], stiffness: 30000, damping: 2000, travel: 0.15, rollingFriction: 0.02, brakeFriction: 0, sideFriction: 0.8, corneringStiffness: 8, steering: 10 * DEG },
  { name: "left main", at: [-0.5, -1.27, 1.0], stiffness: 60000, damping: 4000, travel: 0.15, rollingFriction: 0.02, brakeFriction: 0.4, sideFriction: 0.8, corneringStiffness: 8, steering: 0 },
  { name: "right main", at: [-0.5, 1.27, 1.0], stiffness: 60000, damping: 4000, travel: 0.15, rollingFriction: 0.02, brakeFriction: 0.4, sideFriction: 0.8, corneringStiffness: 8, steering: 0 },
];

/**
 * A Cessna 172N at its 2300 lb gross weight, flaps up. Geometry, weights and control travel come from the 172N
 * handbook and FAA type certificate; stability and control derivatives from Roskam's data for the Cessna 182, which
 * flies the same wing; maximum lift from NACA 2412 section data; post-stall lift and drag from Viterna–Corrigan;
 * inertia from Roskam scaled to this weight. Ground effect cuts induced drag (McCormick's high-wing factor). Power is
 * a Lycoming O-320-H2AD with Gagg–Ferrar altitude lapse driving a blade-element McCauley 1C160 propeller, with the
 * shaft speed integrated, its gyroscopic momentum and its torque reaction on the airframe.
 * @capability cessna172-reference Cessna 172N reference airframe — tabled lift and drag through the stall, propeller and piston engine, tricycle gear
 */
export function createCessna172Model(): ReferenceAircraftModel {
  const d = DERIVATIVES;
  const { lift, drag, stallAlpha } = buildLiftDrag();
  const map = createPropellerMap(C172_PROPELLER);
  const massKg = 2300 * LB;
  const inertiaScale = 2300 / 2650;
  const k = d.cdAlpha / (2 * d.cl0 * d.clAlpha);
  const point = [0];
  return {
    name: "Cessna 172N",
    mass: { massKg, ixx: 948 * SLUG_FT2 * inertiaScale, iyy: 1346 * SLUG_FT2 * inertiaScale, izz: 1967 * SLUG_FT2 * inertiaScale, ixz: 0 },
    wingArea: WING_AREA,
    span: SPAN,
    chord: CHORD,
    stallAlpha,
    controls: {
      elevator: { atFullPositive: -28 * DEG, atFullNegative: 23 * DEG, bandwidth: 15, rateLimit: 1.5 },
      aileron: { atFullPositive: 17.5 * DEG, atFullNegative: -17.5 * DEG, bandwidth: 15, rateLimit: 1.5 },
      rudder: { atFullPositive: -16.2 * DEG, atFullNegative: 16.2 * DEG, bandwidth: 15, rateLimit: 1.5 },
    },
    propulsion: createPistonPropulsion(map),
    gear: C172_GEAR,
    aerodynamics(air, surfaces, out) {
      const alpha = air.alpha;
      const v = Math.max(1, air.airspeed);
      const ca = Math.cos(alpha);
      const sa = Math.sin(alpha);
      // Stability-axis rates.
      const ps = air.p * ca + air.r * sa;
      const rs = air.r * ca - air.p * sa;
      const qHat = (air.q * CHORD) / (2 * v);
      const pHat = (ps * SPAN) / (2 * v);
      const rHat = (rs * SPAN) / (2 * v);
      point[0] = alpha / DEG;
      const clBasic = lift.sample(point);
      // McCormick's ground effect on induced drag, wing about 0.9 m above the centre of gravity.
      const wingHeight = Math.max(0.1, air.heightAboveGround + 0.9);
      const ratio = ((16 * wingHeight) / SPAN) ** 2;
      const groundFactor = ratio / (1 + ratio);
      const cl = clBasic + d.clQ * qHat + d.clElevator * surfaces.elevator;
      const induced = k * clBasic * clBasic;
      const cd = drag.sample(point) - induced * (1 - groundFactor);
      const cy = d.cyBeta * air.beta + d.cyP * pHat + d.cyR * rHat + d.cyRudder * surfaces.rudder;
      const rollS = d.clBeta * air.beta + d.clP * pHat + d.clR * rHat + d.clAileron * surfaces.aileron + d.clRudder * surfaces.rudder;
      const yawS = d.cnBeta * air.beta + d.cnP * pHat + d.cnR * rHat + d.cnAileron * surfaces.aileron + d.cnRudder * surfaces.rudder;
      out.cx = -cd * ca + cl * sa;
      out.cz = -cd * sa - cl * ca;
      out.cy = cy;
      out.cl = rollS * ca - yawS * sa;
      out.cn = rollS * sa + yawS * ca;
      out.cm = d.cm0 + d.cmAlpha * alpha + d.cmQ * qHat + d.cmElevator * surfaces.elevator;
      out.cxAlphaDot = d.clAlphaDot * sa;
      out.czAlphaDot = -d.clAlphaDot * ca;
      out.cmAlphaDot = d.cmAlphaDot;
    },
  };
}
