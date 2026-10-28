// @skill jgengine-world
import { solveLinearSystem } from "../../math/linearAlgebra";
import type { BladeSection } from "./propeller";

/** A rotor's blades, hub and the section they are made of. A counter-clockwise rotor seen from above (the US and Bo-105 sense). */
export interface RotorDesign {
  /** Tip radius, m. */
  radius: number;
  blades: number;
  /** Blade chord, m (constant along the span). */
  chord: number;
  /** Linear twist from root to tip, rad; negative washes the tip out. */
  twist: number;
  /** Inner edge of the lifting blade as a share of the radius. */
  rootCutout: number;
  /** Rated rotor speed, rad/s. */
  speed: number;
  section: BladeSection;
  /**
   * Blade flapping. A hingeless blade is modelled as a rigid blade on a spring at `hingeOffset`; absent, the blades do
   * not flap (a stiff tail rotor).
   */
  flap?: {
    /** Blade flap inertia about the hinge, kg·m². */
    inertia: number;
    /** Flap spring at the hinge, N·m/rad. */
    stiffness: number;
    /** Hinge offset as a share of the radius (default `0`). */
    hingeOffset?: number;
    /** Built-in coning the spring holds at rest, rad (default `0`). */
    precone?: number;
  };
  /** Radial blade stations (default `10`); each carries its own annulus of inflow. */
  stations?: number;
  /** Azimuth positions averaged over a revolution (default `24`). */
  azimuths?: number;
}

/** What a rotor flies through, all in shaft axes: x forward in the disc, y right, z down the shaft. */
export interface RotorFlow {
  /** Hub velocity through the air, m/s. */
  u: number;
  v: number;
  w: number;
  /** Shaft-axis angular rates of the airframe, rad/s. */
  p: number;
  q: number;
  density: number;
  speedOfSound: number;
  /** Hub height above the ground, m; `Infinity` out of ground effect. */
  height: number;
}

/** Blade pitch, rad: `θ = collective + twist·(r/R − 0.75) + cosine·cos ψ + sine·sin ψ`, ψ from the tail in the direction of rotation. */
export interface RotorPitch {
  /** Collective at 75% radius. */
  collective: number;
  cosine: number;
  sine: number;
}

/** Loads one {@link evaluateRotor} call writes. Force and moment act on the hub, in shaft axes. */
export interface RotorLoads {
  force: [number, number, number];
  /** Hub roll and pitch moment from the flapping blades, N·m (positive right roll, nose up); yaw is `0`. */
  moment: [number, number, number];
  /** Aerodynamic torque resisting rotation, N·m. */
  torque: number;
  /** Shaft power the air takes, W. */
  power: number;
  /** Thrust along the shaft, N (up positive). */
  thrust: number;
  /** `T/(ρπR²(ΩR)²)`. */
  thrustCoefficient: number;
  /** Induced velocity factor from the ground, `≤ 1`. */
  groundEffect: number;
  /** Rate of change of each rotor state, per second. */
  rates: number[];
}

const FLAP = 0;
const FLAP_RATE = 3;
const HARMONIC = 6;
const ANNULI = 8;

/**
 * Number of states a rotor carries: three flap angles, their rates, two inflow harmonics and one inflow per station.
 * @capability rotor-bemt size a rotor state vector
 */
export function rotorStateCount(design: RotorDesign): number {
  return ANNULI + (design.stations ?? 10);
}

/**
 * Names of a rotor's states, in order.
 * @capability rotor-bemt name a rotor's states for telemetry and snapshots
 */
export function rotorStateNames(design: RotorDesign, prefix: string): string[] {
  const names = ["coning", "flapCosine", "flapSine", "coningRate", "flapCosineRate", "flapSineRate", "inflowSine", "inflowCosine"];
  for (let i = 0; i < (design.stations ?? 10); i += 1) names.push(`inflow${i}`);
  return names.map((name) => `${prefix}${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`);
}

