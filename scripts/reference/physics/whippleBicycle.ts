import { polynomialRoots } from "./eigenvalues";
import { matrixEigenvalues, solveLinearSystem, type Eigenvalue } from "@jgengine/core/math/linearAlgebra";
import { createRigidBodyTree, type RigidBodyDefinition, type RigidBodyTree } from "./rigidBodyTree";
import { createRungeKutta4 } from "./rungeKutta";

/**
 * The 25 design parameters of the Whipple–Carvallo bicycle in the notation and axes of Meijaard, Papadopoulos,
 * Ruina & Schwab (2007), *Proc. R. Soc. A* 463:1955–1982, Table 1: SAE axes with the origin at the rear contact
 * in the upright, straight reference pose, x forward, y right, z down. Inertias are tensor elements about each
 * body's own centre of mass. SI units.
 */
export interface WhippleBicycleParameters {
  /** Wheelbase w, m. */
  wheelbase: number;
  /** Trail c, m. */
  trail: number;
  /** Steer-axis tilt λ from vertical, rad (π/2 − head angle). */
  steerAxisTilt: number;
  /** Gravity g, m/s². */
  gravity: number;
  rearWheel: { radius: number; mass: number; ixx: number; iyy: number };
  /** Rear frame and rider B: centre of mass `(x, z)` and inertia `Ixx, Iyy, Izz, Ixz`. */
  rearFrame: { x: number; z: number; mass: number; ixx: number; iyy: number; izz: number; ixz: number };
  /** Front frame (fork and handlebar) H. */
  frontFrame: { x: number; z: number; mass: number; ixx: number; iyy: number; izz: number; ixz: number };
  frontWheel: { radius: number; mass: number; ixx: number; iyy: number };
}

/**
 * The benchmark bicycle of Meijaard et al. (2007), Table 1 (exact values).
 */
export const BENCHMARK_BICYCLE: Readonly<WhippleBicycleParameters> = {
  wheelbase: 1.02,
  trail: 0.08,
  steerAxisTilt: Math.PI / 10,
  gravity: 9.81,
  rearWheel: { radius: 0.3, mass: 2, ixx: 0.0603, iyy: 0.12 },
  rearFrame: { x: 0.3, z: -0.9, mass: 85, ixx: 9.2, iyy: 11, izz: 2.8, ixz: 2.4 },
  frontFrame: { x: 0.9, z: -0.7, mass: 4, ixx: 0.05892, iyy: 0.06, izz: 0.00708, ixz: -0.00756 },
  frontWheel: { radius: 0.35, mass: 3, ixx: 0.1405, iyy: 0.28 },
};

/**
 * Meijaard et al. (2007), Table 2: the benchmark bicycle's published eigenvalues and characteristic speeds,
 * fourteen decimals.
 */
export const BENCHMARK_BICYCLE_EIGENVALUES = {
  /** Real eigenvalues at v = 0, ±λs1 and ±λs2. */
  standstill: [3.13164324790656, 5.53094371765393],
  /** Speed where the weave pair turns complex, and that double root. */
  doubleRootSpeed: 0.68428307889246,
  doubleRoot: 3.7829040512932,
  /** Weave speed (weave turns stable) and its eigenvalue there, `±i·3.43503384866144`. */
  weaveSpeed: 4.29238253634111,
  weaveFrequency: 3.43503384866144,
  /** Capsize speed (capsize turns unstable). */
  capsizeSpeed: 6.02426201538837,
  /** Weave pair `re ± i·im` at v = 1 … 10 m/s. */
  weave: [
    [3.5269617099007, 0.8077402751993],
    [2.68234517512745, 1.68066296590675],
    [1.70675605663975, 2.31582447384325],
    [0.41325331521125, 3.07910818603206],
    [-0.77534188219585, 4.46486771378823],
    [-1.52644486584142, 5.87673060598709],
    [-2.13875644258362, 7.19525913329805],
    [-2.69348683581097, 8.46037971396931],
    [-3.21675402252485, 9.69377351531791],
    [-3.72016840437287, 10.90681139476287],
  ],
  /** Real capsize and castering eigenvalues at v = 0 … 10 m/s. */
  capsize: [
    -3.13164324790656, -3.13423125066578, -3.07158645641514, -2.63366137253667, -1.42944427361326, -0.32286642900409, -0.0040669007697,
    0.10268170574766, 0.14327879765713, 0.15790184030917, 0.16105338653172,
  ],
  castering: [
    -5.53094371765393, -7.11008014637442, -8.67387984831735, -10.3510146724592, -12.15861426576447, -14.07838969279822, -16.08537123098026,
    -18.15788466125262, -20.27940894394569, -22.43788559040858, -24.62459635017404,
  ],
} as const;

/** The constant matrices of the linearised lean and steer equations `M·q̈ + v·C1·q̇ + (g·K0 + v²·K2)·q = f`, `q = [φ, δ]`, row-major 2×2. */
export interface WhippleLinearCoefficients {
  M: [number, number, number, number];
  C1: [number, number, number, number];
  K0: [number, number, number, number];
  K2: [number, number, number, number];
}

/**
 * The linearised Whipple bicycle about upright, straight running at any speed: Meijaard et al. (2007), Appendix A,
 * Eqs. (A1)–(A27). `q = [φ lean right, δ steer right]`; inputs `[Tφ, Tδ]`.
 * @capability whipple-linear linearised Whipple bicycle lean/steer equations (Meijaard 2007 benchmark coefficients)
 */
