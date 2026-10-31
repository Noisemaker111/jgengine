import { matrixEigenvalues, type Eigenvalue } from "@jgengine/core/math/linearAlgebra";
import { motorcycleMagicFormula, type MotorcycleTireCoefficients } from "./motorcycleTire";
import { createRigidBodyTree, type RigidBodyDefinition, type RigidBodyTree } from "./rigidBodyTree";
import { createRungeKutta4 } from "./rungeKutta";

/** A side-view point `[x, z]` as tabulated by Sharp et al.: x forward from the rear contact, z down (negative above ground), m. */
export type SidePoint = readonly [number, number];

/** A rigid body of the motorcycle: mass, centre and inertia tensor about the centre (SAE axes, z down, tensor elements), kg·m². */
export interface MotorcycleBody {
  mass: number;
  com: SidePoint;
  ixx: number;
  iyy: number;
  izz: number;
  ixz: number;
  /** `"steer"` when the axes are along and across the steer axis (z along it) instead of the ground axes. */
  axes?: "ground" | "steer";
}

/** A wheel and its tyre. */
export interface MotorcycleWheel {
  mass: number;
  /** Wheel centre in the reference pose (static, nominal load). */
  center: SidePoint;
  /** Diametral and spin inertia, kg·m². */
  ixx: number;
  iyy: number;
  tire: Readonly<MotorcycleTireCoefficients>;
  /** Radius of the tread's circular cross-section used for the contact geometry, m. */
  crownRadius: number;
  /** Radial tyre stiffness, N/m. */
  radialStiffness: number;
  /** Longitudinal relaxation length, m (not published for these tyres; default `0.1`). */
  longitudinalRelaxation?: number;
}

/** Monoshock rear suspension: a rocker on the frame, a pull rod to the swing arm and the spring-damper unit. */
export interface MotorcycleRearLinkage {
  /** Shock top on the frame (p13), rocker pivot on the frame (p19), rocker to pull rod (p20), rocker to shock (p21), pull rod to swing arm (p22). */
  shockTop: SidePoint;
  rockerPivot: SidePoint;
  rockerToRod: SidePoint;
  rockerToShock: SidePoint;
  rodToSwingArm: SidePoint;
  /** Spring free length, m. */
  freeLength: number;
  /** Spring plus gas rate, N/m, and damping, N·s/m, at the unit. */
  stiffness: number;
  damping: number;
  /** Unit length at the bump and rebound stops, m, and their fifth-power stop coefficients, N/m⁵. */
  minLength: number;
  maxLength: number;
  bumpStop: number;
  reboundStop: number;
}

/** Engine, primary drive, gearbox and chain. */
export interface MotorcyclePowertrain {
  /** Wide-open-throttle crank torque `[rpm, N·m]`, rising rpm. */
  torqueCurve: readonly (readonly [number, number])[];
  idleRpm: number;
  redlineRpm: number;
  /** Crank, clutch and primary inertia at the crank, kg·m². */
  inertia: number;
  primary: number;
  ratios: readonly number[];
  finalDrive: number;
  /** Primary, gearbox and chain efficiency (default `0.9`). */
  efficiency?: number;
  /** Clutch-in, throttle-off seconds per upshift (default `0.15`). */
  shiftSeconds?: number;
  upshiftRpm?: number;
  /** Rpm the rider holds while slipping the clutch (default 70% of redline), until the wheel side reaches half of it; the clutch's own engagement takes `clutchSeconds` (default `0.5`). */
  launchRpm?: number;
  clutchSeconds?: number;
  /** Clutch capacity, N·m at the crank (default 1.6 × peak torque). */
  clutchTorque?: number;
}

/**
 * A real motorcycle as a multibody model in the form of Sharp, Evangelou & Limebeer (2004): main frame with the
 * rider's lower body, rider upper body on a roll joint, frame torsional flexibility at the steering head (twist
 * axis normal to the steer axis), steering body, telescopic front suspension, swing arm with a monoshock linkage,
 * two wheels with thick (toroidal) tyres. Points and inertias are as tabulated (SAE side view, z down).
 */
export interface ReferenceMotorcycleSpec {
  /** Steer-axis rake from vertical, rad (ε). */
  rake: number;
  /** Point on the steer axis (the steering-head joint, p3). */
  steerAxisPoint: SidePoint;
  /** Frame twist axis point (elastic centre, p2); the axis is normal to the steer axis in the plane of symmetry. */
  twistAxisPoint: SidePoint;
  /** Point on the line of the front fork's travel (p4). */
  forkSlidePoint: SidePoint;
  swingArmPivot: SidePoint;
  /** The rider's upper-body roll joint (p9), an axis along x. */
  riderLeanPivot: SidePoint;
  /** Where aerodynamic forces act (p1). */
  aeroPoint: SidePoint;
  mainFrame: MotorcycleBody;
  riderUpperBody: MotorcycleBody;
  steering: MotorcycleBody;
  lowerFork: Omit<MotorcycleBody, "ixx" | "iyy" | "izz" | "ixz"> & Partial<Pick<MotorcycleBody, "ixx" | "iyy" | "izz" | "ixz">>;
  swingArm: MotorcycleBody;
  front: MotorcycleWheel;
  rear: MotorcycleWheel;
  frontSuspension: { stiffness: number; damping: number; extension: number; compression: number; stopStiffness: number };
  rearSuspension: MotorcycleRearLinkage;
  /** Steering damper, N·m·s/rad; steering stiffness, N·m/rad; lock, rad; fifth-power lock-stop coefficient. */
  steeringSystem: { damping: number; stiffness: number; lock: number; stopStiffness: number };
  /** Frame torsion at the steering head, N·m/rad and N·m·s/rad. */
  frameTwist: { stiffness: number; damping: number };
  /** Rider upper-body roll restraint, N·m/rad and N·m·s/rad. */
  riderLean: { stiffness: number; damping: number };
  /** Drag, lift and pitching-moment coefficients on `area`; the moment's reference length is the wheelbase. */
  aero: { drag: number; lift: number; pitch: number; area: number; density: number };
  powertrain: MotorcyclePowertrain;
  /** Brake torque capacity, N·m. */
  brakes: { front: number; rear: number };
  /** Extra mass carried by the main frame (fuel, fluids) at a point, for a test configuration. */
  payload?: { mass: number; position: SidePoint };
  /** Integration step, s (default `1/2000`). */
  step?: number;
}

/** Controls for one {@link ReferenceMotorcycle.step}. */
export interface MotorcycleControls {
  /** Steering torque from the rider's hands, N·m, positive steering right. */
  steerTorque?: number;
  /** Rider upper-body lean torque, N·m, positive leaning the body right. */
  riderLeanTorque?: number;
  /** Throttle `0..1`; the rider launches on the clutch, shifts up and keeps the front wheel down and the rear from spinning. */
  throttle?: number;
  /** Brake `0..1`; the rider brakes at the tyre's slip limit and keeps the rear wheel down. */
  brake?: number;
  /** A torque applied straight to the rear wheel, N·m, in place of the engine (Sharp et al.'s speed controller). */
  driveTorque?: number;
  /** Below 4 m/s the rider's feet hold the bike up (fades out by 5 m/s). Default `true`. */
  feet?: boolean;
}

