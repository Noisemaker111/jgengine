// @skill jgengine-world
import { schoenherrFriction, SEA_WATER_VISCOSITY } from "./shipResistance";

const DEG = Math.PI / 180;

/**
 * Savitsky's lift coefficient of a prismatic planing surface, `C_Lβ = C_L0 − 0.0065·β·C_L0^0.6` with
 * `C_L0 = τ^1.1·(0.012·λ^0.5 + 0.0055·λ^2.5/C_V²)` (τ and β in degrees, as the fit is written).
 * @capability planing-hull Savitsky (1964) planing lift coefficient
 */
export function savitskyLiftCoefficient(trimDeg: number, meanWettedLengthRatio: number, speedCoefficient: number, deadriseDeg: number): number {
  const lambda = meanWettedLengthRatio;
  const cl0 = trimDeg ** 1.1 * (0.012 * Math.sqrt(lambda) + (0.0055 * lambda ** 2.5) / (speedCoefficient * speedCoefficient));
  return cl0 - 0.0065 * deadriseDeg * cl0 ** 0.6;
}

/**
 * The mean wetted length–beam ratio `λ` at which the surface carries `liftCoefficient` (bisection on Savitsky's lift).
 * @capability planing-hull Savitsky wetted length for a lift coefficient
 */
export function savitskyWettedLength(trimDeg: number, liftCoefficient: number, speedCoefficient: number, deadriseDeg: number): number {
  let low = 1e-4;
  let high = 1;
  while (savitskyLiftCoefficient(trimDeg, high, speedCoefficient, deadriseDeg) < liftCoefficient && high < 1e3) high *= 2;
  for (let i = 0; i < 100; i += 1) {
    const mid = 0.5 * (low + high);
    if (savitskyLiftCoefficient(trimDeg, mid, speedCoefficient, deadriseDeg) < liftCoefficient) low = mid;
    else high = mid;
  }
  return 0.5 * (low + high);
}

/** A prismatic planing hull for Savitsky's method, SI units. */
export interface PlaningHull {
  massKg: number;
  /** Chine beam, m. */
  beam: number;
  /** Deadrise, rad. */
  deadrise: number;
  /** Centre of gravity forward of the transom, m. */
  lcg: number;
  /** Centre of gravity above the keel, m. */
  vcg: number;
  /** Thrust line inclination to the keel, rad (default `0`). */
  thrustAngle?: number;
  /** Distance from the centre of gravity to the thrust line, normal to it, m; positive when the line passes below G (default `0`). */
  thrustOffset?: number;
  /** Hull roughness allowance on the friction coefficient (default `0.0004`, Savitsky's full-scale figure). */
  roughnessAllowance?: number;
}

/** Fluid for a planing calculation. */
export interface PlaningFluid {
  density?: number;
  viscosity?: number;
  gravity?: number;
}

/** A planing hull's running state at one speed and trim. */
export interface PlaningState {
  speed: number;
  /** Trim, rad. */
  trim: number;
  /** `C_V = V/√(g·b)`. */
  speedCoefficient: number;
  /** `C_Lβ = Δ / (½ρV²b²)`. */
  liftCoefficient: number;
  /** Mean wetted length over beam. */
  wettedLengthRatio: number;
  /** Wetted keel and chine lengths, m (the chine length is 0 once the chines run dry). */
  keelLength: number;
  chineLength: number;
  /** Draught of the keel at the transom, m. */
  transomDraft: number;
  /** Mean velocity over the bottom, m/s. */
  bottomVelocity: number;
  reynolds: number;
  frictionCoefficient: number;
  /** Viscous drag along the bottom, N. */
  friction: number;
  /** Centre of pressure forward of the transom, m. */
  centreOfPressure: number;
  /** Bottom pressure force normal to the keel, N. */
  normalForce: number;
  /** Thrust needed along the thrust line, N. */
  thrust: number;
  /** Horizontal resistance (thrust times the cosine of its angle to the water), N. */
  resistance: number;
  /** Trimming moment about the centre of gravity, N·m (zero at equilibrium; positive trims bow up). */
  moment: number;
}

/**
 * Savitsky's planing equations at a given trim: wetted length from the lift fit, mean bottom velocity, Schoenherr
 * friction, the centre of pressure `l_p/(λb) = 0.75 − 1/(5.21·C_V²/λ² + 2.39)`, and the force and moment balance with the
 * thrust line.
 * @capability planing-hull Savitsky planing forces, wetted length and pitching moment at a trim
 */