export function whippleLinearCoefficients(p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE): WhippleLinearCoefficients {
  const w = p.wheelbase;
  const c = p.trail;
  const lambda = p.steerAxisTilt;
  const { rearWheel: R, rearFrame: B, frontFrame: H, frontWheel: F } = p;
  const mT = R.mass + B.mass + H.mass + F.mass;
  const xT = (B.x * B.mass + H.x * H.mass + w * F.mass) / mT;
  const zT = (-R.radius * R.mass + B.z * B.mass + H.z * H.mass - F.radius * F.mass) / mT;
  const ITxx = R.ixx + B.ixx + H.ixx + F.ixx + R.mass * R.radius ** 2 + B.mass * B.z ** 2 + H.mass * H.z ** 2 + F.mass * F.radius ** 2;
  const ITxz = B.ixz + H.ixz - B.mass * B.x * B.z - H.mass * H.x * H.z + F.mass * w * F.radius;
  const IRzz = R.ixx;
  const IFzz = F.ixx;
  const ITzz = IRzz + B.izz + H.izz + IFzz + B.mass * B.x ** 2 + H.mass * H.x ** 2 + F.mass * w ** 2;
  const mA = H.mass + F.mass;
  const xA = (H.x * H.mass + w * F.mass) / mA;
  const zA = (H.z * H.mass - F.radius * F.mass) / mA;
  const IAxx = H.ixx + F.ixx + H.mass * (H.z - zA) ** 2 + F.mass * (F.radius + zA) ** 2;
  const IAxz = H.ixz - H.mass * (H.x - xA) * (H.z - zA) + F.mass * (w - xA) * (F.radius + zA);
  const IAzz = H.izz + IFzz + H.mass * (H.x - xA) ** 2 + F.mass * (w - xA) ** 2;
  const sl = Math.sin(lambda);
  const cl = Math.cos(lambda);
  const uA = (xA - w - c) * cl - zA * sl;
  const IAll = mA * uA ** 2 + IAxx * sl ** 2 + 2 * IAxz * sl * cl + IAzz * cl ** 2;
  const IAlx = -mA * uA * zA + IAxx * sl + IAxz * cl;
  const IAlz = mA * uA * xA + IAxz * sl + IAzz * cl;
  const mu = (c / w) * cl;
  const SR = R.iyy / R.radius;
  const SF = F.iyy / F.radius;
  const ST = SR + SF;
  const SA = mA * uA + mu * mT * xT;
  const Mpp = ITxx;
  const Mpd = IAlx + mu * ITxz;
  const Mdd = IAll + 2 * mu * IAlz + mu ** 2 * ITzz;
  const K0pp = mT * zT;
  const K0pd = -SA;
  const K0dd = -SA * sl;
  const K2pd = ((ST - mT * zT) / w) * cl;
  const K2dd = ((SA + SF * sl) / w) * cl;
  const C1pd = mu * ST + SF * cl + (ITxz / w) * cl - mu * mT * zT;
  const C1dp = -(mu * ST + SF * cl);
  const C1dd = (IAlz / w) * cl + mu * (SA + (ITzz / w) * cl);
  return {
    M: [Mpp, Mpd, Mpd, Mdd],
    C1: [0, C1pd, C1dp, C1dd],
    K0: [K0pp, K0pd, K0pd, K0dd],
    K2: [0, K2pd, 0, K2dd],
  };
}

/**
 * The four eigenvalues of the linearised bicycle at forward speed `v`: roots of the characteristic quartic
 * `det(M·λ² + v·C1·λ + g·K0 + v²·K2) = 0`, polished to double precision. Sorted by real part, descending.
 * @capability whipple-eigenvalues stability eigenvalues of the Whipple bicycle at any speed — weave, capsize, castering
 */
export function whippleEigenvalues(v: number, p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE): Eigenvalue[] {
  const { M, C1, K0, K2 } = whippleLinearCoefficients(p);
  const g = p.gravity;
  // Entry (i, j) of A(λ) = M λ² + v C1 λ + K as polynomial coefficients [λ⁰, λ¹, λ²].
  const entry = (k: number): [number, number, number] => [g * (K0[k] ?? 0) + v * v * (K2[k] ?? 0), v * (C1[k] ?? 0), M[k] ?? 0];
  const a = entry(0);
  const b = entry(1);
  const c = entry(2);
  const d = entry(3);
  const coefficients = [0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) coefficients[i + j] = (coefficients[i + j] ?? 0) + (a[i] ?? 0) * (d[j] ?? 0) - (b[i] ?? 0) * (c[j] ?? 0);
  return polynomialRoots(coefficients).sort((left, right) => right.re - left.re || right.im - left.im);
}