/** One {@link ReferenceMotorcycle} sample; the first fields match the vehicle steps the handling probes read. */
export interface ReferenceMotorcycleStep {
  /** Engine world axes (x, y up, z), m; the rear contact point. */
  position: readonly [number, number, number];
  heading: number;
  forwardSpeed: number;
  /** Speed toward the right, m/s. */
  lateralSpeed: number;
  /** Heading rate, rad/s, positive turning left. */
  yawRate: number;
  /** Steer angle about the steer axis, rad, positive steering right. */
  steerAngle: number;
  /** Main-frame lean, rad, positive leaning right. */
  lean: number;
  /** Rider upper-body lean relative to the frame, rad, positive right. */
  riderLean: number;
  /** Frame twist at the steering head, rad. */
  twist: number;
  /** Nose-down pitch, rad. */
  pitch: number;
  /** Lateral acceleration, m/s², positive toward the right; longitudinal positive forward. */
  lateralAccel: number;
  longitudinalAccel: number;
  /** Steering torque the rider applied, N·m, positive right. */
  steerTorque: number;
  frontLoad: number;
  rearLoad: number;
  frontSlip: number;
  rearSlip: number;
  frontSlipAngle: number;
  rearSlipAngle: number;
  /** Fork compression and swing-arm angle (rear wheel up positive), m and rad. */
  forkTravel: number;
  swingArm: number;
  rpm: number;
  gear: number;
  wheelie: boolean;
  stoppie: boolean;
}

/** Serializable state of a {@link ReferenceMotorcycle}. */
export interface ReferenceMotorcycleState {
  plant: number[];
  gear: number;
  shiftRemaining: number;
  clutchLocked: boolean;
  clutchTime: number;
  throttleScale: number;
  frontBrakeLevel: number;
  rearBrakeLevel: number;
  brakeRamp: number;
  carry: number;
}

/** The reference motorcycle: a ruler for game bikes, not a game runtime. */
export interface ReferenceMotorcycle {
  step(dt: number, controls: MotorcycleControls): ReferenceMotorcycleStep;
  /** The last sample without advancing. */
  sample(): ReferenceMotorcycleStep;
  /** World velocity on the ground plane, `[vx, vz]`, m/s (engine axes). */
  velocity(): readonly [number, number];
  pose(): { position: readonly [number, number, number]; heading: number };
  spec(): ReferenceMotorcycleSpec;
  snapshot(): ReferenceMotorcycleState;
  restore(state: Readonly<ReferenceMotorcycleState>): void;
  /** Back to the settled spawn at rest (or at the spawn speed). */
  reset(): void;
}

/** Spawn options for {@link createReferenceMotorcycle}. */
export interface ReferenceMotorcycleOptions {
  /** Start rolling straight at this speed, m/s (default `0`). */
  speed?: number;
  /** Gear at a rolling start (default: the gear the rider would be in). */
  gear?: number;
}

const GRAVITY = 9.81;
const RPM = 30 / Math.PI;
const CONTROL_STEP = 1 / 1000;
const VX_LOW = 1;

// Tree bodies.
const MAIN = 0;
const RIDER = 1;
const SWING = 2;
const REAR_WHEEL = 3;
const TWIST = 4;
const STEER = 5;
const FORK = 6;
const FRONT_WHEEL = 7;

type V3 = [number, number, number];

function world(p: SidePoint): V3 {
  return [p[0], 0, -p[1]];
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function torqueAt(curve: readonly (readonly [number, number])[], rpm: number): number {
  let previous: readonly [number, number] | undefined;
  for (const point of curve) {
    if (rpm <= point[0]) {
      if (previous === undefined) return point[1];
      const t = (rpm - previous[0]) / Math.max(1e-6, point[0] - previous[0]);
      return previous[1] + (point[1] - previous[1]) * t;
    }
    previous = point;
  }
  return previous?.[1] ?? 0;
}

/** Inertia tensor about the centre in ISO world axes `[Ixx, Iyy, Izz, Ixy, Ixz, Iyz]` from a published SAE tensor. */
function isoInertia(body: { ixx?: number; iyy?: number; izz?: number; ixz?: number; axes?: "ground" | "steer" }, rake: number): [number, number, number, number, number, number] {
  const ixx = body.ixx ?? 0;
  const iyy = body.iyy ?? 0;
  const izz = body.izz ?? 0;
  const ixz = -(body.ixz ?? 0);
  if (body.axes !== "steer") return [ixx, iyy, izz, 0, ixz, 0];
  // Body z along the steer axis (up and back), body x normal to it, forward and up: rotate by the rake about y.
  const c = Math.cos(rake);
  const s = Math.sin(rake);
  return [ixx * c * c + izz * s * s + 2 * ixz * s * c, iyy, ixx * s * s + izz * c * c - 2 * ixz * s * c, 0, (ixx - izz) * s * c + ixz * (c * c - s * s), 0];
}

/** Rear-suspension unit length and its rate per swing-arm radian at swing-arm angle θ (rear wheel up positive). */
function linkageLength(l: MotorcycleRearLinkage, pivot: SidePoint, theta: number): { length: number; ratio: number } {
  const at = (angle: number) => {
    const p = world(pivot);
    const rod = world(l.rodToSwingArm);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Swing arm turns about +y (left): a point behind the pivot rises for θ > 0.
    const dx = rod[0] - p[0];
    const dz = rod[2] - p[2];
    const rx = p[0] + c * dx + s * dz;
    const rz = p[2] - s * dx + c * dz;
    const rp = world(l.rockerPivot);
    const a0 = world(l.rockerToRod);
    const b0 = world(l.rockerToShock);
    const rodLength = Math.hypot(a0[0] - rod[0], a0[2] - rod[2]);
    // Rocker angle φ about the rocker pivot so the rod keeps its length (Newton from the design pose).
    let phi = 0;
    for (let i = 0; i < 30; i++) {
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ax = rp[0] + cp * (a0[0] - rp[0]) + sp * (a0[2] - rp[2]);
      const az = rp[2] - sp * (a0[0] - rp[0]) + cp * (a0[2] - rp[2]);
      const f = (ax - rx) ** 2 + (az - rz) ** 2 - rodLength * rodLength;
      const dax = -sp * (a0[0] - rp[0]) + cp * (a0[2] - rp[2]);
      const daz = -cp * (a0[0] - rp[0]) - sp * (a0[2] - rp[2]);
      const df = 2 * (ax - rx) * dax + 2 * (az - rz) * daz;
      const step = f / df;
      phi -= step;
      if (Math.abs(step) < 1e-14) break;
    }
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const bx = rp[0] + cp * (b0[0] - rp[0]) + sp * (b0[2] - rp[2]);
    const bz = rp[2] - sp * (b0[0] - rp[0]) + cp * (b0[2] - rp[2]);
    const top = world(l.shockTop);
    return Math.hypot(top[0] - bx, top[2] - bz);
  };
  const h = 1e-6;
  return { length: at(theta), ratio: (at(theta + h) - at(theta - h)) / (2 * h) };
}

/** A fitted cubic of the linkage length and its derivative on −0.4..0.4 rad, so the plant needs no Newton solve. */
function linkageTable(l: MotorcycleRearLinkage, pivot: SidePoint): (theta: number) => { length: number; ratio: number } {
  const n = 161;
  const lo = -0.4;
  const hi = 0.4;
  const lengths = new Float64Array(n);
  const ratios = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const sample = linkageLength(l, pivot, lo + ((hi - lo) * i) / (n - 1));
    lengths[i] = sample.length;
    ratios[i] = sample.ratio;
  }
  const dh = (hi - lo) / (n - 1);
  return (theta) => {
    const x = clamp((theta - lo) / dh, 0, n - 1.000001);
    const i = Math.floor(x);
    const t = x - i;
    // Cubic Hermite on length with the exact slopes; slope linearly interpolated.
    const y0 = lengths[i] ?? 0;
    const y1 = lengths[i + 1] ?? 0;
    const m0 = (ratios[i] ?? 0) * dh;
    const m1 = (ratios[i + 1] ?? 0) * dh;
    const t2 = t * t;
    const t3 = t2 * t;
    const length = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    const ratio = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / dh;
    return { length, ratio };
  };
}