/**
 * NACA 23012 rotor section: lift slope 6.0 per radian and zero lift at −1.2° (NACA Report 824), Prandtl–Glauert to
 * Mach 0.7, a maximum lift of 1.5 that falls with Mach past 0.3, Bailey's rotor profile-drag polar
 * `0.0087 − 0.0216α + 0.400α²` (NACA Report 716), a quadratic drag rise past a critical Mach of 0.72 (less with lift)
 * and flat-plate behaviour past the stall and in reversed flow.
 * @capability rotor-bemt NACA 23012 helicopter blade section lift and drag
 */
export function naca23012RotorSection(alpha: number, mach: number): { cl: number; cd: number } {
  let a = alpha + (1.2 * Math.PI) / 180;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  const beta = Math.sqrt(1 - Math.min(0.7, mach) ** 2);
  const slope = 6.0 / beta;
  const clMax = Math.max(0.8, 1.5 - 1.25 * Math.max(0, mach - 0.3));
  const clMin = -0.8 * clMax;
  const plate = 1.1 * Math.sin(2 * a);
  const stallUp = clMax / slope;
  const stallDown = clMin / slope;
  let cl: number;
  let stalled = 0;
  if (a >= stallDown && a <= stallUp) cl = slope * a;
  else {
    const limit = a > 0 ? clMax : clMin;
    stalled = Math.min(1, (a > 0 ? a - stallUp : stallDown - a) / 0.12);
    cl = (1 - stalled) * limit + stalled * plate;
  }
  const attachedAlpha = Math.max(stallDown, Math.min(stallUp, a));
  const profile = 0.0087 - 0.0216 * attachedAlpha + 0.4 * attachedAlpha * attachedAlpha;
  const critical = 0.72 - 0.25 * Math.min(1, Math.abs(cl));
  const wave = mach > critical ? 2 * (mach - critical) ** 2 : 0;
  const cd = (1 - stalled) * profile + stalled * (0.02 + 1.8 * Math.sin(a) ** 2) + wave;
  return { cl, cd };
}

/** Leishman's empirical induced velocity through the vortex ring state, `v/vh` against `Vc/vh` for −2 ≤ Vc/vh ≤ 0, over κ = 1.15. */
function vortexRingInflow(climb: number): number {
  return 1 - 0.978 * climb - 1.193 * climb ** 2 - 1.494 * climb ** 3 - 0.57 * climb ** 4;
}

const M0 = 8 / (3 * Math.PI);
const M1 = 16 / (45 * Math.PI);

/**
 * Evaluates a rotor: blade-element loads over the disc (each station and azimuth sees its own pitch, flapping,
 * inflow and Mach number), hub forces and moments, aerodynamic torque, and the rates of its states. The flap states are
 * multiblade coning and first-harmonic tilt with their rates, driven by aerodynamic flap moments, centrifugal and
 * spring stiffness and the airframe's pitch and roll rates. The inflow is dynamic blade-element momentum theory: each
 * annulus carries its own momentum inflow with Prandtl's tip loss and Pitt–Peters apparent mass, and the first
 * harmonics follow the Pitt–Peters (1981) skewed-wake model. Near the ground the induced velocity falls by
 * Cheeseman–Bennett; in the vortex ring state it follows Leishman's empirical curve.
 * @capability rotor-bemt evaluate a helicopter rotor: blade-element loads, flapping and dynamic inflow
 */