function bisect(f: (v: number) => number, low: number, high: number): number {
  let lo = low;
  let hi = high;
  const flo = f(lo);
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, hi); i++) {
    const mid = 0.5 * (lo + hi);
    if (Math.sign(f(mid)) === Math.sign(flo)) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * The bicycle's characteristic speeds (Meijaard et al. 2007, §6b): where the weave pair turns complex (`doubleRoot`),
 * where weave turns stable (`weave`) and where capsize turns unstable (`capsize`). Between `weave` and `capsize`
 * the uncontrolled bicycle is self-stable. Searches `0..maxSpeed` (default 10 m/s).
 * @capability whipple-self-stability weave and capsize speeds of a Whipple bicycle — its self-stable speed range
 */
export function whippleCriticalSpeeds(
  p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE,
  maxSpeed = 10,
): { doubleRoot: number; weave: number; capsize: number } {
  const oscillating = (v: number) => (whippleEigenvalues(v, p).some((e) => Math.abs(e.im) > 1e-9) ? 1 : -1);
  const weaveReal = (v: number) => Math.max(...whippleEigenvalues(v, p).filter((e) => Math.abs(e.im) > 1e-9).map((e) => e.re), -Infinity);
  const capsizeReal = (v: number) => Math.max(...whippleEigenvalues(v, p).filter((e) => Math.abs(e.im) <= 1e-9).map((e) => e.re));
  const step = 0.01;
  const scan = (f: (v: number) => number, from: number): number => {
    for (let v = from; v < maxSpeed; v += step) if (Math.sign(f(v)) !== Math.sign(f(v + step))) return bisect(f, v, v + step);
    return Number.NaN;
  };
  const doubleRoot = scan(oscillating, step);
  const weave = scan(weaveReal, doubleRoot + 1e-6);
  const capsize = scan(capsizeReal, weave);
  return { doubleRoot, weave, capsize };
}

/** One {@link WhippleBicycle} sample. ISO world axes (x forward at spawn, y left, z up). */
export interface WhippleBicycleState {
  /** Lean φ, rad, positive leaning right (the benchmark's sign). */
  lean: number;
  /** Steer δ, rad, positive steering right (the benchmark's sign). */
  steer: number;
  leanRate: number;
  steerRate: number;
  /** Rear-frame heading, rad, positive turning left. */
  heading: number;
  /** Rear-frame pitch, rad, nose down positive. */
  pitch: number;
  /** Rear contact point, m. */
  position: [number, number];
  /** Rear-wheel rolling speed `ω_R·r_R`, m/s. */
  speed: number;
  /** Kinetic plus gravitational potential energy, J. */
  energy: number;
}

/** Inputs to {@link WhippleBicycle.step}. */
export interface WhippleBicycleInput {
  /** Steer torque between rear frame and front frame, N·m, positive steering right. */
  steerTorque?: number;
  /** Driving torque on the rear wheel against the rear frame, N·m. */
  driveTorque?: number;
}

/** Serializable state of a {@link WhippleBicycle}: tree positions and velocities. */
export interface WhippleBicycleSnapshot {
  q: number[];
  u: number[];
}

/**
 * The nonlinear Whipple bicycle: four rigid bodies (rear wheel, rear frame with rider, front frame, front wheel)
 * with knife-edge wheels rolling without slip on flat ground.
 */
export interface WhippleBicycle {
  step(dt: number, input?: WhippleBicycleInput): WhippleBicycleState;
  state(): WhippleBicycleState;
  snapshot(): WhippleBicycleSnapshot;
  restore(snapshot: Readonly<WhippleBicycleSnapshot>): void;
  /** Back to the start pose and speed. */
  reset(): void;
}

/** Start conditions for {@link createWhippleBicycle}. */
export interface WhippleBicycleStart {
  /** Forward speed, m/s. */
  speed: number;
  /** Lean, steer (rad, benchmark signs) and their rates (rad/s). */
  lean?: number;
  steer?: number;
  leanRate?: number;
  steerRate?: number;
  /** Integration step, s (default `1/2000`). */
  step?: number;
}

interface WhippleModel {
  tree: RigidBodyTree;
  rearWheel: number;
  frame: number;
  fork: number;
  frontWheel: number;
  radiusR: number;
  radiusF: number;
  gravity: number;
  steerAxis: [number, number, number];
}

const BODY_REAR_WHEEL = 1;
const BODY_FORK = 2;
const BODY_FRONT_WHEEL = 3;

function buildModel(p: Readonly<WhippleBicycleParameters>): WhippleModel {
  const rR = p.rearWheel.radius;
  const rF = p.frontWheel.radius;
  // SAE (x fwd, y right, z down) → ISO (x fwd, y left, z up): points (x, −y, −z); inertia products Ixz → −Ixz.
  const sl = Math.sin(p.steerAxisTilt);
  const cl = Math.cos(p.steerAxisTilt);
  const steerAxis: [number, number, number] = [-sl, 0, cl];
  // The steer axis meets the ground at x = w + c; the fork joint sits where it passes the front-wheel centre height.
  const xHeadAtWheel = p.wheelbase + p.trail - rF * Math.tan(p.steerAxisTilt);
  const bodies: RigidBodyDefinition[] = [
    {
      name: "rear frame",
      parent: -1,
      joint: { kind: "free" },
      origin: [0, 0, rR],
      mass: p.rearFrame.mass,
      com: [p.rearFrame.x, 0, -p.rearFrame.z],
      inertia: [p.rearFrame.ixx, p.rearFrame.iyy, p.rearFrame.izz, 0, -p.rearFrame.ixz, 0],
    },
    {
      name: "rear wheel",
      parent: 0,
      joint: { kind: "revolute", axis: [0, 1, 0] },
      origin: [0, 0, rR],
      mass: p.rearWheel.mass,
      com: [0, 0, rR],
      inertia: [p.rearWheel.ixx, p.rearWheel.iyy, p.rearWheel.ixx, 0, 0, 0],
    },
    {
      name: "front frame",
      parent: 0,
      joint: { kind: "revolute", axis: steerAxis },
      origin: [xHeadAtWheel, 0, rF],
      mass: p.frontFrame.mass,
      com: [p.frontFrame.x, 0, -p.frontFrame.z],
      inertia: [p.frontFrame.ixx, p.frontFrame.iyy, p.frontFrame.izz, 0, -p.frontFrame.ixz, 0],
    },
    {
      name: "front wheel",
      parent: 2,
      joint: { kind: "revolute", axis: [0, 1, 0] },
      origin: [p.wheelbase, 0, rF],
      mass: p.frontWheel.mass,
      com: [p.wheelbase, 0, rF],
      inertia: [p.frontWheel.ixx, p.frontWheel.iyy, p.frontWheel.ixx, 0, 0, 0],
    },
  ];
  return {
    tree: createRigidBodyTree(bodies),
    rearWheel: BODY_REAR_WHEEL,
    frame: 0,
    fork: BODY_FORK,
    frontWheel: BODY_FRONT_WHEEL,
    radiusR: rR,
    radiusF: rF,
    gravity: p.gravity,
    steerAxis,
  };
}

/** Contact point of a knife-edge wheel: from the centre, one radius along the in-plane direction pointing most downward. */
function contactPoint(tree: RigidBodyTree, wheel: number, radius: number, out: Float64Array): Float64Array {
  const R = tree.rotation(wheel);
  const c = tree.origin(wheel);
  const ax = R[1] ?? 0;
  const ay = R[4] ?? 0;
  const az = R[7] ?? 0;
  // d = −(ẑ − (ẑ·a)a)/|…|
  let dx = az * ax;
  let dy = az * ay;
  let dz = az * az - 1;
  const n = Math.hypot(dx, dy, dz) || 1;
  dx /= n;
  dy /= n;
  dz /= n;
  out[0] = (c[0] ?? 0) + radius * dx;
  out[1] = (c[1] ?? 0) + radius * dy;
  out[2] = (c[2] ?? 0) + radius * dz;
  return out;
}

/** Quaternion `[w, x, y, z]` of `Rz(ψ)·Rx(φ)·Ry(θ)`. */
function eulerQuaternion(yaw: number, roll: number, pitch: number): [number, number, number, number] {
  const cz = Math.cos(yaw / 2);
  const sz = Math.sin(yaw / 2);
  const cx = Math.cos(roll / 2);
  const sx = Math.sin(roll / 2);
  const cy = Math.cos(pitch / 2);
  const sy = Math.sin(pitch / 2);
  // (cz + sz k)(cx + sx i) = [cz cx, cz sx, sz sx, sz cx]; then ⊗ (cy + sy j)
  const w1 = cz * cx;
  const x1 = cz * sx;
  const y1 = sz * sx;
  const z1 = sz * cx;
  return [w1 * cy - y1 * sy, x1 * cy - z1 * sy, w1 * sy + y1 * cy, z1 * cy + x1 * sy];
}

/** Yaw, roll, pitch of a rotation `Rz(ψ)·Rx(φ)·Ry(θ)` (row-major). */
function eulerOf(R: ArrayLike<number>): { yaw: number; roll: number; pitch: number } {
  // R = Rz Rx Ry: R[7] = sin φ, R[6] = −cos φ sin θ, R[8] = cos φ cos θ, R[1] = −sin ψ cos φ, R[4] = cos ψ cos φ.
  const roll = Math.asin(Math.max(-1, Math.min(1, R[7] ?? 0)));
  const pitch = Math.atan2(-(R[6] ?? 0), R[8] ?? 1);
  const yaw = Math.atan2(-(R[1] ?? 0), R[4] ?? 1);
  return { yaw, roll, pitch };
}

/**
 * Rolling-constraint rows of one wheel into `A` (3 × dofs at `row`) and their velocity-product term into `bias`.
 * The contact is a geometric point sliding round the rim, so `d/dt(A·u) = A·u̇ + a_mat + ω × (Ṗ − v_mat)`, where
 * `a_mat` is the material point's acceleration at `u̇ = 0` and `Ṗ` the contact point's own velocity.
 */
function wheelConstraint(tree: RigidBodyTree, wheel: number, radius: number, A: Float64Array, bias: Float64Array, row: number): void {
  const n = tree.dofs;
  const point = new Float64Array(3);
  const jac = new Float64Array(3 * n);
  const b = new Float64Array(3);
  contactPoint(tree, wheel, radius, point);
  tree.pointJacobian(wheel, point, jac, b);
  A.set(jac, row * n);
  const w = tree.angularVelocity(wheel, new Float64Array(3));
  const center = tree.origin(wheel);
  const vCenter = tree.pointVelocity(wheel, center, new Float64Array(3));
  const vMaterial = tree.pointVelocity(wheel, point, new Float64Array(3));
  const R = tree.rotation(wheel);
  const a = [R[1] ?? 0, R[4] ?? 0, R[7] ?? 0];
  // ȧ = ω × a ; d = (s·a − ẑ)/N with s = a_z, N = √(1 − s²)
  const da = [(w[1] ?? 0) * (a[2] ?? 0) - (w[2] ?? 0) * (a[1] ?? 0), (w[2] ?? 0) * (a[0] ?? 0) - (w[0] ?? 0) * (a[2] ?? 0), (w[0] ?? 0) * (a[1] ?? 0) - (w[1] ?? 0) * (a[0] ?? 0)];
  const s = a[2] ?? 0;
  const ds = da[2] ?? 0;
  const N = Math.sqrt(Math.max(1e-12, 1 - s * s));
  const base = [s * (a[0] ?? 0), s * (a[1] ?? 0), s * (a[2] ?? 0) - 1];
  const pDot = [0, 1, 2].map((k) => (vCenter[k] ?? 0) + radius * ((ds * (a[k] ?? 0) + s * (da[k] ?? 0)) / N + ((base[k] ?? 0) * s * ds) / (N * N * N)));
  const rel = [0, 1, 2].map((k) => (pDot[k] ?? 0) - (vMaterial[k] ?? 0));
  bias[row] = (b[0] ?? 0) + (w[1] ?? 0) * (rel[2] ?? 0) - (w[2] ?? 0) * (rel[1] ?? 0);
  bias[row + 1] = (b[1] ?? 0) + (w[2] ?? 0) * (rel[0] ?? 0) - (w[0] ?? 0) * (rel[2] ?? 0);
  bias[row + 2] = (b[2] ?? 0) + (w[0] ?? 0) * (rel[1] ?? 0) - (w[1] ?? 0) * (rel[0] ?? 0);
}

/** Constraint rows (6 × dofs) and velocity-product terms (6) of the two rolling contacts. */
function contactConstraints(model: WhippleModel, A: Float64Array, bias: Float64Array): void {
  wheelConstraint(model.tree, model.rearWheel, model.radiusR, A, bias, 0);
  wheelConstraint(model.tree, model.frontWheel, model.radiusF, A, bias, 3);
}

/** Generalized accelerations of the constrained bicycle: the KKT system `[H Aᵀ; A 0][u̇; −λ] = [τ − C; −Ȧu]`. */
function constrainedAccelerations(model: WhippleModel, input: WhippleBicycleInput, out: Float64Array, stabilize: { position: Float64Array; velocity: Float64Array } | undefined): void {
  const { tree } = model;
  const n = tree.dofs;
  const m = 6;
  const size = n + m;
  tree.clearForces([0, 0, -model.gravity]);
  // Steer torque positive right = rotation about the downward steer axis = negative about our upward axis.
  tree.applyGeneralized(tree.dofOf(model.fork), -(input.steerTorque ?? 0));
  tree.applyGeneralized(tree.dofOf(model.rearWheel), input.driveTorque ?? 0);
  const H = new Float64Array(n * n);
  tree.massMatrix(H);
  const rhs = new Float64Array(n);
  tree.forcing(rhs);
  const A = new Float64Array(m * n);
  const bias = new Float64Array(m);
  contactConstraints(model, A, bias);
  const K = new Float64Array(size * size);
  const b = new Float64Array(size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) K[i * size + j] = H[i * n + j] ?? 0;
    b[i] = rhs[i] ?? 0;
  }
  for (let r = 0; r < m; r++) {
    for (let j = 0; j < n; j++) {
      const value = A[r * n + j] ?? 0;
      K[(n + r) * size + j] = value;
      K[j * size + n + r] = value;
    }
    // Baumgarte stabilisation of the velocity and (vertical) position constraints.
    const drift = stabilize === undefined ? 0 : 40 * (stabilize.velocity[r] ?? 0) + 400 * (stabilize.position[r] ?? 0);
    b[n + r] = -(bias[r] ?? 0) - drift;
  }
  solveLinearSystem(K, b, size);
  for (let i = 0; i < n; i++) out[i] = b[i] ?? 0;
}