interface Model {
  tree: RigidBodyTree;
  steerAxis: V3;
  /** Distance from the wheel centre to the crown centre, m. */
  frontOc: number;
  rearOc: number;
  frontNominal: number;
  rearNominal: number;
  wheelbase: number;
  mass: number;
}

function buildModel(spec: Readonly<ReferenceMotorcycleSpec>): Model {
  const rake = spec.rake;
  const steerAxis: V3 = [-Math.sin(rake), 0, Math.cos(rake)];
  const twistAxis: V3 = [Math.cos(rake), 0, Math.sin(rake)];
  let main: RigidBodyDefinition = {
    name: "main frame",
    parent: -1,
    joint: { kind: "free" },
    origin: world(spec.mainFrame.com),
    mass: spec.mainFrame.mass,
    com: world(spec.mainFrame.com),
    inertia: isoInertia(spec.mainFrame, rake),
  };
  if (spec.payload !== undefined && spec.payload.mass > 0) {
    // Fold a point mass into the main frame.
    const m0 = main.mass;
    const m1 = spec.payload.mass;
    const c0 = main.com;
    const c1 = world(spec.payload.position);
    const m = m0 + m1;
    const c: V3 = [(m0 * c0[0] + m1 * c1[0]) / m, 0, (m0 * c0[2] + m1 * c1[2]) / m];
    const add = (mass: number, p: Readonly<V3>): [number, number, number] => {
      const dx = p[0] - c[0];
      const dz = p[2] - c[2];
      return [mass * dz * dz, mass * (dx * dx + dz * dz), mass * dx * dx];
    };
    const a = add(m0, c0);
    const b = add(m1, c1);
    const pxz = (mass: number, p: Readonly<V3>) => -mass * (p[0] - c[0]) * (p[2] - c[2]);
    const [ixx, iyy, izz, ixy, ixz, iyz] = main.inertia;
    main = {
      ...main,
      mass: m,
      origin: c,
      com: c,
      inertia: [ixx + a[0] + b[0], iyy + a[1] + b[1], izz + a[2] + b[2], ixy, ixz + pxz(m0, c0) + pxz(m1, c1), iyz],
    };
  }
  const zero: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  const bodies: RigidBodyDefinition[] = [
    main,
    {
      name: "rider upper body",
      parent: MAIN,
      joint: { kind: "revolute", axis: [1, 0, 0] },
      origin: world(spec.riderLeanPivot),
      mass: spec.riderUpperBody.mass,
      com: world(spec.riderUpperBody.com),
      inertia: isoInertia(spec.riderUpperBody, rake),
    },
    {
      name: "swing arm",
      parent: MAIN,
      joint: { kind: "revolute", axis: [0, 1, 0] },
      origin: world(spec.swingArmPivot),
      mass: spec.swingArm.mass,
      com: world(spec.swingArm.com),
      inertia: isoInertia(spec.swingArm, rake),
    },
    {
      name: "rear wheel",
      parent: SWING,
      joint: { kind: "revolute", axis: [0, 1, 0] },
      origin: world(spec.rear.center),
      mass: spec.rear.mass,
      com: world(spec.rear.center),
      inertia: [spec.rear.ixx, spec.rear.iyy, spec.rear.ixx, 0, 0, 0],
    },
    {
      name: "twist",
      parent: MAIN,
      joint: { kind: "revolute", axis: twistAxis },
      origin: world(spec.twistAxisPoint),
      mass: 0,
      com: world(spec.twistAxisPoint),
      inertia: zero,
    },
    {
      name: "steering",
      parent: TWIST,
      joint: { kind: "revolute", axis: steerAxis },
      origin: world(spec.steerAxisPoint),
      mass: spec.steering.mass,
      com: world(spec.steering.com),
      inertia: isoInertia(spec.steering, rake),
    },
    {
      name: "lower fork",
      parent: STEER,
      joint: { kind: "prismatic", axis: steerAxis },
      origin: world(spec.forkSlidePoint),
      mass: spec.lowerFork.mass,
      com: world(spec.lowerFork.com),
      inertia: isoInertia(spec.lowerFork, rake),
    },
    {
      name: "front wheel",
      parent: FORK,
      joint: { kind: "revolute", axis: [0, 1, 0] },
      origin: world(spec.front.center),
      mass: spec.front.mass,
      com: world(spec.front.center),
      inertia: [spec.front.ixx, spec.front.iyy, spec.front.ixx, 0, 0, 0],
    },
  ];
  const tree = createRigidBodyTree(bodies);
  // Static wheel loads from the centre of mass; the published pose is the nominal (static) tyre state.
  let mass = 0;
  let moment = 0;
  for (const body of bodies) {
    mass += body.mass;
    moment += body.mass * body.com[0];
  }
  const xr = spec.rear.center[0];
  const xf = spec.front.center[0];
  const frontNominal = (mass * GRAVITY * (moment / mass - xr)) / (xf - xr);
  const rearNominal = mass * GRAVITY - frontNominal;
  return {
    tree,
    steerAxis,
    frontOc: -spec.front.center[1] - spec.front.crownRadius,
    rearOc: -spec.rear.center[1] - spec.rear.crownRadius,
    frontNominal,
    rearNominal,
    wheelbase: xf - xr,
    mass,
  };
}

/** Tyre contact of one wheel for the current tree state. */
interface Contact {
  fz: number;
  kappa: number;
  alpha: number;
  gamma: number;
  vx: number;
  du: number;
  dv: number;
  fx: number;
  fy: number;
}

const internals = new WeakMap<ReferenceMotorcycle, { tangentJacobian(): { matrix: Float64Array; size: number; outOfPlane: number[] } }>();

/** Out-of-plane and in-plane straight-running eigenvalues of a reference motorcycle, 1/s. */
export interface MotorcycleModes {
  speed: number;
  /** Lean, steer, twist, rider and tyre side-slip states (weave, wobble, capsize). */
  outOfPlane: Eigenvalue[];
  /** Pitch, bounce, suspension, wheel hop and tyre longitudinal states. */
  inPlane: Eigenvalue[];
  /** The steering oscillation: the least damped out-of-plane pair between 35 and 90 rad/s. */
  wobble: Eigenvalue | undefined;
  /** The lean-yaw-steer oscillation: the highest-frequency out-of-plane pair between 2 and 35 rad/s. */
  weave: Eigenvalue | undefined;
}

/**
 * Straight-running stability of a {@link ReferenceMotorcycleSpec} at `speed` (Sharp, Evangelou & Limebeer 2004,
 * section 6): settle the bike at speed under their speed controller, take the Jacobian of the full nonlinear plant
 * by central differences, and split it into its out-of-plane and in-plane blocks. Rigid-body zero roots (position,
 * heading, wheel angles) are dropped.
 * @capability motorcycle-modes weave and wobble eigenvalues of a multibody motorcycle at any speed
 */