export function evaluateRotor(design: RotorDesign, flow: RotorFlow, pitch: RotorPitch, speed: number, state: readonly number[], out: RotorLoads): void {
  const radius = design.radius;
  const blades = design.blades;
  const stations = design.stations ?? 10;
  const azimuths = design.azimuths ?? 24;
  const tipSpeed = Math.max(1e-3, speed * radius);
  const disc = Math.PI * radius * radius;
  const scale = flow.density * disc * tipSpeed * tipSpeed;
  const root = design.rootCutout;
  const span = (1 - root) / stations;
  const hinge = design.flap?.hingeOffset ?? 0;
  const at = (i: number): number => state[i] ?? 0;
  const b0 = at(FLAP);
  const b1c = at(FLAP + 1);
  const b1s = at(FLAP + 2);
  const db0 = at(FLAP_RATE);
  const db1c = at(FLAP_RATE + 1);
  const db1s = at(FLAP_RATE + 2);
  const l1s = at(HARMONIC);
  const l1c = at(HARMONIC + 1);
  const mu = Math.hypot(flow.u, flow.v) / tipSpeed;
  const climb = -flow.w / tipSpeed;

  let meanInflow = 0;
  for (let j = 0; j < stations; j += 1) {
    const r = root + (j + 0.5) * span;
    meanInflow += at(ANNULI + j) * 2 * r * span;
  }
  meanInflow /= 1 - root * root;
  const groundEffect =
    Number.isFinite(flow.height) && flow.height > 0
      ? Math.max(0.5, 1 - (radius / (4 * Math.max(flow.height, 0.3 * radius))) ** 2 / (1 + (mu / Math.max(1e-3, Math.abs(meanInflow))) ** 2))
      : 1;

  let fx = 0;
  let fy = 0;
  let fz = 0;
  let torque = 0;
  let moment0 = 0;
  let moment1c = 0;
  let moment1s = 0;
  let cs = 0;
  let cc = 0;
  const annulusThrust = new Array<number>(stations).fill(0);
  for (let k = 0; k < azimuths; k += 1) {
    const psi = (2 * Math.PI * k) / azimuths;
    const cos = Math.cos(psi);
    const sin = Math.sin(psi);
    const beta = b0 + b1c * cos + b1s * sin;
    const betaRate = db0 + (db1c + speed * b1s) * cos + (db1s - speed * b1c) * sin;
    const sinBeta = Math.sin(beta);
    const cosBeta = Math.cos(beta);
    const radial = -flow.u * cos + flow.v * sin;
    const feather = pitch.collective + pitch.cosine * cos + pitch.sine * sin;
    for (let j = 0; j < stations; j += 1) {
      const rbar = root + (j + 0.5) * span;
      const r = rbar * radius;
      const inflow = groundEffect * at(ANNULI + j) + l1s * rbar * sin + l1c * rbar * cos + climb;
      const ut = speed * r + flow.u * sin + flow.v * cos;
      const up = inflow * tipSpeed - r * (flow.p * sin + flow.q * cos) * cosBeta + (r - hinge * radius) * betaRate - sinBeta * radial;
      const phi = Math.atan2(up, ut);
      const vsq = ut * ut + up * up;
      const theta = feather + design.twist * (rbar - 0.75);
      const { cl, cd } = design.section(theta - phi, Math.sqrt(vsq) / flow.speedOfSound, rbar);
      const dynamic = 0.5 * flow.density * vsq * design.chord * span * radius;
      const lift = dynamic * cl;
      const drag = dynamic * cd;
      const normal = lift * Math.cos(phi) - drag * Math.sin(phi);
      const inPlane = lift * Math.sin(phi) + drag * Math.cos(phi);
      fx += normal * sinBeta * cos - inPlane * sin;
      fy += -normal * sinBeta * sin - inPlane * cos;
      fz += -normal * cosBeta;
      torque += inPlane * r;
      const flapMoment = normal * (r - hinge * radius);
      moment0 += flapMoment;
      moment1c += flapMoment * cos;
      moment1s += flapMoment * sin;
      cs += normal * rbar * sin;
      cc += normal * rbar * cos;
      annulusThrust[j] = (annulusThrust[j] ?? 0) + normal;
    }
  }
  const perBlade = 1 / azimuths;
  const all = blades * perBlade;
  out.force[0] = fx * all;
  out.force[1] = fy * all;
  out.force[2] = fz * all;
  out.torque = torque * all;
  out.power = out.torque * speed;
  out.thrust = -out.force[2];
  const ct = out.thrust / scale;
  out.thrustCoefficient = ct;
  out.groundEffect = groundEffect;

  const rates = out.rates;
  const flap = design.flap;
  if (flap === undefined) {
    for (let i = 0; i < 6; i += 1) rates[i] = 0;
    out.moment[0] = 0;
    out.moment[1] = 0;
  } else {
    const centrifugal = (1.5 * hinge) / (1 - hinge);
    const stiffness = flap.inertia * speed * speed * centrifugal + flap.stiffness;
    const nu2 = speed * speed + stiffness / flap.inertia;
    rates[0] = db0;
    rates[1] = db1c;
    rates[2] = db1s;
    rates[3] = (moment0 * perBlade + flap.stiffness * (flap.precone ?? 0)) / flap.inertia - nu2 * b0;
    rates[4] = (2 * moment1c * perBlade) / flap.inertia - 2 * speed * db1s - (nu2 - speed * speed) * b1c + 2 * speed * flow.p;
    rates[5] = (2 * moment1s * perBlade) / flap.inertia + 2 * speed * db1c - (nu2 - speed * speed) * b1s - 2 * speed * flow.q;
    out.moment[0] = -0.5 * blades * stiffness * b1s;
    out.moment[1] = -0.5 * blades * stiffness * b1c;
  }
  out.moment[2] = 0;

  // Pitt–Peters: M·λ̇/Ω + L⁻¹·λ = C, with the mean inflow row carried annulus by annulus.
  const momentScale = scale * radius;
  const cSine = (cs * all * radius) / momentScale;
  const cCosine = (cc * all * radius) / momentScale;
  const lambda = climb + meanInflow;
  const total = Math.max(1e-4, Math.hypot(mu, lambda));
  const massFlow = Math.max(1e-4, (mu * mu + lambda * (lambda + meanInflow)) / total);
  const hover = Math.sqrt(Math.abs(ct) / 2);
  let ringTotal = total;
  let ringMass = massFlow;
  if (ct > 0 && hover > 1e-4) {
    const ratio = climb / hover;
    const edgewise = Math.max(0, 1 - (mu / hover) ** 2);
    if (ratio < 0 && ratio > -2 && edgewise > 0) {
      // In axial flight the moment rows see twice the total flow, as in hover.
      const empirical = ct / (2 * hover * vortexRingInflow(ratio));
      ringTotal = total + edgewise * (empirical - total);
      ringMass = massFlow + edgewise * (2 * empirical - massFlow);
    }
  }
  // Turbulent mixing keeps air moving through the disc even where momentum theory says it stops.
  const floor = Math.max(1e-4, 0.3 * hover);
  ringTotal = Math.max(floor, ringTotal);
  ringMass = Math.max(floor, ringMass);
  const skew = Math.min(Math.PI / 2 - 1e-3, Math.atan2(mu, Math.max(0, lambda)));
  const tanHalf = Math.tan(skew / 2);
  const cosSkew = Math.cos(skew);
  // Rotate the first harmonics into wind axes, where the wake skews aft.
  const windCos = mu > 1e-6 ? flow.u / (mu * tipSpeed) : 1;
  const windSin = mu > 1e-6 ? -flow.v / (mu * tipSpeed) : 0;
  const lc = l1c * windCos + l1s * windSin;
  const ls = -l1c * windSin + l1s * windCos;
  const forceC = cCosine * windCos + cSine * windSin;
  const forceS = -cCosine * windSin + cSine * windCos;
  // Each harmonic relaxes to its Pitt–Peters steady value λ = L·C on the lateral time constant: the mean inflow row
  // lives in the annuli, and splitting the 0–1c block out of L⁻¹ turns unstable as the wake skew nears 90°.
  const l31 = (((15 * Math.PI) / 64) * tanHalf) / ringTotal;
  const l33 = (4 * cosSkew) / ((1 + cosSkew) * ringMass);
  const l22 = 4 / ((1 + cosSkew) * ringMass);
  const rateC = ((speed / M1) * (l31 * ct + l33 * forceC - lc)) / l22;
  const rateS = ((speed / M1) * (l22 * forceS - ls)) / l22;
  rates[HARMONIC + 1] = rateC * windCos - rateS * windSin;
  rates[HARMONIC] = rateC * windSin + rateS * windCos;

  for (let j = 0; j < stations; j += 1) {
    const rbar = root + (j + 0.5) * span;
    const local = at(ANNULI + j);
    const localCt = ((annulusThrust[j] ?? 0) * all) / scale / (2 * rbar * span);
    const localLambda = climb + local;
    const phi = Math.max(1e-4, Math.abs(localLambda) / rbar);
    const tipLoss = Math.max(0.05, (2 / Math.PI) * Math.acos(Math.exp((-0.5 * blades * (1 - rbar)) / (rbar * phi))));
    let localTotal = Math.max(1e-4, Math.hypot(mu, localLambda));
    const localHover = Math.sqrt(Math.max(0, localCt) / (2 * tipLoss));
    if (localCt > 0 && localHover > 1e-4) {
      const ratio = climb / localHover;
      const edgewise = Math.max(0, 1 - (mu / localHover) ** 2);
      if (ratio < 0 && ratio > -2 && edgewise > 0) {
        const empirical = localCt / (2 * tipLoss * localHover * vortexRingInflow(ratio));
        localTotal += edgewise * (empirical - localTotal);
      }
    }
    localTotal = Math.max(Math.max(1e-4, 0.3 * localHover), localTotal);
    rates[ANNULI + j] = (speed / M0) * (localCt - 2 * tipLoss * localTotal * local);
  }
}