interface ReducedState {
  lean: number;
  steer: number;
  leanRate: number;
  steerRate: number;
  speed: number;
}

/** Positions and velocities consistent with the rolling constraints for a lean, steer, their rates and a rear-wheel speed. */
function consistentState(model: WhippleModel, s: ReducedState, yaw = 0): { q: Float64Array; u: Float64Array } {
  const { tree } = model;
  const q = new Float64Array(tree.positions);
  const u = new Float64Array(tree.dofs);
  const steerIso = -s.steer;
  const point = new Float64Array(3);
  const place = (pitch: number) => {
    const quat = eulerQuaternion(yaw, s.lean, pitch);
    q.fill(0);
    q[3] = quat[0];
    q[4] = quat[1];
    q[5] = quat[2];
    q[6] = quat[3];
    q[tree.coordinateOf(model.fork)] = steerIso;
    tree.update(q, u);
    // Put the rear contact on the ground at the origin.
    contactPoint(tree, model.rearWheel, model.radiusR, point);
    q[0] = -(point[0] ?? 0);
    q[1] = -(point[1] ?? 0);
    q[2] = -(point[2] ?? 0);
    tree.update(q, u);
    contactPoint(tree, model.frontWheel, model.radiusF, point);
    return point[2] ?? 0;
  };
  // Newton on the pitch for the front contact height.
  let pitch = 0;
  for (let i = 0; i < 50; i++) {
    const f = place(pitch);
    const h = 1e-7;
    const df = (place(pitch + h) - place(pitch - h)) / (2 * h);
    const stepSize = f / df;
    pitch -= stepSize;
    if (Math.abs(stepSize) < 1e-15) break;
  }
  place(pitch);
  // Independent speeds: lean rate, steer rate, rear-wheel spin. Unknowns: yaw rate, pitch rate, root linear velocity
  // (3, body axes) and front-wheel spin, from the six rolling constraints.
  const R = tree.rotation(0);
  const cz = Math.cos(yaw);
  const sz = Math.sin(yaw);
  const e1 = [cz, sz, 0];
  const cr = Math.cos(s.lean);
  const sr = Math.sin(s.lean);
  // e2 = Rz Rx ŷ = Rz [0, cos φ, sin φ]
  const e2 = [-sz * cr, cz * cr, sr];
  const toBody = (w: readonly number[]) => [0, 1, 2].map((k) => (R[k] ?? 0) * (w[0] ?? 0) + (R[3 + k] ?? 0) * (w[1] ?? 0) + (R[6 + k] ?? 0) * (w[2] ?? 0));
  const base = new Float64Array(tree.dofs);
  const lean = toBody(e1).map((x) => x * s.leanRate);
  for (let k = 0; k < 3; k++) base[k] = lean[k] ?? 0;
  base[tree.dofOf(model.fork)] = -s.steerRate;
  base[tree.dofOf(model.rearWheel)] = s.speed / model.radiusR;
  const unknownColumns: Float64Array[] = [];
  const yawCol = new Float64Array(tree.dofs);
  toBody([0, 0, 1]).forEach((x, k) => (yawCol[k] = x));
  const pitchCol = new Float64Array(tree.dofs);
  toBody(e2).forEach((x, k) => (pitchCol[k] = x));
  unknownColumns.push(yawCol, pitchCol);
  for (let k = 0; k < 3; k++) {
    const col = new Float64Array(tree.dofs);
    col[3 + k] = 1;
    unknownColumns.push(col);
  }
  const front = new Float64Array(tree.dofs);
  front[tree.dofOf(model.frontWheel)] = 1;
  unknownColumns.push(front);
  tree.update(q, base);
  const A = new Float64Array(6 * tree.dofs);
  const bias = new Float64Array(6);
  contactConstraints(model, A, bias);
  const n = tree.dofs;
  const K = new Float64Array(36);
  const b = new Float64Array(6);
  for (let r = 0; r < 6; r++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += (A[r * n + j] ?? 0) * (base[j] ?? 0);
    b[r] = -sum;
    for (let c = 0; c < 6; c++) {
      let value = 0;
      const col = unknownColumns[c];
      for (let j = 0; j < n; j++) value += (A[r * n + j] ?? 0) * (col?.[j] ?? 0);
      K[r * 6 + c] = value;
    }
  }
  solveLinearSystem(K, b, 6);
  for (let j = 0; j < n; j++) {
    let value = base[j] ?? 0;
    for (let c = 0; c < 6; c++) value += (b[c] ?? 0) * (unknownColumns[c]?.[j] ?? 0);
    u[j] = value;
  }
  tree.update(q, u);
  return { q, u };
}

