/** Hull force derivatives of the MMG standard method, over `½ρ·L·d·U²` (forces) and `½ρ·L²·d·U²` (moment). */
export interface ManoeuvringDerivatives {
  Xvv: number;
  Xvr: number;
  Xrr: number;
  Xvvvv: number;
  Yv: number;
  Yr: number;
  Yvvv: number;
  Yvvr: number;
  Yvrr: number;
  Yrrr: number;
  Nv: number;
  Nr: number;
  Nvvv: number;
  Nvvr: number;
  Nvrr: number;
  Nrrr: number;
}

/** A rudder behind the propeller and its interaction with hull and race (MMG standard method). */
export interface ManoeuvringRudder {
  /** Movable area, m². */
  area: number;
  /** Span, m. */
  height: number;
  /** Longitudinal position over the length from midship, negative aft. */
  position: number;
  /** Steering resistance deduction `t_R`. */
  deduction: number;
  /** Rudder force increase factor `a_H`. */
  hullForceFactor: number;
  /** Where the hull's extra side force acts, `x'_H` over the length. */
  hullForcePosition: number;
  /** Flow straightening `γ_R` for negative and positive inflow angle. */
  straighteningNegative: number;
  straighteningPositive: number;
  /** Effective rudder lever `ℓ'_R` in `β_R = β − ℓ'_R·r'`. */
  inflowLever: number;
  /** Wake ratio rudder over propeller `ε`. */
  wakeRatio: number;
  /** Propeller race coefficient `κ`. */
  raceFactor: number;
  /** Lift slope `f_α`, per rad. */
  liftSlope: number;
}

/**
 * Hull and rudder manoeuvring forces of the MMG standard method (Yasukawa & Yoshimura 2015), the `manoeuvring` effect of
 * `boatDynamics`: sway and yaw from the hull's drift and turn through its derivatives, and, with a `rudder`, the rudder
 * normal force from the propeller race and the flow-straightened drift at the rudder with its hull interaction. So
 * advance, tactical diameter and zig-zag overshoot come from the hull's own coefficients. Without a `rudder` the boat's
 * `steering` acts as usual (an outboard swings its thrust at the propeller position).
 */
export interface HullManoeuvring {
  /** `false` turns the effect off while keeping its numbers (default `true`). */
  enabled?: boolean;
  /** Mean draught `d`, m, for the non-dimensional scale. */
  draft: number;
  derivatives: ManoeuvringDerivatives;
  rudder?: ManoeuvringRudder;
}

/** Forces at midship in ship axes (x forward, y to starboard, yaw to starboard), N and N·m. */
export type ManoeuvringLoads = [x: number, y: number, n: number];

/**
 * Hull forces from drift and yaw rate at midship (the MMG `X_H` without straight-running resistance, `Y_H`, `N_H`).
 * `v` is to starboard, `r` turning to starboard.
 * @capability boat-manoeuvring MMG hull manoeuvring forces from hull derivatives
 */
export function hullManoeuvringForces(hull: HullManoeuvring, length: number, density: number, u: number, v: number, r: number, out: ManoeuvringLoads = [0, 0, 0]): ManoeuvringLoads {
  const speed = Math.hypot(u, v);
  const h = hull.derivatives;
  if (speed < 1e-9) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  const vn = v / speed;
  const rn = (r * length) / speed;
  const scale = 0.5 * density * length * hull.draft * speed * speed;
  out[0] = scale * (h.Xvv * vn * vn + h.Xvr * vn * rn + h.Xrr * rn * rn + h.Xvvvv * vn ** 4);
  out[1] = scale * (h.Yv * vn + h.Yr * rn + h.Yvvv * vn ** 3 + h.Yvvr * vn * vn * rn + h.Yvrr * vn * rn * rn + h.Yrrr * rn ** 3);
  out[2] = scale * length * (h.Nv * vn + h.Nr * rn + h.Nvvv * vn ** 3 + h.Nvvr * vn * vn * rn + h.Nvrr * vn * rn * rn + h.Nrrr * rn ** 3);
  return out;
}

/** The propeller race the rudder sits in: inflow speed at the propeller, its `K_T` and advance ratio, and its diameter. */
export interface RudderInflow {
  /** Axial inflow at the propeller `u·(1 − w_P)`, m/s. */
  inflow: number;
  thrustCoefficient: number;
  advance: number;
  diameter: number;
}

/**
 * Rudder forces at midship (MMG): effective inflow from the propeller race, flow straightening of the drift at the
 * rudder, normal force `½ρA·U_R²·f_α·sin α_R`, steering resistance and the hull's extra side force. `steer` is positive
 * to starboard.
 * @capability boat-manoeuvring MMG rudder forces with propeller race and hull interaction
 */
export function rudderForces(rudder: ManoeuvringRudder, length: number, density: number, u: number, v: number, r: number, steer: number, race: RudderInflow, out: ManoeuvringLoads = [0, 0, 0]): ManoeuvringLoads {
  const speed = Math.hypot(u, v);
  const rn = speed > 1e-9 ? (r * length) / speed : 0;
  const drift = Math.atan2(-v, u);
  const eta = race.diameter / rudder.height;
  const kt = race.thrustCoefficient;
  const j = race.advance;
  const raceTerm = j > 1e-9 ? Math.sqrt(1 + (8 * kt) / (Math.PI * j * j)) - 1 : 0;
  const uR = rudder.wakeRatio * race.inflow * Math.sqrt(eta * (1 + rudder.raceFactor * raceTerm) ** 2 + (1 - eta));
  const rudderDrift = drift - rudder.inflowLever * rn;
  const gamma = rudderDrift < 0 ? rudder.straighteningNegative : rudder.straighteningPositive;
  const vR = speed * gamma * rudderDrift;
  const angle = steer - Math.atan2(vR, uR);
  const normal = 0.5 * density * rudder.area * (uR * uR + vR * vR) * rudder.liftSlope * Math.sin(angle);
  out[0] = -(1 - rudder.deduction) * normal * Math.sin(steer);
  out[1] = -(1 + rudder.hullForceFactor) * normal * Math.cos(steer);
  out[2] = -(rudder.position + rudder.hullForceFactor * rudder.hullForcePosition) * length * normal * Math.cos(steer);
  return out;
}