export function planingAtTrim(hull: PlaningHull, speed: number, trim: number, fluid: PlaningFluid = {}): PlaningState {
  const rho = fluid.density ?? 1025;
  const nu = fluid.viscosity ?? SEA_WATER_VISCOSITY;
  const g = fluid.gravity ?? 9.81;
  const b = hull.beam;
  const weight = hull.massKg * g;
  const betaDeg = hull.deadrise / DEG;
  const tauDeg = trim / DEG;
  const cv = speed / Math.sqrt(g * b);
  const lift = weight / (0.5 * rho * speed * speed * b * b);
  const lambda = savitskyWettedLength(tauDeg, lift, cv, betaDeg);
  const dryLift = 0.012 * Math.sqrt(lambda) * tauDeg ** 1.1;
  const bottomVelocity = speed * Math.sqrt(Math.max(0, 1 - (dryLift - 0.0065 * betaDeg * dryLift ** 0.6) / (lambda * Math.cos(trim))));
  const reynolds = (bottomVelocity * lambda * b) / nu;
  const frictionCoefficient = schoenherrFriction(reynolds) + (hull.roughnessAllowance ?? 0.0004);
  const friction = (0.5 * rho * bottomVelocity * bottomVelocity * lambda * b * b * frictionCoefficient) / Math.cos(hull.deadrise);
  const centreOfPressure = lambda * b * (0.75 - 1 / ((5.21 * cv * cv) / (lambda * lambda) + 2.39));
  const rise = (b * Math.tan(hull.deadrise)) / (2 * Math.PI * Math.tan(trim));
  const keelLength = lambda * b + 0.5 * rise;
  const chineLength = Math.max(0, lambda * b - 0.5 * rise);
  const epsilon = hull.thrustAngle ?? 0;
  const f = hull.thrustOffset ?? 0;
  // Vertical: N·cosτ + T·sin(τ+ε) − Df·sinτ = Δ;  along the water: T·cos(τ+ε) = N·sinτ + Df·cosτ.
  const ct = Math.cos(trim);
  const st = Math.sin(trim);
  const ce = Math.cos(trim + epsilon);
  const se = Math.sin(trim + epsilon);
  const det = ct * ce + st * se;
  const normalForce = ((weight + friction * st) * ce - se * friction * ct) / det;
  const thrust = (ct * friction * ct + st * (weight + friction * st)) / det;
  // Arms about G: N acts at l_p normal to the keel; Df acts along the bottom at (b/4)·tanβ above the keel.
  const c = hull.lcg - centreOfPressure;
  const a = hull.vcg - (b / 4) * Math.tan(hull.deadrise);
  const moment = normalForce * c + friction * a - thrust * f;
  return {
    speed,
    trim,
    speedCoefficient: cv,
    liftCoefficient: lift,
    wettedLengthRatio: lambda,
    keelLength,
    chineLength,
    transomDraft: keelLength * Math.sin(trim),
    bottomVelocity,
    reynolds,
    frictionCoefficient,
    friction,
    centreOfPressure,
    normalForce,
    thrust,
    resistance: thrust * ce,
    moment,
  };
}

/** Planing equilibrium and its stability margin. */
export interface PlaningEquilibrium extends PlaningState {
  /** Savitsky's porpoising limit trim for this load and deadrise, rad. */
  porpoisingTrim: number;
  /** True when the running trim exceeds the porpoising limit. */
  porpoising: boolean;
}

/**
 * The trim at which a planing hull runs: the trim where the bottom pressure, friction and thrust leave no pitching moment
 * about the centre of gravity (Savitsky's general equilibrium), with its resistance and porpoising margin.
 * @capability planing-hull Savitsky equilibrium running trim, resistance and porpoising check
 */
export function planingEquilibrium(hull: PlaningHull, speed: number, fluid: PlaningFluid = {}): PlaningEquilibrium {
  let low = 0.3 * DEG;
  let high = 20 * DEG;
  const at = (trim: number) => planingAtTrim(hull, speed, trim, fluid).moment;
  // The bottom pressure moves aft as trim rises, so the bow-down moment of N grows with trim.
  const lowMoment = at(low);
  for (let i = 0; i < 100; i += 1) {
    const mid = 0.5 * (low + high);
    if (Math.sign(at(mid)) === Math.sign(lowMoment)) low = mid;
    else high = mid;
  }
  const state = planingAtTrim(hull, speed, 0.5 * (low + high), fluid);
  const porpoisingTrim = savitskyPorpoisingTrim(state.liftCoefficient, hull.deadrise);
  return { ...state, porpoisingTrim, porpoising: state.trim > porpoisingTrim };
}