/** Lean and steer accelerations (benchmark signs) of the nonlinear model in a consistent state. */
function leanSteerAccelerations(model: WhippleModel, q: Float64Array, u: Float64Array, input: WhippleBicycleInput): [number, number] {
  const { tree } = model;
  tree.update(q, u);
  const ud = new Float64Array(tree.dofs);
  constrainedAccelerations(model, input, ud, undefined);
  const R = tree.rotation(0);
  const { yaw, roll } = eulerOf(R);
  // ω̇_world = R ω̇_body; ω_world = ψ̇ ẑ + φ̇ e1 + θ̇ e2.
  const wb = [u[0] ?? 0, u[1] ?? 0, u[2] ?? 0];
  const ww = [0, 1, 2].map((k) => (R[3 * k] ?? 0) * (wb[0] ?? 0) + (R[3 * k + 1] ?? 0) * (wb[1] ?? 0) + (R[3 * k + 2] ?? 0) * (wb[2] ?? 0));
  const ad = [0, 1, 2].map((k) => (R[3 * k] ?? 0) * (ud[0] ?? 0) + (R[3 * k + 1] ?? 0) * (ud[1] ?? 0) + (R[3 * k + 2] ?? 0) * (ud[2] ?? 0));
  const cz = Math.cos(yaw);
  const sz = Math.sin(yaw);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const e0 = [0, 0, 1];
  const e1 = [cz, sz, 0];
  const e2 = [-sz * cr, cz * cr, sr];
  const basis = new Float64Array(9);
  for (let k = 0; k < 3; k++) {
    basis[3 * k] = e0[k] ?? 0;
    basis[3 * k + 1] = e1[k] ?? 0;
    basis[3 * k + 2] = e2[k] ?? 0;
  }
  const rates = Float64Array.from(ww);
  solveLinearSystem(Float64Array.from(basis), rates, 3);
  const yawRate = rates[0] ?? 0;
  const leanRate = rates[1] ?? 0;
  const pitchRate = rates[2] ?? 0;
  // ė1 = ψ̇ ẑ × e1 ; ė2 = (ψ̇ ẑ + φ̇ e1) × e2
  const de1 = [-yawRate * (e1[1] ?? 0), yawRate * (e1[0] ?? 0), 0];
  const spin = [leanRate * (e1[0] ?? 0), leanRate * (e1[1] ?? 0), yawRate];
  const de2 = [
    (spin[1] ?? 0) * (e2[2] ?? 0) - (spin[2] ?? 0) * (e2[1] ?? 0),
    (spin[2] ?? 0) * (e2[0] ?? 0) - (spin[0] ?? 0) * (e2[2] ?? 0),
    (spin[0] ?? 0) * (e2[1] ?? 0) - (spin[1] ?? 0) * (e2[0] ?? 0),
  ];
  const rhs = Float64Array.from([0, 1, 2], (k) => (ad[k] ?? 0) - leanRate * (de1[k] ?? 0) - pitchRate * (de2[k] ?? 0));
  solveLinearSystem(Float64Array.from(basis), rhs, 3);
  return [rhs[1] ?? 0, -(ud[tree.dofOf(model.fork)] ?? 0)];
}