/**
 * Fresh output buffers for {@link evaluateRotor}.
 * @capability rotor-bemt allocate rotor load buffers once, outside the hot path
 */
export function createRotorLoads(design: RotorDesign): RotorLoads {
  return { force: [0, 0, 0], moment: [0, 0, 0], torque: 0, power: 0, thrust: 0, thrustCoefficient: 0, groundEffect: 1, rates: new Array<number>(rotorStateCount(design)).fill(0) };
}

/**
 * Newton's method with a forward-difference Jacobian and a backtracking line search; returns the last iterate and its residual norm.
 * @capability nonlinear-solve solve a small nonlinear system of equations
 */
export function solveNewton(residual: (x: readonly number[]) => number[], start: readonly number[], options: { iterations?: number; tolerance?: number; step?: readonly number[] } = {}): { x: number[]; norm: number } {
  const norm = (r: readonly number[]): number => Math.sqrt(r.reduce((sum, value) => sum + value * value, 0));
  let x = [...start];
  let r = residual(x);
  let current = norm(r);
  const tolerance = options.tolerance ?? 1e-10;
  for (let iteration = 0; iteration < (options.iterations ?? 40) && current > tolerance; iteration += 1) {
    const n = x.length;
    const jacobian: number[][] = [];
    for (let row = 0; row < r.length; row += 1) jacobian.push(new Array<number>(n).fill(0));
    for (let col = 0; col < n; col += 1) {
      const h = options.step?.[col] ?? 1e-6 * Math.max(1, Math.abs(x[col] ?? 0));
      const moved = [...x];
      moved[col] = (moved[col] ?? 0) + h;
      const rm = residual(moved);
      for (let row = 0; row < r.length; row += 1) {
        const line = jacobian[row];
        if (line !== undefined) line[col] = ((rm[row] ?? 0) - (r[row] ?? 0)) / h;
      }
    }
    const flat = Float64Array.from(jacobian.flat());
    const step = Float64Array.from(r, (value) => -value);
    solveLinearSystem(flat, step, r.length);
    const delta = Array.from(step);
    let factor = 1;
    let accepted = false;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const next = x.map((value, i) => value + factor * (delta[i] ?? 0));
      const nr = residual(next);
      const nn = norm(nr);
      if (Number.isFinite(nn) && nn < current) {
        x = next;
        r = nr;
        current = nn;
        accepted = true;
        break;
      }
      factor *= 0.5;
    }
    if (!accepted) break;
  }
  return { x, norm: current };
}

