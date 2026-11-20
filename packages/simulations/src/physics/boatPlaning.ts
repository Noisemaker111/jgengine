import { frictionLineCoefficient, SEA_WATER_KINEMATIC_VISCOSITY, type BoatWater } from "./boatResistance";

const DEG = Math.PI / 180;

/**
 * A prismatic planing bottom for Savitsky's method, the `planing` effect of `boatDynamics`: the hull carries its weight
 * on bottom pressure at a running trim set by the balance of that pressure's centre against the centre of gravity, and
 * drags friction along the wetted bottom. Below `C_V = 0.6` (the bottom of Savitsky's fits) the drag at `C_V = 0.6` is
 * scaled with speed squared and the trim eases to level at rest.
 */
export interface PlaningBottom {
  /** Multiplier on the effect: `0` off (the simple model's term), `1` exactly as the reference measures it (default), past `1` stronger; sane over `0..4`. */
  strength?: number;
  /** Deadrise, rad. */
  deadrise: number;
  /** Centre of gravity forward of the transom, m. */
  lcg: number;
  /** Centre of gravity above the keel, m. */
  vcg: number;
  /** Chine beam, m (default the tuning's `beam`). */
  chineBeam?: number;
  /** Thrust line inclination to the keel, rad (default `0`). */
  thrustAngle?: number;
  /** Distance from G to the thrust line, normal to it, m; positive when the line passes below G (default `0`). */
  thrustOffset?: number;
  /** Roughness allowance on the friction coefficient (default `0.0004`, Savitsky's full-scale figure). */
  roughnessAllowance?: number;
  /** Seconds the running trim takes to settle toward its balance (default `0.4`). */
  trimResponse?: number;
}

/** The planing bottom's forces at one speed and trim. */
export interface PlaningForces {
  /** `C_V = V/√(g·b)`. */
  speedCoefficient: number;
  /** Mean wetted length over beam. */
  wettedLengthRatio: number;
  /** Bottom pressure force normal to the keel, N. */
  normalForce: number;
  /** Friction along the bottom, N. */
  friction: number;
  /** Horizontal drag the thrust must overcome, N. */
  resistance: number;
  /** Trimming moment about G, N·m; zero at the running trim, positive pushes the bow down. */
  moment: number;
}

function liftCoefficient(tauDeg: number, lambda: number, cv: number, betaDeg: number): number {
  const cl0 = tauDeg ** 1.1 * (0.012 * Math.sqrt(lambda) + (0.0055 * lambda ** 2.5) / (cv * cv));
  return cl0 - 0.0065 * betaDeg * cl0 ** 0.6;
}

function wettedLength(tauDeg: number, lift: number, cv: number, betaDeg: number): number {
  let low = 1e-4;
  let high = 1;
  while (liftCoefficient(tauDeg, high, cv, betaDeg) < lift && high < 1e3) high *= 2;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (low + high);
    if (liftCoefficient(tauDeg, mid, cv, betaDeg) < lift) low = mid;
    else high = mid;
  }
  return 0.5 * (low + high);
}

/**
 * Savitsky's (1964) planing forces at a trim: the mean wetted length that carries the weight, the mean bottom velocity,
 * Schoenherr friction, the centre of pressure `l_p/(λb) = 0.75 − 1/(5.21·C_V²/λ² + 2.39)`, and the trimming moment about
 * G with the thrust line.
 * @capability boat-planing Savitsky planing lift, friction, resistance and trimming moment at a trim
 */
export function planingForces(bottom: PlaningBottom, beam: number, massKg: number, speed: number, trim: number, water: BoatWater = {}): PlaningForces {
  const rho = water.density ?? 1025;
  const nu = water.viscosity ?? SEA_WATER_KINEMATIC_VISCOSITY;
  const g = water.gravity ?? 9.81;
  const b = bottom.chineBeam ?? beam;
  const weight = massKg * g;
  const betaDeg = bottom.deadrise / DEG;
  const tau = Math.max(0.2 * DEG, trim);
  const tauDeg = tau / DEG;
  const cv = speed / Math.sqrt(g * b);
  const lift = weight / (0.5 * rho * speed * speed * b * b);
  const lambda = wettedLength(tauDeg, lift, cv, betaDeg);
  const dryLift = 0.012 * Math.sqrt(lambda) * tauDeg ** 1.1;
  const bottomVelocity = speed * Math.sqrt(Math.max(0, 1 - (dryLift - 0.0065 * betaDeg * dryLift ** 0.6) / (lambda * Math.cos(tau))));
  const cf = frictionLineCoefficient("schoenherr", (bottomVelocity * lambda * b) / nu) + (bottom.roughnessAllowance ?? 0.0004);
  const friction = (0.5 * rho * bottomVelocity * bottomVelocity * lambda * b * b * cf) / Math.cos(bottom.deadrise);
  const centreOfPressure = lambda * b * (0.75 - 1 / ((5.21 * cv * cv) / (lambda * lambda) + 2.39));
  const epsilon = bottom.thrustAngle ?? 0;
  const ct = Math.cos(tau);
  const st = Math.sin(tau);
  const ce = Math.cos(tau + epsilon);
  const se = Math.sin(tau + epsilon);
  const det = ct * ce + st * se;
  const normalForce = ((weight + friction * st) * ce - se * friction * ct) / det;
  const thrust = (ct * friction * ct + st * (weight + friction * st)) / det;
  const moment = normalForce * (bottom.lcg - centreOfPressure) + friction * (bottom.vcg - (b / 4) * Math.tan(bottom.deadrise)) - thrust * (bottom.thrustOffset ?? 0);
  return { speedCoefficient: cv, wettedLengthRatio: lambda, normalForce, friction, resistance: thrust * ce, moment };
}

/**
 * The running trim where the planing bottom leaves no moment about G (bisection between 0.3° and 20°).
 * @capability boat-planing Savitsky equilibrium running trim
 */
export function planingTrim(bottom: PlaningBottom, beam: number, massKg: number, speed: number, water: BoatWater = {}): number {
  let low = 0.3 * DEG;
  let high = 20 * DEG;
  const lowMoment = planingForces(bottom, beam, massKg, speed, low, water).moment;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (low + high);
    if (Math.sign(planingForces(bottom, beam, massKg, speed, mid, water).moment) === Math.sign(lowMoment)) low = mid;
    else high = mid;
  }
  return 0.5 * (low + high);
}