/**
 * Numerically linearise the nonlinear Whipple bicycle about upright straight running at speed `v`: central
 * differences of the lean and steer accelerations over constraint-consistent states. Returns the 4×4 state matrix
 * for `[φ, δ, φ̇, δ̇]` (row-major); its eigenvalues should equal {@link whippleEigenvalues}.
 * @capability whipple-nonlinear-linearisation linearise the full nonlinear bicycle multibody model to check it against the benchmark
 */
export function linearizeWhippleBicycle(v: number, p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE, h = 1e-6): Float64Array {
  const model = buildModel(p);
  const A = new Float64Array(16);
  A[2] = 1;
  A[7] = 1;
  const keys: (keyof ReducedState)[] = ["lean", "steer", "leanRate", "steerRate"];
  keys.forEach((key, column) => {
    const at = (delta: number) => {
      const s: ReducedState = { lean: 0, steer: 0, leanRate: 0, steerRate: 0, speed: v };
      s[key] = delta;
      const { q, u } = consistentState(model, s);
      return leanSteerAccelerations(model, q, u, {});
    };
    const plus = at(h);
    const minus = at(-h);
    A[8 + column] = ((plus[0] ?? 0) - (minus[0] ?? 0)) / (2 * h);
    A[12 + column] = ((plus[1] ?? 0) - (minus[1] ?? 0)) / (2 * h);
  });
  return A;
}

