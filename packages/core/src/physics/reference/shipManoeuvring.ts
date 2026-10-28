import { schoenherrFriction } from "./shipResistance";

const DEG = Math.PI / 180;

/** Hull force derivatives of the MMG standard method, non-dimensionalised by ½ρ·L·d·U² (forces) and ½ρ·L²·d·U² (moment). */
export interface MmgHullDerivatives {
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

/** Propeller of an MMG ship: open-water thrust `KT = k0 + k1·J + k2·J²` and its wake and thrust deduction. */
export interface MmgPropeller {
  diameter: number;
  /** `[k0, k1, k2]`. */
  thrust: readonly [number, number, number];
  /** Effective wake fraction in straight running, `wP0`. */
  wake: number;
  /** Thrust deduction `tP`. */
  thrustDeduction: number;
  /** Longitudinal position `x'P` over `L`, from midship (negative aft). */
  position: number;
  /** Wake change with inflow angle: `(1 − wP)/(1 − wP0) = 1 + (1 − e^(−C1·|βP|))(C2 − 1)`, `C2` set per sign of `βP`. */
  wakeChange: { c1: number; c2Positive: number; c2Negative: number };
}

/** Rudder of an MMG ship and its interaction with hull and propeller. */
export interface MmgRudder {
  /** Movable area, m². */
  area: number;
  /** Span, m. */
  height: number;
  /** Longitudinal position `x'R` over `L` (negative aft). */
  position: number;
  /** Steering resistance deduction `tR`. */
  deduction: number;
  /** Rudder force increase factor `aH`. */
  hullForceFactor: number;
  /** Where the hull's extra side force acts, `x'H` over `L`. */
  hullForcePosition: number;
  /** Flow straightening `γR` for `βR < 0` and `βR > 0`. */
  straighteningNegative: number;
  straighteningPositive: number;
  /** Effective rudder lever `ℓ'R` in `βR = β − ℓ'R·r'`. */
  inflowLever: number;
  /** Wake ratio rudder/propeller `ε`. */
  wakeRatio: number;
  /** Propeller race coefficient `κ`. */
  raceFactor: number;
  /** Lift slope `fα`, per rad. */
  liftSlope: number;
}

/**
 * A ship in the MMG standard method (Yasukawa & Yoshimura 2015): hull, propeller and rudder modules, each with its own
 * coefficients, summed at midship. Axes: x forward, y to starboard, yaw positive turning to starboard.
 */
export interface MmgShip {
  name: string;
  length: number;
  beam: number;
  draft: number;
  /** Displaced volume, m³. */
  displacement: number;
  /** Centre of gravity forward of midship, m. */
  centreOfGravity: number;
  /** Yaw radius of gyration about G, m. */
  yawRadius: number;
  density: number;
  /** Straight-running resistance coefficient `R'0 = R/(½ρ·L·d·U²)`. */
  resistance: number;
  hull: MmgHullDerivatives;
  /** Added mass `m'x`, `m'y` (over ½ρL²d) and added yaw inertia `J'z` (over ½ρL⁴d). */
  addedMass: { surge: number; sway: number; yaw: number };
  propeller: MmgPropeller;
  /** Omit for a boat steered by swinging its thrust (outboard or waterjet nozzle). */
  rudder?: MmgRudder;
  /** Largest steering angle, rad. */
  maxSteer: number;
  /** Steering rate, rad/s. */
  steerRate: number;
}

/** Ship state: earth position (x north, y east), heading, body velocities at midship and the steering angle. */
export interface MmgState {
  x: number;
  y: number;
  heading: number;
  u: number;
  v: number;
  r: number;
  steer: number;
  time: number;
}

/** Forces at midship, N and N·m, by module. */
export interface MmgForces {
  X: number;
  Y: number;
  N: number;
  hull: readonly [number, number, number];
  propeller: number;
  steering: readonly [number, number, number];
  /** Rudder normal force, N (`0` for vectored thrust). */
  rudderNormal: number;
  thrust: number;
}

/**
 * The KVLCC2 L7 free-running model (1/45.7, MARIN) with the hull, propeller and rudder coefficients Yasukawa and
 * Yoshimura used for their simulations (2015, Tables 1 and 3). `R'0` is the L3 captive-test value (0.022 at Re 1.9·10⁶)
 * carried to the L7 Reynolds number with a constant form factor on Schoenherr's line, the paper's 3-D extrapolation;
 * `x'P = −0.48` and `x'R = −0.5` are the method's standard positions. Fresh tank water.
 * @capability ship-manoeuvring KVLCC2 L7 model in the MMG standard method
 */
export const KVLCC2_L7: MmgShip = (() => {
  const length = 7;
  const draft = 0.46;
  const scale = 45.7;
  const viscosity = 1.1386e-6;
  // L3 model: Lpp 2.902, d 0.189, S = 27 194 m² full-scale wetted area scaled by 1/110², tested at 0.76 m/s.
  const l3Area = 27194 / 110 ** 2;
  const l3Total = (0.022 * 2.902 * 0.189) / l3Area;
  const formFactor = l3Total / schoenherrFriction((0.76 * 2.902) / viscosity);
  const speed = (15.5 * 1852) / 3600 / Math.sqrt(scale);
  const area = 27194 / scale ** 2;
  const resistance = (formFactor * schoenherrFriction((speed * length) / viscosity) * area) / (length * draft);
  return {
    name: "KVLCC2 L7 model",
    length,
    beam: 1.27,
    draft,
    displacement: 3.27,
    centreOfGravity: 0.25,
    yawRadius: 0.25 * length,
    density: 1000,
    resistance,
    hull: {
      Xvv: -0.04, Xvr: 0.002, Xrr: 0.011, Xvvvv: 0.771,
      Yv: -0.315, Yr: 0.083, Yvvv: -1.607, Yvvr: 0.379, Yvrr: -0.391, Yrrr: 0.008,
      Nv: -0.137, Nr: -0.049, Nvvv: -0.03, Nvvr: -0.294, Nvrr: 0.055, Nrrr: -0.013,
    },
    addedMass: { surge: 0.022, sway: 0.223, yaw: 0.011 },
    propeller: {
      diameter: 0.216,
      thrust: [0.2931, -0.2753, -0.1385],
      wake: 0.4,
      thrustDeduction: 0.22,
      position: -0.48,
      wakeChange: { c1: 2, c2Positive: 1.6, c2Negative: 1.1 },
    },
    rudder: {
      area: 0.0539,
      height: 0.345,
      position: -0.5,
      deduction: 0.387,
      hullForceFactor: 0.312,
      hullForcePosition: -0.464,
      straighteningNegative: 0.395,
      straighteningPositive: 0.64,
      inflowLever: -0.71,
      wakeRatio: 1.09,
      raceFactor: 0.5,
      liftSlope: 2.747,
    },
    maxSteer: 35 * DEG,
    steerRate: 1.76 * DEG * Math.sqrt(scale),
  };
})();

/**
 * The approach speed of the KVLCC2 simulations, m/s at L7 scale (15.5 kn full scale).
 * @capability ship-manoeuvring KVLCC2 approach speed at model scale
 */
export const KVLCC2_L7_SPEED = (15.5 * 1852) / 3600 / Math.sqrt(45.7);

/**
 * Published turning and zig-zag results for the KVLCC2 L7 model: the MMG calculation and MARIN's free-running test
 * (Yasukawa & Yoshimura 2015, Tables 4 and 5). Advance and tactical diameter are over `L`; overshoots in degrees.
 * @capability ship-manoeuvring published KVLCC2 turning circle and zig-zag results
 */
export const KVLCC2_L7_PUBLISHED = {
  turning: [
    { rudder: 35, advance: { calculated: 3.31, measured: 3.25 }, tacticalDiameter: { calculated: 3.36, measured: 3.34 } },
    { rudder: -35, advance: { calculated: 3.26, measured: 3.11 }, tacticalDiameter: { calculated: 3.26, measured: 3.08 } },
  ],
  zigZag: [
    { rudder: 10, overshoots: { calculated: [5.2, 15.8], measured: [8.2, 21.9] } },
    { rudder: 20, overshoots: { calculated: [10.9], measured: [13.7] } },
    { rudder: -10, overshoots: { calculated: [7.6, 10.2], measured: [9.5, 15.0] } },
    { rudder: -20, overshoots: { calculated: [14.5], measured: [15.1] } },
  ],
} as const;

/** Mass, kg. */
function shipMass(ship: MmgShip): number {
  return ship.density * ship.displacement;
}

function openWaterThrust(propeller: MmgPropeller, advance: number): number {
  const [k0, k1, k2] = propeller.thrust;
  return k0 + k1 * advance + k2 * advance * advance;
}

/**
 * Propeller revolutions, rev/s, that hold `speed` in straight running: `(1 − tP)·T = R0`.
 * @capability ship-manoeuvring self-propulsion revolutions from resistance and open-water thrust
 */
export function selfPropulsionRevs(ship: MmgShip, speed: number): number {
  const p = ship.propeller;
  const resistance = 0.5 * ship.density * ship.length * ship.draft * speed * speed * ship.resistance;
  const [k0, k1, k2] = p.thrust;
  const inflow = (speed * (1 - p.wake)) / p.diameter;
  const c = k2 * inflow * inflow - resistance / ((1 - p.thrustDeduction) * ship.density * p.diameter ** 4);
  const b = k1 * inflow;
  return (-b + Math.sqrt(b * b - 4 * k0 * c)) / (2 * k0);
}

/**
 * Creates an {@link MmgState} running straight ahead at `speed` from the origin.
 * @capability ship-manoeuvring straight-running initial state
 */
export function createMmgState(speed: number, heading = 0): MmgState {
  return { x: 0, y: 0, heading, u: speed, v: 0, r: 0, steer: 0, time: 0 };
}

/**
 * Hull, propeller and steering forces at midship for a state and propeller revolutions `revs` (rev/s). A ship with a
 * rudder uses the MMG rudder model (normal force from the propeller race and the flow-straightened drift at the rudder);
 * a ship without one swings the propeller thrust by the steering angle at the propeller position.
 * @capability ship-manoeuvring MMG hull, propeller and rudder forces
 */
export function mmgForces(ship: MmgShip, state: MmgState, revs: number): MmgForces {
  const { length: L, draft: d, density: rho } = ship;
  const { u, v, r, steer } = state;
  const speed = Math.hypot(u, v);
  const vNd = speed > 1e-9 ? v / speed : 0;
  const rNd = speed > 1e-9 ? (r * L) / speed : 0;
  const drift = Math.atan2(-v, u);
  const h = ship.hull;
  const forceScale = 0.5 * rho * L * d * speed * speed;
  const hullX = forceScale * (-ship.resistance + h.Xvv * vNd ** 2 + h.Xvr * vNd * rNd + h.Xrr * rNd ** 2 + h.Xvvvv * vNd ** 4);
  const hullY = forceScale * (h.Yv * vNd + h.Yr * rNd + h.Yvvv * vNd ** 3 + h.Yvvr * vNd ** 2 * rNd + h.Yvrr * vNd * rNd ** 2 + h.Yrrr * rNd ** 3);
  const hullN = forceScale * L * (h.Nv * vNd + h.Nr * rNd + h.Nvvv * vNd ** 3 + h.Nvvr * vNd ** 2 * rNd + h.Nvrr * vNd * rNd ** 2 + h.Nrrr * rNd ** 3);

  const p = ship.propeller;
  const propellerDrift = drift - p.position * rNd;
  const c2 = propellerDrift > 0 ? p.wakeChange.c2Positive : p.wakeChange.c2Negative;
  const wakeRatio = 1 + (1 - Math.exp(-p.wakeChange.c1 * Math.abs(propellerDrift))) * (c2 - 1);
  const inflow = u * (1 - p.wake) * wakeRatio;
  const advance = revs > 1e-9 ? inflow / (revs * p.diameter) : 0;
  const kt = openWaterThrust(p, advance);
  const thrust = rho * revs * revs * p.diameter ** 4 * kt;

  let steerX = 0;
  let steerY = 0;
  let steerN = 0;
  let normal = 0;
  let propX = (1 - p.thrustDeduction) * thrust;
  const rudder = ship.rudder;
  if (rudder === undefined) {
    propX = (1 - p.thrustDeduction) * thrust * Math.cos(steer);
    steerY = -thrust * Math.sin(steer);
    steerN = p.position * L * steerY;
  } else {
    const eta = p.diameter / rudder.height;
    const race = advance > 1e-9 ? Math.sqrt(1 + (8 * kt) / (Math.PI * advance * advance)) - 1 : 0;
    const uR = rudder.wakeRatio * inflow * Math.sqrt(eta * (1 + rudder.raceFactor * race) ** 2 + (1 - eta));
    const rudderDrift = drift - rudder.inflowLever * rNd;
    const gamma = rudderDrift < 0 ? rudder.straighteningNegative : rudder.straighteningPositive;
    const vR = speed * gamma * rudderDrift;
    const angle = steer - Math.atan2(vR, uR);
    normal = 0.5 * rho * rudder.area * (uR * uR + vR * vR) * rudder.liftSlope * Math.sin(angle);
    steerX = -(1 - rudder.deduction) * normal * Math.sin(steer);
    steerY = -(1 + rudder.hullForceFactor) * normal * Math.cos(steer);
    steerN = -(rudder.position + rudder.hullForceFactor * rudder.hullForcePosition) * L * normal * Math.cos(steer);
  }
  return {
    X: hullX + propX + steerX,
    Y: hullY + steerY,
    N: hullN + steerN,
    hull: [hullX, hullY, hullN],
    propeller: propX,
    steering: [steerX, steerY, steerN],
    rudderNormal: normal,
    thrust,
  };
}

/** Body accelerations `[u̇, v̇, ṙ]` from the MMG equations of motion at midship with G at `xG`. */
function accelerations(ship: MmgShip, state: MmgState, revs: number): [number, number, number] {
  const m = shipMass(ship);
  const half = 0.5 * ship.density * ship.length * ship.length * ship.draft;
  const mx = ship.addedMass.surge * half;
  const my = ship.addedMass.sway * half;
  const jz = ship.addedMass.yaw * half * ship.length * ship.length;
  const xG = ship.centreOfGravity;
  const iz = m * ship.yawRadius * ship.yawRadius + xG * xG * m + jz;
  const { u, v, r } = state;
  const f = mmgForces(ship, state, revs);
  const du = (f.X + (m + my) * v * r + xG * m * r * r) / (m + mx);
  // (m + my)·v̇ + xG·m·ṙ = Y − (m + mx)·u·r;  xG·m·v̇ + Iz·ṙ = N − xG·m·u·r
  const a = m + my;
  const b = xG * m;
  const y = f.Y - (m + mx) * u * r;
  const n = f.N - xG * m * u * r;
  const det = a * iz - b * b;
  return [du, (y * iz - b * n) / det, (a * n - b * y) / det];
}

/**
 * Advances `state` by `dt` in place: the steering angle slews toward `steerTarget` at the ship's rate, then the
 * equations of motion are integrated by fourth-order Runge–Kutta with the angle held over the step.
 * @capability ship-manoeuvring time step of the MMG equations of motion
 */
export function stepMmg(ship: MmgShip, state: MmgState, steerTarget: number, revs: number, dt: number): MmgState {
  const target = Math.max(-ship.maxSteer, Math.min(ship.maxSteer, steerTarget));
  const slew = ship.steerRate * dt;
  state.steer += Math.max(-slew, Math.min(slew, target - state.steer));
  const derivative = (s: MmgState): [number, number, number, number, number, number] => {
    const [du, dv, dr] = accelerations(ship, s, revs);
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    return [s.u * c - s.v * sn, s.u * sn + s.v * c, s.r, du, dv, dr];
  };
  const at = (k: readonly number[], scale: number): MmgState => ({
    ...state,
    x: state.x + scale * (k[0] ?? 0),
    y: state.y + scale * (k[1] ?? 0),
    heading: state.heading + scale * (k[2] ?? 0),
    u: state.u + scale * (k[3] ?? 0),
    v: state.v + scale * (k[4] ?? 0),
    r: state.r + scale * (k[5] ?? 0),
  });
  const k1 = derivative(state);
  const k2 = derivative(at(k1, dt / 2));
  const k3 = derivative(at(k2, dt / 2));
  const k4 = derivative(at(k3, dt));
  const mix = (i: number) => (dt / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
  state.x += mix(0);
  state.y += mix(1);
  state.heading += mix(2);
  state.u += mix(3);
  state.v += mix(4);
  state.r += mix(5);
  state.time += dt;
  return state;
}

/** A turning-circle trial's indices, m (divide by `L` for the usual `A'D`, `D'T`). */
export interface TurningCircle {
  /** Forward travel of midship when the heading has turned 90°. */
  advance: number;
  /** Sideways travel when the heading has turned 90°. */
  transfer: number;
  /** Sideways travel when the heading has turned 180°. */
  tacticalDiameter: number;
  /** Diameter of the settled circle. */
  steadyDiameter: number;
  /** Settled speed over approach speed. */
  speedLoss: number;
  /** Seconds to turn 90° and 180°. */
  timeTo90: number;
  timeTo180: number;
}

/** Any boat that can run a trial: steer target in rad (positive to starboard), returns the earth pose after `dt`. */
export interface ManoeuvringTrialBoat {
  step(steerTarget: number, dt: number): { x: number; y: number; heading: number; speed: number };
}

/**
 * Runs a turning-circle trial on any boat: full `rudder` from straight running at time 0, until the heading has turned
 * 360° beyond the 180° point or `maxTime` passes. Positions are earth x forward of the approach course, y to starboard.
 * @capability ship-manoeuvring turning-circle trial (advance, transfer, tactical and steady diameter)
 */
export function runTurningCircle(boat: ManoeuvringTrialBoat, rudder: number, approachSpeed: number, dt: number, maxTime: number): TurningCircle {
  const sign = rudder >= 0 ? 1 : -1;
  let prev = { x: 0, y: 0, heading: 0, speed: approachSpeed };
  let time = 0;
  let advance = Number.NaN;
  let transfer = Number.NaN;
  let tactical = Number.NaN;
  let timeTo90 = Number.NaN;
  let timeTo180 = Number.NaN;
  const settled: { x: number; y: number }[] = [];
  let speed = approachSpeed;
  while (time < maxTime) {
    const next = boat.step(rudder, dt);
    time += dt;
    const turned = sign * next.heading;
    const before = sign * prev.heading;
    const cross = (angle: number) => before < angle && turned >= angle;
    const t = (angle: number) => (angle - before) / (turned - before);
    if (cross(Math.PI / 2)) {
      const s = t(Math.PI / 2);
      advance = prev.x + s * (next.x - prev.x);
      transfer = sign * (prev.y + s * (next.y - prev.y));
      timeTo90 = time - dt + s * dt;
    }
    if (cross(Math.PI)) {
      const s = t(Math.PI);
      tactical = sign * (prev.y + s * (next.y - prev.y));
      timeTo180 = time - dt + s * dt;
    }
    if (turned > 3 * Math.PI) settled.push({ x: next.x, y: next.y });
    speed = next.speed;
    prev = next;
    if (turned > 5 * Math.PI) break;
  }
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const point of settled) {
    xMin = Math.min(xMin, point.x);
    xMax = Math.max(xMax, point.x);
    yMin = Math.min(yMin, point.y);
    yMax = Math.max(yMax, point.y);
  }
  const steadyDiameter = settled.length > 0 ? 0.5 * (xMax - xMin + (yMax - yMin)) : Number.NaN;
  return { advance, transfer, tacticalDiameter: tactical, steadyDiameter, speedLoss: speed / approachSpeed, timeTo90, timeTo180 };
}

/** A zig-zag trial's overshoot angles, rad, and the times the rudder was reversed. */
export interface ZigZag {
  overshoots: number[];
  reversals: number[];
}

/**
 * Runs a `rudder`/`rudder` zig-zag (IMO 10/10 or 20/20; negative starts to port) on any boat: rudder over at time 0,
 * reversed each time the heading passes `±rudder` from the approach course, overshoot taken as the heading's peak past
 * the check angle. Stops after `overshoots` overshoots or `maxTime`.
 * @capability ship-manoeuvring zig-zag trial overshoot angles
 */
export function runZigZag(boat: ManoeuvringTrialBoat, rudder: number, dt: number, maxTime: number, overshoots = 2): ZigZag {
  const check = Math.abs(rudder);
  let side = rudder >= 0 ? 1 : -1;
  let target = side * check;
  let peak = Number.NaN;
  let time = 0;
  const out: ZigZag = { overshoots: [], reversals: [] };
  while (time < maxTime && out.overshoots.length < overshoots) {
    const pose = boat.step(target, dt);
    time += dt;
    const heading = pose.heading;
    if (Number.isNaN(peak)) {
      if (side * heading >= check) {
        side = -side;
        target = side * check;
        peak = -side * heading;
        out.reversals.push(time);
      }
      continue;
    }
    const past = -side * heading;
    if (past > peak) peak = past;
    else if (past < peak - 1e-9) {
      out.overshoots.push(peak - check);
      peak = Number.NaN;
    }
  }
  return out;
}

/**
 * Wraps an MMG ship as a {@link ManoeuvringTrialBoat} running at fixed propeller revolutions from straight running at
 * `speed` (revolutions default to self-propulsion at that speed, as in the paper's trials).
 * @capability ship-manoeuvring MMG ship as a trial boat
 */
export function mmgTrialBoat(ship: MmgShip, speed: number, revs = selfPropulsionRevs(ship, speed)): ManoeuvringTrialBoat & { state: MmgState } {
  const state = createMmgState(speed);
  return {
    state,
    step(steerTarget, dt) {
      stepMmg(ship, state, steerTarget, revs, dt);
      return { x: state.x, y: state.y, heading: state.heading, speed: Math.hypot(state.u, state.v) };
    },
  };
}