/** A first guess at a rotor's steady states: momentum inflow for a blade-element thrust estimate, no flapping. */
function initialRotorState(design: RotorDesign, flow: RotorFlow, pitch: RotorPitch, speed: number): number[] {
  const state = new Array<number>(rotorStateCount(design)).fill(0);
  const solidity = (design.blades * design.chord) / (Math.PI * design.radius);
  const ct = Math.max(1e-4, (solidity * 6 * pitch.collective) / 6);
  const mu = Math.hypot(flow.u, flow.v) / (speed * design.radius);
  const lambda = Math.sqrt(ct / 2) / Math.sqrt(1 + (mu / Math.sqrt(ct / 2)) ** 2);
  for (let j = 0; j < (design.stations ?? 10); j += 1) state[ANNULI + j] = lambda;
  state[FLAP] = design.flap?.precone ?? 0;
  return state;
}

const SETTLED = [FLAP, FLAP + 1, FLAP + 2, HARMONIC, HARMONIC + 1];

/**
 * Writes a rotor's steady flapping and inflow at a fixed speed, pitch and flow into `state` (rates zero), by Newton's
 * method from a momentum-theory start. Returns whether it converged.
 * @capability rotor-bemt settle a rotor's flapping and inflow for a steady flight condition
 */
export function settleRotor(design: RotorDesign, flow: RotorFlow, pitch: RotorPitch, speed: number, state: number[]): boolean {
  const loads = createRotorLoads(design);
  const stations = design.stations ?? 10;
  const free = design.flap === undefined ? [HARMONIC, HARMONIC + 1] : SETTLED;
  const indices = [...free, ...Array.from({ length: stations }, (_, j) => ANNULI + j)];
  const base = state.some((value) => value !== 0) ? [...state] : initialRotorState(design, flow, pitch, speed);
  for (let i = FLAP_RATE; i < FLAP_RATE + 3; i += 1) base[i] = 0;
  const build = (x: readonly number[]): number[] => {
    const trial = [...base];
    indices.forEach((index, i) => {
      trial[index] = x[i] ?? 0;
    });
    return trial;
  };
  const residual = (x: readonly number[]): number[] => {
    evaluateRotor(design, flow, pitch, speed, build(x), loads);
    return indices.map((index) => (index < FLAP_RATE ? (loads.rates[index + 3] ?? 0) / (speed * speed) : (loads.rates[index] ?? 0) / speed));
  };
  const result = solveNewton(
    residual,
    indices.map((index) => base[index] ?? 0),
    { tolerance: 1e-11 },
  );
  const solved = build(result.x);
  for (let i = 0; i < solved.length; i += 1) state[i] = solved[i] ?? 0;
  return result.norm < 1e-8;
}