/**
 * Savitsky's (1964) porpoising stability limit: the trim above which a planing hull porpoises, against `√(C_Lβ/2)`, for
 * deadrise 0°, 10° and 20° (Day and Haag's tests), interpolated quadratically in deadrise. The curves are the cubic fits
 * of the chart published with OpenPlaning (Castro-Feliciano, MIT); valid for `0.13 ≤ √(C_Lβ/2) ≤ 0.3`, deadrise 0–20°.
 * @capability planing-hull Savitsky porpoising limit trim
 */
export function savitskyPorpoisingTrim(liftCoefficient: number, deadrise: number): number {
  const x = Math.sqrt(liftCoefficient / 2);
  const at0 = -376.37 * x ** 3 + 329.74 * x * x - 38.485 * x + 1.3415;
  const at10 = -356.05 * x ** 3 + 314.36 * x * x - 41.674 * x + 3.5786;
  const at20 = -254.51 * x ** 3 + 239.65 * x * x - 23.936 * x + 3.0195;
  const b = deadrise / DEG;
  // Lagrange through β = 0, 10, 20.
  const l0 = ((b - 10) * (b - 20)) / 200;
  const l10 = (b * (b - 20)) / -100;
  const l20 = (b * (b - 10)) / 200;
  return (at0 * l0 + at10 * l10 + at20 * l20) * DEG;
}

/** One run of a prismatic planing surface from NACA TN 2876 (Chambliss and Boyd, 1953), 20° deadrise, 4 in beam. */
export interface PrismaticPlaningRun {
  /** Trim, deg. */
  trim: number;
  /** Load coefficient `C_Δ = Δ/(w·b³)`. */
  load: number;
  /** Speed coefficient `C_V = V/√(g·b)`. */
  speed: number;
  /** Resistance coefficient `C_R = R/(w·b³)`. */
  resistance: number;
  /** Mean wetted length over beam. */
  meanWettedLength: number;
  /** Centre of pressure forward of the trailing edge, beams. */
  centreOfPressure: number;
}

/**
 * Langley tank model 276 (NACA TN 2876, Table I, public domain): a 20° deadrise prismatic surface, 4 in beam, in fresh
 * water at 63.4 lb/ft³ and ν = 10.55·10⁻⁶ ft²/s. Rows with wetted chines, read from the table.
 */
export const NACA_TN2876_RUNS: readonly PrismaticPlaningRun[] = [
  { trim: 2, load: 4.26, speed: 13.54, resistance: 2.17, meanWettedLength: 5.97, centreOfPressure: 3.39 },
  { trim: 2, load: 6.39, speed: 17.02, resistance: 3.32, meanWettedLength: 5.72, centreOfPressure: 4.05 },
  { trim: 4, load: 6.39, speed: 12.81, resistance: 1.64, meanWettedLength: 3.46, centreOfPressure: 2.52 },
  { trim: 4, load: 10.65, speed: 16.35, resistance: 2.74, meanWettedLength: 3.69, centreOfPressure: 2.76 },
  { trim: 4, load: 10.65, speed: 18.45, resistance: 2.5, meanWettedLength: 2.21, centreOfPressure: 1.74 },
  { trim: 4, load: 10.65, speed: 22.02, resistance: 2.42, meanWettedLength: 1.21, centreOfPressure: 1.14 },
  { trim: 4, load: 19.17, speed: 21.96, resistance: 4.94, meanWettedLength: 3.72, centreOfPressure: 2.7 },
  { trim: 4, load: 19.17, speed: 25.16, resistance: 4.56, meanWettedLength: 2.21, centreOfPressure: 1.8 },
  { trim: 4, load: 27.69, speed: 24.7, resistance: 6.99, meanWettedLength: 4.71, centreOfPressure: 3.54 },
  { trim: 6, load: 10.65, speed: 10.89, resistance: 2.34, meanWettedLength: 5.0, centreOfPressure: 3.33 },
  { trim: 6, load: 10.65, speed: 11.04, resistance: 2.38, meanWettedLength: 5.0, centreOfPressure: 3.27 },
];

/** Model 276's beam, m, and its tank water. */
export const NACA_TN2876_MODEL = {
  beam: 4 * 0.0254,
  deadrise: 20 * DEG,
  density: (63.4 / 32.174) * 515.379,
  viscosity: 10.55e-6 * 0.09290304,
} as const;