/**
 * Eigenvalues of {@link linearizeWhippleBicycle}: the nonlinear bicycle's own stability modes at speed `v`.
 * @capability whipple-nonlinear-linearisation weave, capsize and castering eigenvalues of the nonlinear multibody bicycle
 */
export function nonlinearWhippleEigenvalues(v: number, p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE): Eigenvalue[] {
  return matrixEigenvalues(linearizeWhippleBicycle(v, p), 4);
}

/**
 * Creates the nonlinear Whipple–Carvallo bicycle (Meijaard et al. 2007 §2–4, without the linearisation): rear frame
 * with rider, front frame on the steer axis and two knife-edge wheels, each wheel rolling without slip at its
 * lowest point on flat ground. Exact rigid-body dynamics on a {@link createRigidBodyTree} with the six contact
 * constraints solved as a KKT system each evaluation (Baumgarte-stabilised, then projected back onto the
 * constraint manifold after every RK4 step), so lean, steer, gyroscopic and trail effects are all nonlinear.
 * @capability whipple-bicycle nonlinear Whipple bicycle simulation — self-stability, countersteer and capsize from rigid-body physics
 */
export function createWhippleBicycle(start: WhippleBicycleStart, p: Readonly<WhippleBicycleParameters> = BENCHMARK_BICYCLE): WhippleBicycle {
  const model = buildModel(p);
  const { tree } = model;
  const nq = tree.positions;
  const nu = tree.dofs;
  const size = nq + nu;
  const h = start.step ?? 1 / 2000;
  const initial = consistentState(model, {
    lean: start.lean ?? 0,
    steer: start.steer ?? 0,
    leanRate: start.leanRate ?? 0,
    steerRate: start.steerRate ?? 0,
    speed: start.speed,
  });
  const x = new Float64Array(size);
  const reset = () => {
    x.set(initial.q, 0);
    x.set(initial.u, nq);
  };
  reset();
  const integrator = createRungeKutta4(size);
  const ud = new Float64Array(nu);
  const A = new Float64Array(6 * nu);
  const bias = new Float64Array(6);
  const point = new Float64Array(3);
  const stab = { position: new Float64Array(6), velocity: new Float64Array(6) };
  let input: WhippleBicycleInput = {};

  const evaluateConstraints = (q: Float64Array, u: Float64Array) => {
    tree.update(q, u);
    contactConstraints(model, A, bias);
    for (let r = 0; r < 6; r++) {
      let sum = 0;
      for (let j = 0; j < nu; j++) sum += (A[r * nu + j] ?? 0) * (u[j] ?? 0);
      stab.velocity[r] = sum;
    }
    stab.position.fill(0);
    contactPoint(tree, model.rearWheel, model.radiusR, point);
    stab.position[2] = point[2] ?? 0;
    contactPoint(tree, model.frontWheel, model.radiusF, point);
    stab.position[5] = point[2] ?? 0;
  };

  const derivative = (state: Float64Array, out: Float64Array) => {
    const q = state.subarray(0, nq);
    const u = state.subarray(nq, size);
    evaluateConstraints(q, u);
    constrainedAccelerations(model, input, ud, stab);
    tree.positionRates(q, u, out, 0);
    out.set(ud, nq);
  };

  /** Pull positions back onto the contact heights and velocities onto the rolling constraints (mass-weighted). */
  const project = () => {
    const q = x.subarray(0, nq);
    const u = x.subarray(nq, size);
    for (let iteration = 0; iteration < 2; iteration++) {
      evaluateConstraints(q, u);
      // Height rows 2 and 5: least-norm correction in velocity coordinates, applied as a small displacement.
      const rows = [2, 5];
      const J = rows.map((r) => A.subarray(r * nu, (r + 1) * nu));
      const g = [stab.position[2] ?? 0, stab.position[5] ?? 0];
      const JJ = new Float64Array(4);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          let sum = 0;
          for (let k = 0; k < nu; k++) sum += (J[i]?.[k] ?? 0) * (J[j]?.[k] ?? 0);
          JJ[i * 2 + j] = sum;
        }
      }
      const lambda = Float64Array.from(g);
      solveLinearSystem(JJ, lambda, 2);
      const dq = new Float64Array(nu);
      for (let k = 0; k < nu; k++) dq[k] = -((J[0]?.[k] ?? 0) * (lambda[0] ?? 0) + (J[1]?.[k] ?? 0) * (lambda[1] ?? 0));
      const rates = new Float64Array(nq);
      tree.positionRates(q, dq, rates, 0);
      for (let k = 0; k < nq; k++) q[k] = (q[k] ?? 0) + (rates[k] ?? 0);
      const norm = Math.hypot(q[3] ?? 1, q[4] ?? 0, q[5] ?? 0, q[6] ?? 0) || 1;
      for (let k = 3; k < 7; k++) q[k] = (q[k] ?? 0) / norm;
    }
    evaluateConstraints(q, u);
    const H = new Float64Array(nu * nu);
    tree.massMatrix(H);
    // u ← u − H⁻¹Aᵀ(A H⁻¹ Aᵀ)⁻¹ A u
    const HiAt = new Float64Array(nu * 6);
    for (let r = 0; r < 6; r++) {
      const column = A.slice(r * nu, (r + 1) * nu);
      solveLinearSystem(Float64Array.from(H), column, nu);
      for (let k = 0; k < nu; k++) HiAt[k * 6 + r] = column[k] ?? 0;
    }
    const S = new Float64Array(36);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      let sum = 0;
      for (let k = 0; k < nu; k++) sum += (A[i * nu + k] ?? 0) * (HiAt[k * 6 + j] ?? 0);
      S[i * 6 + j] = sum;
    }
    const y = Float64Array.from(stab.velocity);
    solveLinearSystem(S, y, 6);
    for (let k = 0; k < nu; k++) {
      let sum = 0;
      for (let r = 0; r < 6; r++) sum += (HiAt[k * 6 + r] ?? 0) * (y[r] ?? 0);
      u[k] = (u[k] ?? 0) - sum;
    }
  };

  const read = (): WhippleBicycleState => {
    const q = x.subarray(0, nq);
    const u = x.subarray(nq, size);
    tree.update(q, u);
    const { yaw, roll, pitch } = eulerOf(tree.rotation(0));
    const R = tree.rotation(0);
    const ww = [0, 1, 2].map((k) => (R[3 * k] ?? 0) * (u[0] ?? 0) + (R[3 * k + 1] ?? 0) * (u[1] ?? 0) + (R[3 * k + 2] ?? 0) * (u[2] ?? 0));
    const cz = Math.cos(yaw);
    const sz = Math.sin(yaw);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const basis = Float64Array.from([0, cz, -sz * cr, 0, sz, cz * cr, 1, 0, sr]);
    const rates = Float64Array.from(ww);
    solveLinearSystem(basis, rates, 3);
    contactPoint(tree, model.rearWheel, model.radiusR, point);
    let potential = 0;
    for (let i = 0; i < tree.bodies.length; i++) {
      const body = tree.bodies[i];
      if (body === undefined) continue;
      const Ri = tree.rotation(i);
      const o = tree.origin(i);
      const lz = (body.com[2] ?? 0) - (body.origin[2] ?? 0);
      const lx = (body.com[0] ?? 0) - (body.origin[0] ?? 0);
      const ly = (body.com[1] ?? 0) - (body.origin[1] ?? 0);
      const z = (o[2] ?? 0) + (Ri[6] ?? 0) * lx + (Ri[7] ?? 0) * ly + (Ri[8] ?? 0) * lz;
      potential += body.mass * model.gravity * z;
    }
    return {
      lean: roll,
      steer: -(q[tree.coordinateOf(model.fork)] ?? 0),
      leanRate: rates[1] ?? 0,
      steerRate: -(u[tree.dofOf(model.fork)] ?? 0),
      heading: yaw,
      pitch,
      position: [point[0] ?? 0, point[1] ?? 0],
      speed: ((u[tree.dofOf(model.rearWheel)] ?? 0) + (u[1] ?? 0)) * model.radiusR,
      energy: tree.kineticEnergy() + potential,
    };
  };

  return {
    step(dt, next = {}) {
      input = next;
      const steps = Math.max(1, Math.round(dt / h));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) {
        integrator.step(x, sub, derivative);
        project();
      }
      return read();
    },
    state: read,
    snapshot: () => ({ q: Array.from(x.subarray(0, nq)), u: Array.from(x.subarray(nq, size)) }),
    restore(snapshot) {
      x.set(snapshot.q, 0);
      x.set(snapshot.u, nq);
    },
    reset,
  };
}