/** A wind-tunnel operating point for an isolated rotor. */
export interface IsolatedRotorCondition {
  /** `V/(ΩR)`. */
  advanceRatio: number;
  /** Shaft angle, rad, positive tilted aft (the wind-tunnel convention). */
  shaftAngle: number;
  /** Thrust coefficient over solidity, `CT/σ`, along the shaft. */
  thrustOverSolidity: number;
  density?: number;
  speedOfSound?: number;
}

/** An isolated rotor trimmed to a thrust with its first-harmonic flapping (so its hub moment) zeroed. */
export interface IsolatedRotorTrim {
  collective: number;
  cosine: number;
  sine: number;
  coning: number;
  /** `CP/σ = P/(ρ·bcR·(ΩR)³)`, the form wind-tunnel reports tabulate. */
  powerOverSolidity: number;
  /** Shaft-axis propulsive (forward) force over solidity, `Fx/(ρ·bcR·(ΩR)²)`. */
  propulsiveOverSolidity: number;
  /** Figure of merit `CT^1.5/(√2·CP)`. */
  figureOfMerit: number;
  state: number[];
  converged: boolean;
}

/**
 * Trims an isolated rotor the way a wind tunnel does: at an advance ratio and shaft angle, solves collective and both
 * cyclics so the thrust matches and first-harmonic flapping vanishes, with flapping and inflow steady.
 * @capability rotor-bemt trim an isolated rotor to thrust with zero flapping and read its power
 */