export function motorcycleStraightRunningModes(spec: ReferenceMotorcycleSpec, speed: number): MotorcycleModes {
  const bike = createReferenceMotorcycle(spec, { speed });
  const internal = internals.get(bike);
  if (internal === undefined) throw new Error("motorcycleStraightRunningModes: bike has no plant");
  const { matrix, size, outOfPlane } = internal.tangentJacobian();
  const inSet = new Set(outOfPlane);
  const inPlaneIndex: number[] = [];
  for (let k = 0; k < size; k++) if (!inSet.has(k)) inPlaneIndex.push(k);
  const block = (index: readonly number[]) => {
    const m = index.length;
    const out = new Float64Array(m * m);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) out[i * m + j] = matrix[(index[i] ?? 0) * size + (index[j] ?? 0)] ?? 0;
    return matrixEigenvalues(out, m).filter((root) => Math.hypot(root.re, root.im) > 1e-4);
  };
  const lateral = block(outOfPlane);
  const wobble = lateral.filter((root) => root.im > 35 && root.im < 90).sort((a, b) => b.re - a.re)[0];
  const weave = lateral.filter((root) => root.im > 2 && root.im <= 35).sort((a, b) => b.im - a.im)[0];
  return { speed, outOfPlane: lateral, inPlane: block(inPlaneIndex), wobble, weave };
}

// Plant layout: tree positions, tree velocities, then front u, v, rear u, v (contact deflections, m), engine speed.
/**
 * Creates a {@link ReferenceMotorcycle}: the multibody motorcycle of {@link ReferenceMotorcycleSpec} on a
 * {@link createRigidBodyTree} (13 degrees of freedom), integrated by classical RK4 at 0.5 ms under a 1 kHz control
 * sample.
 *
 * - Thick tyres: each contact point is found from the wheel's spindle and the tread's circular crown, so the
 *   contact moves across the tread as the bike leans (the overturning moment comes from geometry); load from radial
 *   stiffness; Sharp et al.'s motorcycle Magic Formula with camber thrust, combined slip, aligning and twisting
 *   moment; side slip relaxed with their speed-dependent relaxation length, camber force without lag.
 * - Steering only by torque: lean, countersteer, weave and wobble come out of the dynamics, with frame twist, rider
 *   upper-body roll, steering damper and the wheels' gyroscopic coupling.
 * - Front fork and monoshock linkage with bump and rebound stops; aerodynamic drag, lift and pitching moment.
 * - Engine with inertia, clutch launch, gearbox and chain, front and rear brakes. The drive torque reacts on the
 *   main frame (Sharp et al.'s shaft-drive simplification: no chain-pull squat).
 *
 * Not modelled: crankshaft gyroscopics, rolling resistance (the published tyre has none), tyre temperature.
 * @capability reference-motorcycle multibody reference motorcycle — countersteer, weave and wobble from the physics, motorcycle Magic Formula tyres
 */