export function trimIsolatedRotor(design: RotorDesign, condition: IsolatedRotorCondition): IsolatedRotorTrim {
  const density = condition.density ?? 1.225;
  const tip = design.speed * design.radius;
  const velocity = condition.advanceRatio * tip;
  const flow: RotorFlow = {
    u: velocity * Math.cos(condition.shaftAngle),
    v: 0,
    w: velocity * Math.sin(condition.shaftAngle),
    p: 0,
    q: 0,
    density,
    speedOfSound: condition.speedOfSound ?? 340.294,
    height: Number.POSITIVE_INFINITY,
  };
  const solidity = (design.blades * design.chord) / (Math.PI * design.radius);
  const target = condition.thrustOverSolidity * solidity;
  const stations = design.stations ?? 10;
  const loads = createRotorLoads(design);
  const state = new Array<number>(rotorStateCount(design)).fill(0);
  const pitchOf = (x: readonly number[]): RotorPitch => ({ collective: x[0] ?? 0, cosine: x[1] ?? 0, sine: x[2] ?? 0 });
  const fill = (x: readonly number[]): number[] => {
    state.fill(0);
    state[FLAP] = x[3] ?? 0;
    state[HARMONIC] = x[4] ?? 0;
    state[HARMONIC + 1] = x[5] ?? 0;
    for (let j = 0; j < stations; j += 1) state[ANNULI + j] = x[6 + j] ?? 0;
    return state;
  };
  const residual = (x: readonly number[]): number[] => {
    evaluateRotor(design, flow, pitchOf(x), design.speed, fill(x), loads);
    const speed2 = design.speed * design.speed;
    const r = [(loads.rates[3] ?? 0) / speed2, (loads.rates[4] ?? 0) / speed2, (loads.rates[5] ?? 0) / speed2, (loads.rates[HARMONIC] ?? 0) / design.speed, (loads.rates[HARMONIC + 1] ?? 0) / design.speed];
    for (let j = 0; j < stations; j += 1) r.push((loads.rates[ANNULI + j] ?? 0) / design.speed);
    r.push((loads.thrustCoefficient - target) * 10);
    return r;
  };
  const lambda = Math.sqrt(target / 2) / Math.sqrt(1 + (condition.advanceRatio / Math.sqrt(target / 2)) ** 2);
  const start = [(6 * target) / (solidity * 6 * 0.9) + 0.75 * lambda + 0.03, 0, 0, design.flap?.precone ?? 0, 0, 0, ...new Array<number>(stations).fill(lambda)];
  const result = solveNewton(residual, start, { iterations: 60, tolerance: 1e-12 });
  const x = result.x;
  evaluateRotor(design, flow, pitchOf(x), design.speed, fill(x), loads);
  const area = Math.PI * design.radius * design.radius * solidity;
  const power = loads.power / (density * area * tip ** 3);
  const ct = loads.thrustCoefficient;
  return {
    collective: x[0] ?? 0,
    cosine: x[1] ?? 0,
    sine: x[2] ?? 0,
    coning: x[3] ?? 0,
    powerOverSolidity: power,
    propulsiveOverSolidity: loads.force[0] / (density * area * tip * tip),
    figureOfMerit: ct > 0 ? ct ** 1.5 / (Math.SQRT2 * power * solidity) : 0,
    state: [...state],
    converged: result.norm < 1e-8,
  };
}