export function createReferenceMotorcycle(spec: ReferenceMotorcycleSpec, options: ReferenceMotorcycleOptions = {}): ReferenceMotorcycle {
  const model = buildModel(spec);
  const { tree } = model;
  const nq = tree.positions;
  const nu = tree.dofs;
  const TIRE = nq + nu;
  const ENGINE = TIRE + 4;
  const size = ENGINE + 1;
  const substeps = Math.max(1, Math.round(CONTROL_STEP / (spec.step ?? 1 / 2000)));
  const h = CONTROL_STEP / substeps;
  const integrator = createRungeKutta4(size);
  const linkage = linkageTable(spec.rearSuspension, spec.swingArmPivot);
  const pt = spec.powertrain;
  const efficiency = pt.efficiency ?? 0.9;
  const peakTorque = Math.max(...pt.torqueCurve.map((point) => point[1]));
  const clutchTorque = pt.clutchTorque ?? 1.6 * peakTorque;
  const idle = pt.idleRpm / RPM;
  const upshift = (pt.upshiftRpm ?? pt.redlineRpm - 300) / RPM;
  const launchSpin = (pt.launchRpm ?? 0.7 * pt.redlineRpm) / RPM;
  const clutchSeconds = pt.clutchSeconds ?? 0.5;
  const shiftSeconds = pt.shiftSeconds ?? 0.15;
  const ratioOf = (gear: number) => pt.primary * (pt.ratios[gear - 1] ?? 1) * pt.finalDrive;
  const qd = (index: number) => nq + index;
  const coordFork = tree.coordinateOf(FORK);
  const coordSwing = tree.coordinateOf(SWING);
  const coordSteer = tree.coordinateOf(STEER);
  const coordTwist = tree.coordinateOf(TWIST);
  const coordRider = tree.coordinateOf(RIDER);
  const dofFork = tree.dofOf(FORK);
  const dofSwing = tree.dofOf(SWING);
  const dofSteer = tree.dofOf(STEER);
  const dofTwist = tree.dofOf(TWIST);
  const dofRider = tree.dofOf(RIDER);
  const dofRear = tree.dofOf(REAR_WHEEL);
  const dofFront = tree.dofOf(FRONT_WHEEL);
  const aeroLocal = world(spec.aeroPoint);
  const mainOrigin = tree.bodies[MAIN]?.origin ?? [0, 0, 0];
  const aeroOffset: V3 = [aeroLocal[0] - mainOrigin[0], 0, aeroLocal[2] - mainOrigin[2]];

  // Controls held over a control sample.
  const held = { steerTorque: 0, riderLeanTorque: 0, wheelTorque: 0, frontBrake: 0, rearBrake: 0, clutchTorque: 0, engineTorque: 0, feet: 1, locked: true, ratio: 1 };
  let forkPreload = 0;
  let swingPreload = 0;
  let restPitch = 0;

  // Scratch.
  const H = new Float64Array(nu * nu);
  const rhs = new Float64Array(nu);
  const ud = new Float64Array(nu);
  const t3 = new Float64Array(3);
  const point = new Float64Array(3);
  const force = new Float64Array(3);
  const vC = new Float64Array(3);
  const vG = new Float64Array(3);
  const contacts: [Contact, Contact] = [
    { fz: 0, kappa: 0, alpha: 0, gamma: 0, vx: 0, du: 0, dv: 0, fx: 0, fy: 0 },
    { fz: 0, kappa: 0, alpha: 0, gamma: 0, vx: 0, du: 0, dv: 0, fx: 0, fy: 0 },
  ];

  function tireContact(x: Float64Array, front: boolean, out: Contact): void {
    const wheel = front ? FRONT_WHEEL : REAR_WHEEL;
    const carrier = front ? FORK : SWING;
    const w = front ? spec.front : spec.rear;
    const oc = front ? model.frontOc : model.rearOc;
    const nominal = front ? model.frontNominal : model.rearNominal;
    const R = tree.rotation(wheel);
    const o = tree.origin(wheel);
    const ax = R[1] ?? 0;
    const ay = R[4] ?? 0;
    const az = R[7] ?? 0;
    // l = a × ẑ (forward), d = a × l (down in the wheel plane), n = ẑ × l (left on the ground).
    let lx = ay;
    let ly = -ax;
    const ln = Math.hypot(lx, ly) || 1;
    lx /= ln;
    ly /= ln;
    const dx = -az * ly;
    const dy = az * lx;
    const dz = ax * ly - ay * lx;
    const cx = (o[0] ?? 0) + oc * dx;
    const cy = (o[1] ?? 0) + oc * dy;
    const cz = (o[2] ?? 0) + oc * dz;
    const nx = -ly;
    const ny = lx;
    const fz = nominal + w.radialStiffness * (w.crownRadius - cz);
    point[0] = cx;
    point[1] = cy;
    point[2] = cz;
    tree.pointVelocity(carrier, point, vC);
    point[2] = 0;
    tree.pointVelocity(wheel, point, vG);
    const vx = (vC[0] ?? 0) * lx + (vC[1] ?? 0) * ly;
    const vsy = (vC[0] ?? 0) * nx + (vC[1] ?? 0) * ny;
    const vsx = (vG[0] ?? 0) * lx + (vG[1] ?? 0) * ly;
    const gamma = Math.asin(clamp(az, -1, 1));
    const offset = front ? 0 : 2;
    const u = x[TIRE + offset] ?? 0;
    const v = x[TIRE + offset + 1] ?? 0;
    const speed = Math.abs(vx);
    const load = Math.max(fz, 50);
    const stiff = motorcycleMagicFormula(w.tire, { kappa: 0, alpha: 0, gamma: 0, fz: load }, speed);
    const sigmaA = Math.max(0.02, stiff.relaxationLength);
    const sigmaK = w.longitudinalRelaxation ?? 0.1;
    const kVlow = speed < VX_LOW ? (0.5 / VX_LOW) * (1 + Math.cos((Math.PI * speed) / VX_LOW)) : 0;
    const kappa = u / sigmaK - kVlow * vsx;
    const alpha = Math.atan(v / sigmaA + kVlow * vsy);
    out.fz = fz;
    out.kappa = kappa;
    out.alpha = alpha;
    out.gamma = gamma;
    out.vx = vx;
    out.du = -vsx - (speed * u) / sigmaK;
    out.dv = vsy - (speed * v) / sigmaA;
    if (fz <= 0) {
      out.fz = 0;
      out.fx = 0;
      out.fy = 0;
      return;
    }
    const f = motorcycleMagicFormula(w.tire, { kappa, alpha, gamma, fz });
    out.fx = f.fx;
    out.fy = f.fy;
    force[0] = f.fx * lx + f.fy * nx;
    force[1] = f.fx * ly + f.fy * ny;
    force[2] = fz;
    tree.applyForce(wheel, point, force);
    t3[0] = 0;
    t3[1] = 0;
    t3[2] = f.mz;
    tree.applyTorque(wheel, t3);
  }

  function fifth(excess: number, k: number): number {
    return excess > 0 ? k * excess ** 5 : 0;
  }

  /** Plant right-hand side with the controls held. */
  function derivative(x: Float64Array, out: Float64Array): void {
    const q = x.subarray(0, nq);
    const u = x.subarray(nq, TIRE);
    tree.update(q, u);
    tree.clearForces([0, 0, -GRAVITY]);
    // Joints.
    const rider = q[coordRider] ?? 0;
    tree.applyGeneralized(dofRider, -spec.riderLean.stiffness * rider - spec.riderLean.damping * (u[dofRider] ?? 0) - held.riderLeanTorque);
    tree.applyGeneralized(dofTwist, -spec.frameTwist.stiffness * (q[coordTwist] ?? 0) - spec.frameTwist.damping * (u[dofTwist] ?? 0));
    const steer = q[coordSteer] ?? 0;
    const lock = spec.steeringSystem.lock;
    tree.applyGeneralized(
      dofSteer,
      -spec.steeringSystem.stiffness * steer -
        spec.steeringSystem.damping * (u[dofSteer] ?? 0) -
        held.steerTorque -
        fifth(steer - lock, spec.steeringSystem.stopStiffness) +
        fifth(-steer - lock, spec.steeringSystem.stopStiffness),
    );
    const fs = spec.frontSuspension;
    const fork = q[coordFork] ?? 0;
    tree.applyGeneralized(dofFork, -forkPreload - fs.stiffness * fork - fs.damping * (u[dofFork] ?? 0) - fifth(fork - fs.compression, fs.stopStiffness) + fifth(-fork - fs.extension, fs.stopStiffness));
    const rs = spec.rearSuspension;
    const link = linkage(q[coordSwing] ?? 0);
    const lengthRate = link.ratio * (u[dofSwing] ?? 0);
    const unit = rs.stiffness * (rs.freeLength - link.length) - rs.damping * lengthRate + fifth(rs.minLength - link.length, rs.bumpStop) - fifth(link.length - rs.maxLength, rs.reboundStop);
    tree.applyGeneralized(dofSwing, unit * link.ratio - swingPreload);
    // Wheels: drive and brakes.
    const rearSpin = u[dofRear] ?? 0;
    const frontSpin = u[dofFront] ?? 0;
    tree.applyGeneralized(dofRear, held.wheelTorque - held.rearBrake * clamp(rearSpin / 0.3, -1, 1));
    tree.applyGeneralized(dofFront, -held.frontBrake * clamp(frontSpin / 0.3, -1, 1));
    // The wheel torque reacts on the main frame rather than the swing arm.
    const Rs = tree.rotation(SWING);
    t3[0] = (Rs[1] ?? 0) * held.wheelTorque;
    t3[1] = (Rs[4] ?? 0) * held.wheelTorque;
    t3[2] = (Rs[7] ?? 0) * held.wheelTorque;
    tree.applyTorque(SWING, t3);
    t3[0] = -(t3[0] ?? 0);
    t3[1] = -(t3[1] ?? 0);
    t3[2] = -(t3[2] ?? 0);
    tree.applyTorque(MAIN, t3);
    // Tyres.
    tireContact(x, true, contacts[0]);
    tireContact(x, false, contacts[1]);
    // Aero on the main frame.
    const Rm = tree.rotation(MAIN);
    const om = tree.origin(MAIN);
    for (let k = 0; k < 3; k++) point[k] = (om[k] ?? 0) + (Rm[3 * k] ?? 0) * aeroOffset[0] + (Rm[3 * k + 2] ?? 0) * aeroOffset[2];
    tree.pointVelocity(MAIN, point, vC);
    const vx = vC[0] ?? 0;
    const vy = vC[1] ?? 0;
    const airspeed = Math.hypot(vx, vy);
    if (airspeed > 0.1) {
      const qa = 0.5 * spec.aero.density * airspeed * airspeed * spec.aero.area;
      force[0] = (-qa * spec.aero.drag * vx) / airspeed;
      force[1] = (-qa * spec.aero.drag * vy) / airspeed;
      force[2] = qa * spec.aero.lift;
      tree.applyForce(MAIN, point, force);
      // Nose-up pitching moment about the left axis of travel.
      const m = qa * spec.aero.pitch * model.wheelbase;
      t3[0] = (vy / airspeed) * m;
      t3[1] = (-vx / airspeed) * m;
      t3[2] = 0;
      tree.applyTorque(MAIN, t3);
    }
    // The rider's feet at walking pace: a roll spring-damper to the ground, fading out by 5 m/s.
    if (held.feet > 0) {
      const roll = Math.atan2(Rm[7] ?? 0, Rm[8] ?? 1);
      tree.angularVelocity(MAIN, t3);
      const heading = Math.atan2(Rm[3] ?? 0, Rm[0] ?? 1);
      const rollRate = Math.cos(heading) * (t3[0] ?? 0) + Math.sin(heading) * (t3[1] ?? 0);
      const torque = -held.feet * (4000 * roll + 800 * rollRate);
      t3[0] = Math.cos(heading) * torque;
      t3[1] = Math.sin(heading) * torque;
      t3[2] = 0;
      tree.applyTorque(MAIN, t3);
    }
    tree.massMatrix(H);
    if (held.locked) H[dofRear * nu + dofRear] = (H[dofRear * nu + dofRear] ?? 0) + pt.inertia * held.ratio * held.ratio;
    tree.forcing(rhs);
    solveSmall(H, rhs, nu, ud);
    tree.positionRates(q, u, out, 0);
    out.set(ud, nq);
    out[TIRE] = contacts[0].du;
    out[TIRE + 1] = contacts[0].dv;
    out[TIRE + 2] = contacts[1].du;
    out[TIRE + 3] = contacts[1].dv;
    out[ENGINE] = held.locked ? held.ratio * (ud[dofRear] ?? 0) : (held.engineTorque - held.clutchTorque) / pt.inertia;
  }

  // Cholesky solve of the symmetric positive-definite mass matrix.
  const L = new Float64Array(nu * nu);
  function solveSmall(m: Float64Array, b: Float64Array, n: number, out: Float64Array): void {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = m[i * n + j] ?? 0;
        for (let k = 0; k < j; k++) sum -= (L[i * n + k] ?? 0) * (L[j * n + k] ?? 0);
        L[i * n + j] = i === j ? Math.sqrt(Math.max(sum, 1e-300)) : sum / (L[j * n + j] ?? 1);
      }
    }
    for (let i = 0; i < n; i++) {
      let sum = b[i] ?? 0;
      for (let k = 0; k < i; k++) sum -= (L[i * n + k] ?? 0) * (out[k] ?? 0);
      out[i] = sum / (L[i * n + i] ?? 1);
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = out[i] ?? 0;
      for (let k = i + 1; k < n; k++) sum -= (L[k * n + i] ?? 0) * (out[k] ?? 0);
      out[i] = sum / (L[i * n + i] ?? 1);
    }
  }

  let plant: Float64Array = new Float64Array(size);
  interface Control {
    gear: number;
    shiftRemaining: number;
    clutchLocked: boolean;
    clutchTime: number;
    throttleScale: number;
    frontBrakeLevel: number;
    rearBrakeLevel: number;
    brakeRamp: number;
    carry: number;
  }
  const freshControl = (): Control => ({
    gear: 1,
    shiftRemaining: 0,
    clutchLocked: false,
    clutchTime: 0,
    throttleScale: 1,
    frontBrakeLevel: 1,
    rearBrakeLevel: 1,
    brakeRamp: 0,
    carry: 0,
  });
  let control = freshControl();
  const frontStatic = model.frontNominal;
  const rearStatic = model.rearNominal;
  // Slip at peak longitudinal force (for the rider's brake and traction limits).
  const peakSlip = (tire: Readonly<MotorcycleTireCoefficients>, fz: number) => {
    let best = 0;
    let at = 0.1;
    for (let k = 0.01; k < 0.4; k += 0.002) {
      const f = motorcycleMagicFormula(tire, { kappa: k, alpha: 0, gamma: 0, fz }).fx;
      if (f > best) {
        best = f;
        at = k;
      }
    }
    return at;
  };
  const frontPeakSlip = peakSlip(spec.front.tire, frontStatic * 1.8);
  const rearPeakSlip = peakSlip(spec.rear.tire, rearStatic * 1.3);

  /** The 1 kHz rider and powertrain sample. */
  function controlStep(c: MotorcycleControls): void {
    plantDerivative(plant, scratch);
    const throttle = clamp(c.throttle ?? 0, 0, 1);
    const brake = clamp(c.brake ?? 0, 0, 1);
    held.steerTorque = c.steerTorque ?? 0;
    held.riderLeanTorque = c.riderLeanTorque ?? 0;
    const speed = Math.abs(contacts[1].vx);
    held.feet = (c.feet ?? true) ? clamp((5 - speed) / 1, 0, 1) : 0;
    const rearSpin = plant[qd(dofRear)] ?? 0;
    const frontLoad = contacts[0].fz;
    const rearLoad = contacts[1].fz;

    // Brakes: ramp the lever on, hold the front at its slip limit and keep the rear on the ground.
    control.brakeRamp = brake > 0 ? Math.min(1, control.brakeRamp + CONTROL_STEP / 0.2) : 0;
    if (brake > 0 && speed > 1) {
      const frontSlip = -contacts[0].kappa;
      const rearShare = rearLoad / Math.max(1, rearStatic);
      const lift = 6 * clamp(rearShare - 0.12, -1, 0.3);
      const grip = 40 * (frontPeakSlip * 0.85 - frontSlip);
      control.frontBrakeLevel = clamp(control.frontBrakeLevel + CONTROL_STEP * Math.min(lift, grip), 0, 1);
      control.rearBrakeLevel = clamp(control.rearBrakeLevel + CONTROL_STEP * 40 * (rearPeakSlip * 0.85 + contacts[1].kappa), 0, 1);
    } else {
      control.frontBrakeLevel = 0.6;
      control.rearBrakeLevel = 0.5;
    }
    const frontCap = Math.min(spec.brakes.front, 2.2 * frontStatic * 1.4 * Math.abs(-spec.front.center[1]));
    held.frontBrake = brake * control.brakeRamp * control.frontBrakeLevel * frontCap;
    held.rearBrake = brake * control.brakeRamp * control.rearBrakeLevel * spec.brakes.rear;

    if (c.driveTorque !== undefined) {
      held.wheelTorque = c.driveTorque;
      held.engineTorque = 0;
      held.clutchTorque = 0;
      held.locked = false;
      held.ratio = ratioOf(control.gear);
      return;
    }
    // Shifts.
    const ratio = ratioOf(control.gear);
    let engine = plant[ENGINE] ?? idle;
    if (control.shiftRemaining > 0) {
      control.shiftRemaining = Math.max(0, control.shiftRemaining - CONTROL_STEP);
      if (control.shiftRemaining === 0) {
        control.gear += 1;
        control.clutchLocked = true;
      }
    } else if (control.clutchLocked && engine > upshift && control.gear < pt.ratios.length && throttle > 0) {
      control.shiftRemaining = shiftSeconds;
    }
    held.ratio = ratioOf(control.gear);
    // Wheelie and traction: the rider rolls the throttle off as the front goes light or the rear spins up.
    const noseUp = Math.asin(clamp(tree.rotation(MAIN)[6] ?? 0, -1, 1)) - restPitch;
    const wheelieMargin = frontLoad / Math.max(1, frontStatic) - 0.1 - 8 * Math.max(0, noseUp - 0.07);
    const spin = contacts[1].kappa - rearPeakSlip * 0.9;
    control.throttleScale = clamp(control.throttleScale + CONTROL_STEP * (40 * Math.min(wheelieMargin, 0.05) - 40 * Math.max(0, spin)), 0, 1);
    if (throttle === 0) control.throttleScale = 1;
    const demand = throttle * control.throttleScale;
    const shifting = control.shiftRemaining > 0;
    const wheelSide = Math.max(0, rearSpin) * ratio;
    if (brake > 0 || throttle === 0 || shifting) {
      // Clutch in: the engine idles, no drive.
      control.clutchLocked = shifting ? false : control.clutchLocked && brake === 0 && throttle === 0 && engine > idle * 1.05;
      if (brake > 0) control.clutchLocked = false;
    }
    const full = torqueAt(pt.torqueCurve, engine * RPM);
    const drag = 0.15 * peakTorque * (engine / (pt.redlineRpm / RPM));
    if (control.clutchLocked && !shifting) {
      engine = wheelSide;
      plant[ENGINE] = engine;
      const torque = engine * RPM > pt.redlineRpm ? -drag : demand * full - (1 - demand) * drag;
      held.locked = true;
      held.wheelTorque = torque * held.ratio * (torque > 0 ? efficiency : 1);
      held.engineTorque = 0;
      held.clutchTorque = 0;
      if (engine < idle && throttle === 0) control.clutchLocked = false;
      return;
    }
    // Clutch slipping (launch) or open.
    held.locked = false;
    const launching = throttle > 0 && !shifting && brake === 0;
    if (launching) control.clutchTime = Math.min(clutchSeconds, control.clutchTime + CONTROL_STEP);
    else control.clutchTime = 0;
    const slip = engine - wheelSide;
    // Throttle wide open, the rider slips the clutch to hold the launch rpm, letting it out over clutchSeconds.
    const limited = engine * RPM > pt.redlineRpm;
    const engineTorque = launching ? (limited ? -drag : full * demand) : shifting ? -drag : clamp(0.5 * peakTorque * ((idle - engine) / idle), -drag, full);
    // The rider slips the clutch until the wheel side reaches half the launch rpm.
    const released = control.clutchTime >= clutchSeconds && wheelSide >= 0.5 * launchSpin;
    const hold = !launching ? 0 : released ? clutchTorque : clamp(full * throttle + pt.inertia * 40 * (engine - launchSpin), 0, clutchTorque * (control.clutchTime / clutchSeconds));
    const transmitted = (slip > 0 ? hold : -hold) * control.throttleScale;
    held.engineTorque = engineTorque;
    held.clutchTorque = transmitted;
    held.wheelTorque = transmitted * held.ratio * (transmitted > 0 ? efficiency : 1);
    if (launching && slip < 20 && released) control.clutchLocked = true;
  }

  const scratch = new Float64Array(size);
  const plantDerivative = (x: Float64Array, out: Float64Array) => derivative(x, out);

  function advance(): void {
    integrator.step(plant, h, plantDerivative);
    const norm = Math.hypot(plant[3] ?? 1, plant[4] ?? 0, plant[5] ?? 0, plant[6] ?? 0) || 1;
    for (let k = 3; k < 7; k++) plant[k] = (plant[k] ?? 0) / norm;
    if ((plant[ENGINE] ?? 0) < 0) plant[ENGINE] = 0;
  }

  // Heading and engine-world conversions (engine x = internal y, engine z = internal x, engine y up).
  function headingOf(x: Float64Array): number {
    const qw = x[3] ?? 1;
    const qx = x[4] ?? 0;
    const qy = x[5] ?? 0;
    const qz = x[6] ?? 0;
    return Math.atan2(2 * (qx * qy + qw * qz), 1 - 2 * (qy * qy + qz * qz));
  }

  let lastVelocity: [number, number] = [0, 0];
  let lastAccel: [number, number] = [0, 0];

  function read(): ReferenceMotorcycleStep {
    const q = plant.subarray(0, nq);
    plantDerivative(plant, scratch);
    const psi = headingOf(plant);
    const Rm = tree.rotation(MAIN);
    const fx = Math.cos(psi);
    const fy = Math.sin(psi);
    const v = tree.pointVelocity(MAIN, tree.origin(MAIN), new Float64Array(3));
    const vwx = v[0] ?? 0;
    const vwy = v[1] ?? 0;
    // Z-Y-X Euler angles of the main frame: roll about +x is a lean to the right, pitch about +y is nose-down.
    const lean = Math.atan2(Rm[7] ?? 0, Rm[8] ?? 1);
    const pitch = -Math.asin(clamp(Rm[6] ?? 0, -1, 1));
    const rear = tree.origin(REAR_WHEEL);
    return {
      position: [rear[1] ?? 0, 0, rear[0] ?? 0],
      heading: psi,
      forwardSpeed: vwx * fx + vwy * fy,
      lateralSpeed: vwx * fy - vwy * fx,
      yawRate: tree.angularVelocity(MAIN, new Float64Array(3))[2] ?? 0,
      steerAngle: -(q[coordSteer] ?? 0),
      lean,
      riderLean: q[coordRider] ?? 0,
      twist: q[coordTwist] ?? 0,
      pitch,
      lateralAccel: lastAccel[0],
      longitudinalAccel: lastAccel[1],
      steerTorque: held.steerTorque,
      frontLoad: contacts[0].fz,
      rearLoad: contacts[1].fz,
      frontSlip: contacts[0].kappa,
      rearSlip: contacts[1].kappa,
      frontSlipAngle: contacts[0].alpha,
      rearSlipAngle: contacts[1].alpha,
      forkTravel: q[coordFork] ?? 0,
      swingArm: q[coordSwing] ?? 0,
      rpm: (plant[ENGINE] ?? 0) * RPM,
      gear: control.gear,
      wheelie: contacts[0].fz <= 0,
      stoppie: contacts[1].fz <= 0,
    };
  }

  // Equilibrium preloads, then settle at rest (in-plane only) or at the spawn speed.
  function freshPlant(speed: number): Float64Array {
    const x = new Float64Array(size);
    const origin = tree.bodies[MAIN]?.origin ?? [0, 0, 0];
    x[0] = origin[0];
    x[1] = origin[1];
    x[2] = origin[2];
    x[3] = 1;
    x[qd(3)] = speed;
    x[qd(dofRear)] = speed / (-spec.rear.center[1]);
    x[qd(dofFront)] = speed / (-spec.front.center[1]);
    x[ENGINE] = idle;
    return x;
  }
  {
    plant = freshPlant(0);
    held.locked = false;
    held.feet = 0;
    // The springs' preloads hold the published pose under the static loads.
    derivative(plant, scratch);
    const residual = new Float64Array(nu);
    tree.forcing(residual);
    forkPreload = residual[dofFork] ?? 0;
    swingPreload = residual[dofSwing] ?? 0;
  }

  /** Zero the out-of-plane states so a settle at rest stays upright. */
  function symmetrize(): void {
    plant[1] = tree.bodies[MAIN]?.origin[1] ?? 0;
    const qw = plant[3] ?? 1;
    const qy = plant[5] ?? 0;
    const n = Math.hypot(qw, qy) || 1;
    plant[3] = qw / n;
    plant[4] = 0;
    plant[5] = qy / n;
    plant[6] = 0;
    plant[coordRider] = 0;
    plant[coordTwist] = 0;
    plant[coordSteer] = 0;
    for (const k of [0, 2, 4, dofRider, dofTwist, dofSteer]) plant[qd(k)] = 0;
    plant[TIRE + 1] = 0;
    plant[TIRE + 3] = 0;
  }

  const spawnSpeed = options.speed ?? 0;
  let settledDrive = 0;
  function settle(): void {
    plant = freshPlant(spawnSpeed);
    control = freshControl();
    if (spawnSpeed > 0) {
      control.gear = options.gear ?? gearFor(spawnSpeed);
      control.clutchLocked = true;
      plant[ENGINE] = ratioOf(control.gear) * (spawnSpeed / -spec.rear.center[1]);
    }
    const target = spawnSpeed;
    let integral = 0;
    settledDrive = 0;
    for (let i = 0; i < 1500; i++) {
      const error = (plant[qd(3)] ?? 0) - target;
      integral += error * CONTROL_STEP;
      const drive = target > 0 ? -500 * error - 1000 * integral : 0;
      settledDrive = drive;
      controlStep(target > 0 ? { driveTorque: drive, feet: false } : { brake: 0, feet: false, driveTorque: 0 });
      for (let k = 0; k < substeps; k++) advance();
      symmetrize();
      if (target === 0) {
        plant[0] = tree.bodies[MAIN]?.origin[0] ?? 0;
        plant[qd(3)] = 0;
        plant[qd(5)] = (plant[qd(5)] ?? 0) * 0.98;
        plant[qd(dofRear)] = 0;
        plant[qd(dofFront)] = 0;
        plant[TIRE] = 0;
        plant[TIRE + 2] = 0;
      }
    }
    // Put the rear contact at the spawn origin.
    const shift = (plant[0] ?? 0) - (tree.bodies[MAIN]?.origin[0] ?? 0);
    plant[0] = (plant[0] ?? 0) - shift;
    plant[ENGINE] = spawnSpeed > 0 ? ratioOf(control.gear) * (plant[qd(dofRear)] ?? 0) : idle;
    control.carry = 0;
    held.wheelTorque = 0;
  }
  function gearFor(speed: number): number {
    const r = -spec.rear.center[1];
    for (let g = 1; g <= pt.ratios.length; g++) if ((speed / r) * ratioOf(g) < upshift * 0.85) return g;
    return pt.ratios.length;
  }
  settle();
  tree.update(plant.subarray(0, nq), plant.subarray(nq, TIRE));
  restPitch = Math.asin(clamp(tree.rotation(MAIN)[6] ?? 0, -1, 1));
  const settledPlant = Float64Array.from(plant);
  const settledControl = { ...control };

  /**
   * Jacobian of the plant at the settled spawn in tangent coordinates: root translation (world), root rotation
   * (small body-axis angles), joint coordinates, velocities, tyre deflections. Controls held at the settled drive.
   */
  function tangentJacobian(): { matrix: Float64Array; size: number; outOfPlane: number[] } {
    const joints = nq - 7;
    const n = 6 + joints + nu + 4;
    const base = Float64Array.from(settledPlant);
    held.steerTorque = 0;
    held.riderLeanTorque = 0;
    held.frontBrake = 0;
    held.rearBrake = 0;
    held.feet = 0;
    held.locked = false;
    held.engineTorque = 0;
    held.clutchTorque = 0;
    held.wheelTorque = settledDrive;
    const x = new Float64Array(size);
    const f = new Float64Array(size);
    const toState = (z: Float64Array) => {
      x.set(base);
      for (let k = 0; k < 3; k++) x[k] = (base[k] ?? 0) + (z[k] ?? 0);
      // q ⊗ (1, δθ/2), normalised.
      const a = (z[3] ?? 0) / 2;
      const b = (z[4] ?? 0) / 2;
      const c = (z[5] ?? 0) / 2;
      const w0 = base[3] ?? 1;
      const x0 = base[4] ?? 0;
      const y0 = base[5] ?? 0;
      const z0 = base[6] ?? 0;
      const qw = w0 - x0 * a - y0 * b - z0 * c;
      const qx = w0 * a + x0 + y0 * c - z0 * b;
      const qy = w0 * b - x0 * c + y0 + z0 * a;
      const qz = w0 * c + x0 * b - y0 * a + z0;
      const norm = Math.hypot(qw, qx, qy, qz);
      x[3] = qw / norm;
      x[4] = qx / norm;
      x[5] = qy / norm;
      x[6] = qz / norm;
      for (let k = 0; k < joints; k++) x[7 + k] = (base[7 + k] ?? 0) + (z[6 + k] ?? 0);
      for (let k = 0; k < nu + 4; k++) x[nq + k] = (base[nq + k] ?? 0) + (z[6 + joints + k] ?? 0);
    };
    const rates = (z: Float64Array, out: Float64Array) => {
      toState(z);
      derivative(x, f);
      for (let k = 0; k < 3; k++) out[k] = f[k] ?? 0;
      for (let k = 0; k < 3; k++) out[3 + k] = x[nq + k] ?? 0;
      for (let k = 0; k < joints; k++) out[6 + k] = f[7 + k] ?? 0;
      for (let k = 0; k < nu + 4; k++) out[6 + joints + k] = f[nq + k] ?? 0;
    };
    const matrix = new Float64Array(n * n);
    const z = new Float64Array(n);
    const plus = new Float64Array(n);
    const minus = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const eps = 1e-6;
      z.fill(0);
      z[j] = eps;
      rates(z, plus);
      z[j] = -eps;
      rates(z, minus);
      for (let i = 0; i < n; i++) matrix[i * n + j] = ((plus[i] ?? 0) - (minus[i] ?? 0)) / (2 * eps);
    }
    // Lateral position, roll, yaw, the out-of-plane joints and their rates, lateral tyre deflections.
    const outOfPlane = [1, 3, 5];
    for (const body of [RIDER, TWIST, STEER]) outOfPlane.push(6 + tree.coordinateOf(body) - 7);
    for (const k of [0, 2, 4]) outOfPlane.push(6 + joints + k);
    for (const body of [RIDER, TWIST, STEER]) outOfPlane.push(6 + joints + tree.dofOf(body));
    outOfPlane.push(6 + joints + nu + 1, 6 + joints + nu + 3);
    return { matrix, size: n, outOfPlane };
  }

  function snapshot(): ReferenceMotorcycleState {
    return { plant: Array.from(plant), ...control };
  }

  const handle: ReferenceMotorcycle = {
    step(dt, controls) {
      const before = lastVelocity;
      const total = Math.max(0, dt);
      control.carry += total;
      while (control.carry >= CONTROL_STEP - 1e-12) {
        controlStep(controls);
        for (let k = 0; k < substeps; k++) advance();
        control.carry -= CONTROL_STEP;
      }
      const out = read();
      const psi = out.heading;
      const v = tree.pointVelocity(MAIN, tree.origin(MAIN), new Float64Array(3));
      const now: [number, number] = [v[0] ?? 0, v[1] ?? 0];
      if (total > 0) {
        const ax = (now[0] - before[0]) / total;
        const ay = (now[1] - before[1]) / total;
        lastAccel = [ax * Math.sin(psi) - ay * Math.cos(psi), ax * Math.cos(psi) + ay * Math.sin(psi)];
      }
      lastVelocity = now;
      return { ...out, lateralAccel: lastAccel[0], longitudinalAccel: lastAccel[1] };
    },
    sample: read,
    velocity() {
      tree.update(plant.subarray(0, nq), plant.subarray(nq, TIRE));
      const v = tree.pointVelocity(MAIN, tree.origin(MAIN), new Float64Array(3));
      return [v[1] ?? 0, v[0] ?? 0];
    },
    pose() {
      tree.update(plant.subarray(0, nq), plant.subarray(nq, TIRE));
      const r = tree.origin(REAR_WHEEL);
      return { position: [r[1] ?? 0, 0, r[0] ?? 0], heading: headingOf(plant) };
    },
    spec: () => spec,
    snapshot,
    restore(next) {
      plant = Float64Array.from(next.plant);
      control = { gear: next.gear, shiftRemaining: next.shiftRemaining, clutchLocked: next.clutchLocked, clutchTime: next.clutchTime, throttleScale: next.throttleScale, frontBrakeLevel: next.frontBrakeLevel, rearBrakeLevel: next.rearBrakeLevel, brakeRamp: next.brakeRamp, carry: next.carry };
    },
    reset() {
      plant = Float64Array.from(settledPlant);
      control = { ...settledControl };
      lastVelocity = [0, 0];
      lastAccel = [0, 0];
    },
  };
  internals.set(handle, { tangentJacobian });
  return handle;
}

