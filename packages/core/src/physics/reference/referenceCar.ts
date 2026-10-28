import type { AxisInput } from "../../input/axisInput";
import { magicFormula, magicFormulaContact, magicFormulaVerticalForce, type MagicFormulaCoefficients, type MagicFormulaTireStep } from "./magicFormulaTire";
import { createRungeKutta4, solveLinearSystem } from "./rungeKutta";
import { createSuspensionSample, createSuspensionTable, solveSuspension, type SuspensionGeometry, type SuspensionSample, type SuspensionTable } from "./suspensionKinematics";

/** One axle's suspension: linkage geometry plus springs, dampers, bar, stops and bushings, rated at the wheel. */
export interface ReferenceAxle {
  /** Left-corner linkage; z above the ground and x from the axle line at design ride height. */
  geometry: SuspensionGeometry;
  /** Spring wheel rate per corner at design ride height, N/m (the coil rate follows from the linkage's motion ratio). */
  wheelRate: number;
  /** Damper rate per corner at the wheel, N·s/m, in compression and extension. */
  bumpDamping: number;
  reboundDamping: number;
  /** Anti-roll bar stiffness, N·m per rad of body roll. */
  antiRollRate: number;
  /** Wheel travel from design to the bump stop and to full droop, m. */
  bumpTravel: number;
  droopTravel: number;
  /** Unsprung mass per corner, kg (wheel, tyre, upright, brake and half the links). */
  unsprungMass: number;
  /** Bushing compliance: steer away from the lateral force, rad/N, and camber toward the outside under inboard force, rad/N. */
  compliance?: { steer?: number; camber?: number };
}

/** Rack-and-pinion steering. */
export interface ReferenceSteering {
  /** Overall ratio, handwheel angle over road-wheel angle at centre. */
  ratio: number;
  /** Handwheel angle at full lock, rad. */
  maxHandwheel: number;
  /** Driver's handwheel speed, rad/s (default `8`). */
  rate?: number;
  /** Steering-system compliance, road-wheel rad per N·m of summed kingpin torque (default `0`). */
  compliance?: number;
}

/** Engine: full-throttle torque by rpm, inertia and closed-throttle drag. */
export interface ReferenceEngine {
  /** Wide-open-throttle crank torque, `[rpm, N·m]` points in rising rpm. */
  torqueCurve: readonly (readonly [number, number])[];
  idleRpm: number;
  /** Fuel cut, rpm. */
  redlineRpm: number;
  /** Crank, flywheel and clutch-cover inertia, kg·m². */
  inertia: number;
  /** Closed-throttle drag torque at redline, N·m (default 18% of peak torque); falls linearly to a third of that at 0 rpm. */
  frictionTorque?: number;
}

/** Gearbox and final drive with a test driver's shifts. */
export interface ReferenceGearbox {
  /** Forward ratios, first to top. */
  ratios: readonly number[];
  finalDrive: number;
  /** Driveline efficiency under drive, `0..1` (default `0.92`). */
  efficiency?: number;
  /** Seconds the clutch is open per shift (default `0.25`). */
  shiftSeconds?: number;
  /** Upshift point, rpm (default 150 below redline). */
  upshiftRpm?: number;
  /** Downshift point while driving, rpm (default 40% of redline). */
  downshiftRpm?: number;
  /** Clutch disc, input shaft and gears as seen at the input shaft, kg·m² (default `0.02`). */
  inputInertia?: number;
}

/** Clutch and the driver's launch. */
export interface ReferenceClutch {
  /** Torque the fully engaged clutch can hold, N·m (default 1.6 × peak engine torque). */
  maxTorque?: number;
  /** Engine speed the driver holds while letting the clutch out from rest, rpm. */
  launchRpm: number;
  /** Seconds the driver takes to let the clutch out at launch (default `0.4`). */
  engageSeconds?: number;
}

/** Differential on the driven axle. */
export type ReferenceDifferential =
  | { kind: "open" }
  | {
      /** Plate-type limited slip: locking torque = preload + ramp share of the axle torque. */
      kind: "clutch";
      preload: number;
      powerLock: number;
      coastLock: number;
    }
  | {
      /** Torsen: the wheels' torques may differ by at most the bias ratio. */
      kind: "torsen";
      biasRatio: number;
    };

/** Service brake, ABS and handbrake. */
export interface ReferenceBrakes {
  /** Total brake torque at full pedal across four wheels, N·m. */
  maxTorque: number;
  /** Share of brake torque on the front axle, `0..1`. */
  frontShare: number;
  /** Slip-tracking anti-lock control (default `true`). */
  abs?: boolean;
  /** Handbrake torque across the rear wheels, N·m (default `2500`). */
  handbrakeTorque?: number;
  /** Brake hydraulic time constant, s (default `0.03`). */
  hydraulicLag?: number;
}

/** Aero, air density 1.225 kg/m³. */
export interface ReferenceAero {
  /** Drag coefficient × frontal area, m². */
  dragArea: number;
  /** Lift coefficient × area at each axle, m²; negative is downforce (default `0`). */
  liftAreaFront?: number;
  liftAreaRear?: number;
}

/** The tyre fitted to all four corners. */
export interface ReferenceTire {
  coefficients: Readonly<MagicFormulaCoefficients>;
  /** Override the file's unloaded radius for a different size, m. */
  unloadedRadius?: number;
  /** Wheel, tyre, hub and rotor polar inertia per corner, kg·m² (default the tyre's `IYY` + 0.45). */
  wheelInertia?: number;
  /** Inflation pressure, Pa (default the file's `INFLPRES`). */
  pressure?: number;
}

/**
 * A real car's physical description for {@link createReferenceCar}. SI units throughout. Every field a manufacturer
 * or magazine publishes is a direct input; the rest are engineering estimates the car's data marks as such.
 */
export interface ReferenceCarSpec {
  /** Test mass including driver, kg. */
  massKg: number;
  /** Static share of weight on the front axle, `0..1`. */
  frontWeight: number;
  /** Centre-of-mass height at design ride, m. */
  comHeight: number;
  wheelbase: number;
  /** Sprung-body inertia about its own centre, kg·m² (defaults from typical radii of gyration). */
  inertia?: { roll: number; pitch: number; yaw: number };
  tire: ReferenceTire;
  front: ReferenceAxle;
  rear: ReferenceAxle;
  steering: ReferenceSteering;
  driven: "front" | "rear";
  engine: ReferenceEngine;
  gearbox: ReferenceGearbox;
  clutch: ReferenceClutch;
  /** Halfshaft torsional stiffness, N·m/rad, and damping, N·m·s/rad, per shaft (defaults `12000`, `25`). */
  halfshaft?: { stiffness?: number; damping?: number };
  differential: ReferenceDifferential;
  brakes: ReferenceBrakes;
  aero: ReferenceAero;
  /** Driver throttle modulation that keeps driven-wheel slip near 0.12 once the clutch is in (default `true`). */
  launchControl?: boolean;
  /** Integration step, s; divides the 1 ms control sample (default `1/2000`). */
  step?: number;
}

/** Spawn pose for {@link createReferenceCar}, in engine world axes (x, y up, z; heading 0 faces +z). */
export interface ReferenceCarOptions {
  position?: readonly [number, number, number];
  heading?: number;
}

/** Serializable state of a {@link ReferenceCar}: the integrator's plant vector plus the driver and controller state. */
export interface ReferenceCarState {
  /** Plant state (see {@link createReferenceCar} for the layout). */
  plant: number[];
  gear: number;
  shiftRemaining: number;
  /** Driver's clutch foot `0..1`, and whether it is letting the clutch out from a launch. */
  clutch: number;
  launching: boolean;
  /** Road-wheel steer command, rad, positive left. */
  steer: number;
  /** Driver throttle modulation share. */
  launchScale: number;
  /** ABS pressure share per wheel. */
  abs: [number, number, number, number];
  /** Time not yet integrated, s. */
  carry: number;
}

/** What one {@link ReferenceCar.tick} reports; the first fields match `VehicleDynamicsStep` so the probes read either. */
export interface ReferenceCarStep {
  position: readonly [number, number, number];
  heading: number;
  /** Speed along the heading, m/s. */
  forwardSpeed: number;
  /** Speed toward the car's right, m/s. */
  lateralSpeed: number;
  /** Heading rate, rad/s (positive turns left, like `VehicleDynamics`). */
  yawRate: number;
  /**
   * Handwheel angle over the overall steering ratio, rad, positive steering right like `AxisInput.steer`: the steer
   * measure of ISO 4138, so steering and bushing compliance count toward understeer as on a real test.
   */
  steerAngle: number;
  /** Mean front road-wheel angle the wheels actually reach, after compliance and kinematics, rad, same sign. */
  roadWheelAngle: number;
  /** Lateral acceleration, m/s², positive toward the right. */
  lateralAccel: number;
  longitudinalAccel: number;
  /** Nose-down pitch, rad. */
  bodyPitch: number;
  /** Roll, rad, positive dropping the right side. */
  bodyRoll: number;
  rpm: number;
  gear: number;
  /** Vertical tyre loads, N (front-left, front-right, rear-left, rear-right). */
  wheelLoads: readonly [number, number, number, number];
  /** Longitudinal slip κ per corner. */
  slipRatios: readonly [number, number, number, number];
  /** Slip angle per corner, rad. */
  slipAngles: readonly [number, number, number, number];
  /** Inclination per corner against the road, rad (automotive camber: negative tops the wheel inboard). */
  cambers: readonly [number, number, number, number];
  airborne: boolean;
}

/**
 * A multibody reference car: the ruler game handling is measured against, not a game runtime. Fits the
 * `HandlingSubject`, `CourseSubject` and `RideSubject` shapes, so the existing probes drive it unchanged.
 */
export interface ReferenceCar {
  tick(dt: number, input: AxisInput): ReferenceCarStep;
  /** World velocity on the ground plane, `[vx, vz]`, m/s (engine axes). */
  velocity(): readonly [number, number];
  pose(): { position: readonly [number, number, number]; heading: number };
  /** Add a world velocity change, m/s (engine axes; `dvy` up). */
  applyImpulse(dvx: number, dvz: number, dvy?: number): void;
  spec(): ReferenceCarSpec;
  snapshot(): ReferenceCarState;
  restore(state: Readonly<ReferenceCarState>): void;
  /** Back to the spawn at rest. */
  reset(): void;
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const RPM = 30 / Math.PI;
const CONTROL_STEP = 1 / 1000;
const ABS_TARGET_SLIP = -0.12;
const ABS_INTEGRAL_GAIN = 10;
const ABS_ONSET_MU = 1;
const ABS_PROPORTIONAL_GAIN = 2;
const CLUTCH_RELEASE_SECONDS = 0.2;
const BUSHING_LAG = 0.01;
const CLUTCH_STICK_BAND = 0.5;
const LAUNCH_SLIP = 0.1;
const BRAKE_STICK_BAND = 0.05;
const STICK_TIME = 0.01;

// Plant layout. Body: position (3, world, internal X Y horizontal, Z up), orientation quaternion [w x y z] (4),
// velocity (3, world), angular velocity (3, world). Per corner (FL FR RL RR): lower-arm angle, its rate, absolute
// wheel spin, contact u, v, φ′, compliance steer, compliance camber. Then engine speed, gearbox input speed, left and
// right halfshaft twist, four brake torques, steering compliance.
const BODY = 13;
const CORNER = 8;
const ENGINE = BODY + 4 * CORNER;
const INPUT = ENGINE + 1;
const SHAFT_L = ENGINE + 2;
const SHAFT_R = ENGINE + 3;
const BRAKE = ENGINE + 4;
const RACK = BRAKE + 4;
const PLANT_SIZE = RACK + 1;

interface Corner {
  front: boolean;
  /** +1 left, −1 right. */
  side: 1 | -1;
  axle: ReferenceAxle;
  table: SuspensionTable;
  /** Body-frame offset added to the (mirrored) linkage point, m. */
  offset: [number, number, number];
  thetaMin: number;
  thetaMax: number;
  /** Wheel-centre height (linkage z) at design, for wheel travel. */
  designZ: number;
  springRate: number;
  springPreload: number;
  designSpring: number;
  bumpDamper: number;
  reboundDamper: number;
  barRate: number;
  unsprung: number;
  sample: SuspensionSample;
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

function peakTorque(curve: readonly (readonly [number, number])[]): number {
  let peak = 0;
  for (const point of curve) peak = Math.max(peak, point[1]);
  return peak;
}

/**
 * Creates a {@link ReferenceCar}: a multibody car integrated with classical fourth-order Runge–Kutta (default 0.5 ms;
 * halving the step converges at fourth order between control samples) and a 1 kHz driver/controller sample.
 *
 * - Sprung body: 6 DOF, quaternion attitude, full inertia tensor and gyroscopic terms.
 * - Four corners, each one DOF (the lower-arm angle) guided by a double-wishbone or MacPherson linkage solved from
 *   hardpoints, so camber, toe, track, motion ratio, roll centre, anti-dive and anti-squat all follow from geometry.
 *   Unsprung masses couple to the body through the full mass matrix (Kane's equations); coil-overs, bump and droop
 *   stops, anti-roll bars, and first-order rubber bushings for compliance steer and camber.
 * - Rack steering through the linkage (Ackermann and bump steer emerge) with steering-system compliance.
 * - The Magic Formula 6.1 tyre with relaxation-length contact dynamics, turn slip, rolling resistance, overturning
 *   moment and the MF 6.1 vertical load model, at each corner's own camber, load, speed and spin.
 * - Driveline: engine inertia and torque curve, a Karnopp stick–slip clutch, gearbox input inertia, gear and final
 *   drive with efficiency, open, plate-LSD or Torsen differential, compliant halfshafts. Karnopp stick–slip brakes
 *   with hydraulic lag and slip-tracking ABS.
 *
 * Not modelled: rotating-part gyroscopics and their reaction on the body, upright rotational inertia, tyre
 * temperature (no published thermal model for the tyre), and road surface beyond a flat plane.
 * @capability reference-car multibody reference car on Magic Formula tires and real suspension kinematics — the physics ruler for game vehicle handling
 */
export function createReferenceCar(spec: ReferenceCarSpec, options: ReferenceCarOptions = {}): ReferenceCar {
  const tire: MagicFormulaCoefficients = { ...spec.tire.coefficients, unloadedRadius: spec.tire.unloadedRadius ?? spec.tire.coefficients.unloadedRadius };
  const pressure = spec.tire.pressure ?? tire.inflpres;
  const r0 = tire.unloadedRadius;
  const substeps = Math.max(1, Math.round(CONTROL_STEP / (spec.step ?? 1 / 2000)));
  const h = CONTROL_STEP / substeps;
  const mass = spec.massKg;
  const L = spec.wheelbase;
  const wheelInertia = spec.tire.wheelInertia ?? tire.iyy + 0.45;
  const engineInertia = spec.engine.inertia;
  const inputInertia = spec.gearbox.inputInertia ?? 0.02;
  const enginePeak = peakTorque(spec.engine.torqueCurve);
  const engineFriction = spec.engine.frictionTorque ?? 0.18 * enginePeak;
  const idle = spec.engine.idleRpm / RPM;
  const redline = spec.engine.redlineRpm / RPM;
  const launchSpin = spec.clutch.launchRpm / RPM;
  const clutchMax = spec.clutch.maxTorque ?? 1.6 * enginePeak;
  const engageSeconds = spec.clutch.engageSeconds ?? 0.4;
  const gears = spec.gearbox.ratios;
  const efficiency = spec.gearbox.efficiency ?? 0.92;
  const shiftSeconds = spec.gearbox.shiftSeconds ?? 0.25;
  const upshift = (spec.gearbox.upshiftRpm ?? spec.engine.redlineRpm - 150) / RPM;
  const downshift = (spec.gearbox.downshiftRpm ?? 0.4 * spec.engine.redlineRpm) / RPM;
  const shaftK = spec.halfshaft?.stiffness ?? 12000;
  const shaftC = spec.halfshaft?.damping ?? 25;
  const absOn = spec.brakes.abs ?? true;
  const handbrakeTorque = spec.brakes.handbrakeTorque ?? 2500;
  const hydraulicLag = spec.brakes.hydraulicLag ?? 0.03;
  const launchControl = spec.launchControl ?? true;
  const handwheelRate = spec.steering.rate ?? 8;
  const steerCompliance = spec.steering.compliance ?? 0;

  // Static tyre deflection and loaded height per axle.
  const staticLoad = (front: boolean) => (mass * GRAVITY * (front ? spec.frontWeight : 1 - spec.frontWeight)) / 2;
  const deflectionFor = (fz: number) => {
    let lo = 0;
    let hi = 0.1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (magicFormulaVerticalForce(tire, { deflection: mid, pressure }) < fz) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };

  // Mass properties: unsprung masses ride at their wheel centres; the body origin is the sprung centre.
  const muFront = spec.front.unsprungMass;
  const muRear = spec.rear.unsprungMass;
  const sprung = mass - 2 * (muFront + muRear);
  const xFrontTotal = L * (1 - spec.frontWeight);
  const xRearTotal = -L * spec.frontWeight;
  const xs = -(2 * muFront * xFrontTotal + 2 * muRear * xRearTotal) / sprung;
  const designPose = (axle: ReferenceAxle) => solveSuspension(axle.geometry, 0, 0);
  const loadedHeight = (front: boolean) => {
    const pose = designPose(front ? spec.front : spec.rear);
    const a = pose.axle;
    const dz = -Math.sqrt(Math.max(0, 1 - (a[2] ?? 0) ** 2));
    return (r0 - deflectionFor(staticLoad(front))) * -dz;
  };
  const hFront = loadedHeight(true);
  const hRear = loadedHeight(false);
  const hs = (mass * spec.comHeight - 2 * (muFront * hFront + muRear * hRear)) / sprung;
  const rollInertia = spec.inertia?.roll ?? sprung * 0.27 ** 2 * 3.4;
  const pitchInertia = spec.inertia?.pitch ?? sprung * (0.46 * L) ** 2;
  const yawInertia = spec.inertia?.yaw ?? sprung * (0.47 * L) ** 2;

  const buildCorner = (front: boolean, side: 1 | -1): Corner => {
    const axle = front ? spec.front : spec.rear;
    const g = axle.geometry;
    const pose = designPose(axle);
    const height = front ? hFront : hRear;
    const xAxle = (front ? xFrontTotal : xRearTotal) - xs;
    // Shift the linkage so the static wheel centre sits at its loaded height above the ground plane z = −hs.
    const offset: [number, number, number] = [xAxle, 0, height - (pose.wheelCenter[2] ?? 0) - hs];
    const span = Math.max(axle.bumpTravel, axle.droopTravel) * 2.2;
    const radius = Math.hypot((g.lowerBallJoint[1] ?? 0) - (g.lowerFront[1] ?? 0), (g.lowerBallJoint[2] ?? 0) - (g.lowerFront[2] ?? 0));
    const thetaSpan = Math.min(0.9, span / Math.max(0.1, radius));
    const rackTravel = front ? 0.06 : 0;
    const table = createSuspensionTable(g, { thetaMin: -thetaSpan, thetaMax: thetaSpan, rackTravel });
    const sample = createSuspensionSample();
    table.sample(0, 0, sample);
    const motion = sample.dSpringLength / (sample.dw[2] ?? 1);
    const springRate = axle.wheelRate / (motion * motion);
    const track = 2 * (pose.wheelCenter[1] ?? 0);
    return {
      front,
      side,
      axle,
      table,
      offset,
      thetaMin: -thetaSpan,
      thetaMax: thetaSpan,
      designZ: sample.w[2] ?? 0,
      springRate,
      springPreload: 0,
      designSpring: sample.springLength,
      bumpDamper: axle.bumpDamping / (motion * motion),
      reboundDamper: axle.reboundDamping / (motion * motion),
      barRate: axle.antiRollRate / (track * track),
      unsprung: axle.unsprungMass,
      sample,
    };
  };
  const corners: readonly [Corner, Corner, Corner, Corner] = [buildCorner(true, 1), buildCorner(true, -1), buildCorner(false, 1), buildCorner(false, -1)];

  // Rack travel per road-wheel radian of left steer at centre, from the linkage.
  const left = solveSuspension(spec.front.geometry, 0, 0.001);
  const right = solveSuspension(spec.front.geometry, 0, -0.001);
  const toeOf = (a: readonly number[]) => Math.atan2(-(a[0] ?? 0), a[1] ?? 0);
  const rackPerRadian = 0.002 / (toeOf(left.axle) - toeOf(right.axle));

  // Spring preload from the static balance of each corner's lower-arm equation.
  for (const c of corners) {
    const s = c.sample;
    c.table.sample(0, 0, s);
    const fz = staticLoad(c.front);
    // Contact point moves with the wheel centre plus the upright's rotation about it.
    const height = c.front ? hFront : hRear;
    const a = s.axle;
    const d = [(a[2] ?? 0) * (a[0] ?? 0), (a[2] ?? 0) * (a[1] ?? 0), -1 + (a[2] ?? 0) ** 2];
    const dn = Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0);
    const lever = height / Math.max(1e-6, -(d[2] ?? -1) / dn);
    const sp = s.spin;
    const dpz = (s.dw[2] ?? 0) + (((sp[0] ?? 0) * (d[1] ?? 0) - (sp[1] ?? 0) * (d[0] ?? 0)) * lever) / dn;
    c.springPreload = -(fz * dpz - c.unsprung * GRAVITY * (s.dw[2] ?? 0)) / s.dSpringLength;
  }

  const spawnHeading = options.heading ?? 0;
  const spawn = options.position ?? [0, 0, 0];
  const freshPlant = (): Float64Array => {
    const x = new Float64Array(PLANT_SIZE);
    // Engine (x, y, z) is internal (Y, Z, X); internal heading ψ faces +X at ψ = 0, engine heading 0 faces +z.
    x[0] = spawn[2];
    x[1] = spawn[0];
    x[2] = hs;
    x[3] = Math.cos(spawnHeading / 2);
    x[6] = Math.sin(spawnHeading / 2);
    x[ENGINE] = idle;
    x[INPUT] = 0;
    return x;
  };

  const drivenLeft = spec.driven === "front" ? 0 : 2;
  const drivenRight = drivenLeft + 1;

  interface Control {
    gear: number;
    shiftRemaining: number;
    clutch: number;
    launching: boolean;
    steer: number;
    launchScale: number;
    abs: [number, number, number, number];
    carry: number;
  }
  const freshControl = (): Control => ({ gear: 1, shiftRemaining: 0, clutch: 0, launching: false, steer: 0, launchScale: 1, abs: [-1, -1, -1, -1], carry: 0 });
  let plant = freshPlant();
  let control = freshControl();
  // Held over each control sample.
  let throttle = 0;
  let brakeCommand: [number, number, number, number] = [0, 0, 0, 0];
  let clutchCapacity = 0;

  // Scratch for the derivative.
  const mass10 = new Float64Array(100);
  const rhs10 = new Float64Array(10);
  const k1 = new Float64Array(PLANT_SIZE);
  const integrator = createRungeKutta4(PLANT_SIZE);
  const plantDerivative = (x: Float64Array, out: Float64Array) => derivative(x, out, false);
  type Quad = [number, number, number, number];
  const report: { loads: Quad; slips: Quad; angles: Quad; cambers: Quad; steer: number; airborne: boolean } = {
    loads: [0, 0, 0, 0],
    slips: [0, 0, 0, 0],
    angles: [0, 0, 0, 0],
    cambers: [0, 0, 0, 0],
    steer: 0,
    airborne: false,
  };
  const kingpin: [number, number, number, number] = [0, 0, 0, 0];
  const wheelSpinAccel: [number, number, number, number] = [0, 0, 0, 0];
  const relSpin: [number, number, number, number] = [0, 0, 0, 0];
  const shaftTorque: [number, number, number, number] = [0, 0, 0, 0];
  const corner = { force: [0, 0, 0], moment: [0, 0, 0], point: [0, 0, 0] };

  /** Plant right-hand side: `out = f(x)` with the controls held. */
  function derivative(x: Float64Array, out: Float64Array, record: boolean): void {
    out.fill(0);
    const qw = x[3] ?? 1;
    const qx = x[4] ?? 0;
    const qy = x[5] ?? 0;
    const qz = x[6] ?? 0;
    const r00 = 1 - 2 * (qy * qy + qz * qz);
    const r01 = 2 * (qx * qy - qw * qz);
    const r02 = 2 * (qx * qz + qw * qy);
    const r10 = 2 * (qx * qy + qw * qz);
    const r11 = 1 - 2 * (qx * qx + qz * qz);
    const r12 = 2 * (qy * qz - qw * qx);
    const r20 = 2 * (qx * qz - qw * qy);
    const r21 = 2 * (qy * qz + qw * qx);
    const r22 = 1 - 2 * (qx * qx + qy * qy);
    const toWorld = (v: readonly number[], o: number[]) => {
      const a = v[0] ?? 0;
      const b = v[1] ?? 0;
      const c = v[2] ?? 0;
      o[0] = r00 * a + r01 * b + r02 * c;
      o[1] = r10 * a + r11 * b + r12 * c;
      o[2] = r20 * a + r21 * b + r22 * c;
      return o;
    };
    const pz = x[2] ?? 0;
    const vx = x[7] ?? 0;
    const vy = x[8] ?? 0;
    const vz = x[9] ?? 0;
    const wx = x[10] ?? 0;
    const wy = x[11] ?? 0;
    const wz = x[12] ?? 0;

    mass10.fill(0);
    rhs10.fill(0);
    // Sprung body: m·V̇ and I·Ω̇ + Ω×IΩ, inertia rotated to world.
    for (let k = 0; k < 3; k++) mass10[k * 10 + k] = mass;
    const ib = [rollInertia, pitchInertia, yawInertia];
    const rot = [r00, r01, r02, r10, r11, r12, r20, r21, r22];
    const iw = new Array<number>(9).fill(0);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        let sum = 0;
        for (let k = 0; k < 3; k++) sum += (rot[a * 3 + k] ?? 0) * (ib[k] ?? 0) * (rot[b * 3 + k] ?? 0);
        iw[a * 3 + b] = sum;
        mass10[(3 + a) * 10 + 3 + b] = sum;
      }
    const iwx = (iw[0] ?? 0) * wx + (iw[1] ?? 0) * wy + (iw[2] ?? 0) * wz;
    const iwy = (iw[3] ?? 0) * wx + (iw[4] ?? 0) * wy + (iw[5] ?? 0) * wz;
    const iwz = (iw[6] ?? 0) * wx + (iw[7] ?? 0) * wy + (iw[8] ?? 0) * wz;
    rhs10[3] = -(wy * iwz - wz * iwy);
    rhs10[4] = -(wz * iwx - wx * iwz);
    rhs10[5] = -(wx * iwy - wy * iwx);
    rhs10[2] = -mass * GRAVITY;

    // Aero: drag at the centre, lift at each axle.
    const speed = Math.hypot(vx, vy);
    rhs10[0] = (rhs10[0] ?? 0) - 0.5 * AIR_DENSITY * spec.aero.dragArea * speed * vx;
    rhs10[1] = (rhs10[1] ?? 0) - 0.5 * AIR_DENSITY * spec.aero.dragArea * speed * vy;
    const q = 0.5 * AIR_DENSITY * speed * speed;
    for (const [lift, xb] of [
      [spec.aero.liftAreaFront ?? 0, xFrontTotal - xs],
      [spec.aero.liftAreaRear ?? 0, xRearTotal - xs],
    ] as const) {
      if (lift === 0) continue;
      const fzA = q * lift;
      rhs10[2] = (rhs10[2] ?? 0) + fzA;
      rhs10[3] = (rhs10[3] ?? 0) + r10 * xb * fzA;
      rhs10[4] = (rhs10[4] ?? 0) - r00 * xb * fzA;
    }

    const rackNow = (control.steer + (x[RACK] ?? 0)) * rackPerRadian;
    const travel: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      if (c === undefined) continue;
      const theta = x[BODY + i * CORNER] ?? 0;
      c.table.sample(theta, c.front ? c.side * rackNow : 0, c.sample);
      travel[i] = (c.sample.w[2] ?? 0) - c.designZ;
    }

    // Driven wheels' spin relative to their uprights, so the driveline sees this state's speeds before the wheels do.
    for (const i of [drivenLeft, drivenRight]) {
      const c = corners[i];
      if (c === undefined) continue;
      const s = c.sample;
      const base = BODY + i * CORNER;
      const thetaDot = x[base + 1] ?? 0;
      const side = c.side;
      const sx = side * (s.spin[0] ?? 0);
      const sy = s.spin[1] ?? 0;
      const sz = side * (s.spin[2] ?? 0);
      const ox = side * (r00 * (s.axle[0] ?? 0) + r01 * side * (s.axle[1] ?? 0) + r02 * (s.axle[2] ?? 0));
      const oy = side * (r10 * (s.axle[0] ?? 0) + r11 * side * (s.axle[1] ?? 0) + r12 * (s.axle[2] ?? 0));
      const oz = side * (r20 * (s.axle[0] ?? 0) + r21 * side * (s.axle[1] ?? 0) + r22 * (s.axle[2] ?? 0));
      const uwx = wx + (r00 * sx + r01 * sy + r02 * sz) * thetaDot;
      const uwy = wy + (r10 * sx + r11 * sy + r12 * sz) * thetaDot;
      const uwz = wz + (r20 * sx + r21 * sy + r22 * sz) * thetaDot;
      relSpin[i] = (x[base + 2] ?? 0) - (uwx * ox + uwy * oy + uwz * oz);
    }
    driveline(x, out);

    let airborne = true;
    let steerSum = 0;
    const tmpA = [0, 0, 0];
    const tmpB = [0, 0, 0];
    const tmpC = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      if (c === undefined) continue;
      const base = BODY + i * CORNER;
      const thetaDot = x[base + 1] ?? 0;
      const spinAbs = x[base + 2] ?? 0;
      const s = c.sample;
      const side = c.side;
      // Mirror the left-corner linkage for the right side: y flips for points, x and z flip for axial vectors.
      const pb = [(s.w[0] ?? 0) + c.offset[0], side * (s.w[1] ?? 0), (s.w[2] ?? 0) + c.offset[2]];
      const r = toWorld(pb, [0, 0, 0]);
      const e = toWorld([s.dw[0] ?? 0, side * (s.dw[1] ?? 0), s.dw[2] ?? 0], [0, 0, 0]);
      const ee = toWorld([s.ddw[0] ?? 0, side * (s.ddw[1] ?? 0), s.ddw[2] ?? 0], [0, 0, 0]);
      const upSpin = toWorld([side * (s.spin[0] ?? 0), s.spin[1] ?? 0, side * (s.spin[2] ?? 0)], [0, 0, 0]);
      // Spin axis pointing to the car's left, rotated by bushing compliance steer and camber.
      const outboard = toWorld([s.axle[0] ?? 0, side * (s.axle[1] ?? 0), s.axle[2] ?? 0], [0, 0, 0]);
      let ax = side * (outboard[0] ?? 0);
      let ay = side * (outboard[1] ?? 0);
      let az = side * (outboard[2] ?? 0);
      const toeC = x[base + 6] ?? 0;
      if (toeC !== 0) {
        const cs = Math.cos(toeC);
        const sn = Math.sin(toeC);
        const nx = ax * cs - ay * sn;
        ay = ax * sn + ay * cs;
        ax = nx;
      }
      let hx = ay;
      let hy = -ax;
      const hn = Math.hypot(hx, hy) || 1;
      hx /= hn;
      hy /= hn;
      const camberC = x[base + 7] ?? 0;
      if (camberC !== 0) {
        // Rotate the axle about the heading so the top moves outboard by camberC.
        const angle = -side * camberC;
        const cs = Math.cos(angle);
        const sn = Math.sin(angle);
        const kx = ax;
        const ky = ay;
        const kz = az;
        // Rodrigues about unit (hx, hy, 0).
        const kdot = hx * kx + hy * ky;
        const crx = hy * kz;
        const cry = -hx * kz;
        const crz = hx * ky - hy * kx;
        ax = kx * cs + crx * sn + hx * kdot * (1 - cs);
        ay = ky * cs + cry * sn + hy * kdot * (1 - cs);
        az = kz * cs + crz * sn;
      }
      const gamma = Math.asin(clamp(az, -1, 1));
      const yx = -hy;
      const yy = hx;
      // In-plane downward direction and the contact point on flat ground.
      let dx = az * ax;
      let dy = az * ay;
      let dz = -1 + az * az;
      const dn = Math.hypot(dx, dy, dz) || 1;
      dx /= dn;
      dy /= dn;
      dz /= dn;
      const wcz = pz + (r[2] ?? 0);
      const lever = wcz / Math.max(1e-6, -dz);
      const deflection = r0 - lever;
      const px = (r[0] ?? 0) + lever * dx;
      const py = (r[1] ?? 0) + lever * dy;
      const pzr = (r[2] ?? 0) + lever * dz;
      // Velocities: wheel centre and the upright point at the contact.
      const uwx = wx + (upSpin[0] ?? 0) * thetaDot;
      const uwy = wy + (upSpin[1] ?? 0) * thetaDot;
      const uwz = wz + (upSpin[2] ?? 0) * thetaDot;
      const vwx = vx + (wy * (r[2] ?? 0) - wz * (r[1] ?? 0)) + (e[0] ?? 0) * thetaDot;
      const vwy = vy + (wz * (r[0] ?? 0) - wx * (r[2] ?? 0)) + (e[1] ?? 0) * thetaDot;
      const vwz = vz + (wx * (r[1] ?? 0) - wy * (r[0] ?? 0)) + (e[2] ?? 0) * thetaDot;
      const lx = lever * dx;
      const ly = lever * dy;
      const lz = lever * dz;
      const vpx = vwx + (uwy * lz - uwz * ly);
      const vpy = vwy + (uwz * lx - uwx * lz);
      const vLong = vpx * hx + vpy * hy;
      const vLat = vpx * yx + vpy * yy;
      const uprightAxial = uwx * ax + uwy * ay + uwz * az;
      const spinRel = spinAbs - uprightAxial;
      relSpin[i] = spinRel;
      const deflectionRate = dz !== 0 ? vwz / dz : 0;
      const contactState = { u: x[base + 3] ?? 0, v: x[base + 4] ?? 0, phi: x[base + 5] ?? 0 };
      const sideName = side === 1 ? "left" : "right";
      let forces: MagicFormulaTireStep | undefined;
      let fz = 0;
      let rates = { du: 0, dv: 0, dphi: 0 };
      if (deflection > 0) {
        airborne = false;
        let fx = 0;
        let fy = 0;
        for (let pass = 0; pass < 2; pass++) {
          fz = magicFormulaVerticalForce(tire, { deflection, deflectionRate, spin: spinAbs, fx, fy, pressure });
          const result = magicFormulaContact(tire, contactState, { vx: vLong, vy: vLat, spin: spinAbs, fz, gamma, yawRate: uwz, pressure }, { side: sideName, lowSpeedDamping: lowSpeedDamping(fz) });
          forces = result.forces;
          rates = { du: result.du, dv: result.dv, dphi: result.dphi };
          fx = forces.fx;
          fy = forces.fy;
        }
      } else {
        // Off the ground the contact deflections relax.
        rates = { du: -contactState.u * 50, dv: -contactState.v * 50, dphi: -contactState.phi * 50 };
      }
      out[base + 3] = rates.du;
      out[base + 4] = rates.dv;
      out[base + 5] = rates.dphi;
      const fx = forces?.fx ?? 0;
      const fy = forces?.fy ?? 0;
      const mxT = forces?.mx ?? 0;
      const myT = forces?.my ?? 0;
      const mzT = forces?.mz ?? 0;
      const Fx = fx * hx + fy * yx;
      const Fy = fx * hy + fy * yy;
      const Fz = fz;
      const Mx = mxT * hx + myT * yx;
      const My = mxT * hy + myT * yy;
      const Mz = mzT;
      corner.force[0] = Fx;
      corner.force[1] = Fy;
      corner.force[2] = Fz;

      // Wheel spin: halfshaft, brake (Karnopp stick–slip on the spin relative to the upright), contact moments.
      const rollTorque = (ly * Fz - lz * Fy) * ax + (lz * Fx - lx * Fz) * ay + (lx * Fy - ly * Fx) * az + (Mx * ax + My * ay + Mz * az);
      const hsTorque = shaftTorque[i] ?? 0;
      const brakeCap = Math.max(0, x[BRAKE + i] ?? 0);
      const other = rollTorque + hsTorque;
      let brakeTorque: number;
      if (Math.abs(spinRel) > BRAKE_STICK_BAND) brakeTorque = -brakeCap * Math.sign(spinRel);
      else brakeTorque = clamp(-other - (wheelInertia * spinRel) / STICK_TIME, -brakeCap, brakeCap);
      const spinAccel = (other + brakeTorque) / wheelInertia;
      out[base + 2] = spinAccel;
      wheelSpinAccel[i] = spinAccel;

      // Kane: mass-matrix couplings of the unsprung point mass and the generalized forces.
      const m = c.unsprung;
      const rx = r[0] ?? 0;
      const ry = r[1] ?? 0;
      const rz = r[2] ?? 0;
      const ex = e[0] ?? 0;
      const ey = e[1] ?? 0;
      const ez = e[2] ?? 0;
      // Velocity-dependent acceleration of the wheel centre: Ω×(Ω×r) + 2Ω×(e·θ̇) + (d²w/dθ²)·θ̇².
      const owx = wy * rz - wz * ry;
      const owy = wz * rx - wx * rz;
      const owz = wx * ry - wy * rx;
      const cx = wy * owz - wz * owy + 2 * (wy * ez - wz * ey) * thetaDot + (ee[0] ?? 0) * thetaDot * thetaDot;
      const cy = wz * owx - wx * owz + 2 * (wz * ex - wx * ez) * thetaDot + (ee[1] ?? 0) * thetaDot * thetaDot;
      const cz = wx * owy - wy * owx + 2 * (wx * ey - wy * ex) * thetaDot + (ee[2] ?? 0) * thetaDot * thetaDot;
      const row = 6 + i;
      // Linear rows.
      const skew = [0, -rz, ry, rz, 0, -rx, -ry, rx, 0];
      for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
          const sab = skew[a * 3 + b] ?? 0;
          mass10[a * 10 + 3 + b] = (mass10[a * 10 + 3 + b] ?? 0) - m * sab;
          mass10[(3 + a) * 10 + b] = (mass10[(3 + a) * 10 + b] ?? 0) + m * sab;
          let s2 = 0;
          for (let k = 0; k < 3; k++) s2 += (skew[a * 3 + k] ?? 0) * (skew[k * 3 + b] ?? 0);
          mass10[(3 + a) * 10 + 3 + b] = (mass10[(3 + a) * 10 + 3 + b] ?? 0) - m * s2;
        }
      }
      const rex = ry * ez - rz * ey;
      const rey = rz * ex - rx * ez;
      const rez = rx * ey - ry * ex;
      const evec = [ex, ey, ez];
      const revec = [rex, rey, rez];
      for (let k = 0; k < 3; k++) {
        mass10[k * 10 + row] = m * (evec[k] ?? 0);
        mass10[row * 10 + k] = m * (evec[k] ?? 0);
        mass10[(3 + k) * 10 + row] = m * (revec[k] ?? 0);
        mass10[row * 10 + 3 + k] = m * (revec[k] ?? 0);
      }
      mass10[row * 10 + row] = m * (ex * ex + ey * ey + ez * ez);
      const gravityZ = -m * GRAVITY;
      // Contact point relative to the body centre.
      const prx = px;
      const pry = py;
      const prz = pzr;
      rhs10[0] = (rhs10[0] ?? 0) + Fx - m * cx;
      rhs10[1] = (rhs10[1] ?? 0) + Fy - m * cy;
      rhs10[2] = (rhs10[2] ?? 0) + Fz - m * cz;
      const inertialTorque = wheelInertia * spinAccel;
      rhs10[3] = (rhs10[3] ?? 0) + (pry * Fz - prz * Fy) + Mx - inertialTorque * ax + ry * gravityZ - m * (ry * cz - rz * cy);
      rhs10[4] = (rhs10[4] ?? 0) + (prz * Fx - prx * Fz) + My - inertialTorque * ay - rx * gravityZ - m * (rz * cx - rx * cz);
      rhs10[5] = (rhs10[5] ?? 0) + (prx * Fy - pry * Fx) + Mz - inertialTorque * az - m * (rx * cy - ry * cx);
      // Generalized force on the lower-arm angle.
      const usx = (upSpin[0] ?? 0);
      const usy = (upSpin[1] ?? 0);
      const usz = (upSpin[2] ?? 0);
      const epx = ex + (usy * lz - usz * ly);
      const epy = ey + (usz * lx - usx * lz);
      const epz = ez + (usx * ly - usy * lx);
      const uprightTorqueX = Mx + (hsTorque - inertialTorque) * ax;
      const uprightTorqueY = My + (hsTorque - inertialTorque) * ay;
      const uprightTorqueZ = Mz + (hsTorque - inertialTorque) * az;
      const dzw = s.dw[2] ?? 0;
      const springLength = s.springLength;
      const springRate = s.dSpringLength;
      const compression = c.designSpring - springLength;
      const springForce = c.springPreload + c.springRate * compression;
      const lengthRate = springRate * thetaDot;
      const damper = lengthRate < 0 ? -c.bumpDamper * lengthRate : -c.reboundDamper * lengthRate;
      let generalized = Fx * epx + Fy * epy + Fz * epz + uprightTorqueX * usx + uprightTorqueY * usy + uprightTorqueZ * usz + gravityZ * ez - m * (ex * cx + ey * cy + ez * cz);
      generalized += (springForce + damper) * springRate;
      const t = travel[i] ?? 0;
      if (t > c.axle.bumpTravel) {
        const over = t - c.axle.bumpTravel;
        generalized -= (8 * c.axle.wheelRate * over + 3e7 * over * over) * dzw;
      }
      if (t < -c.axle.droopTravel) generalized += 30 * c.axle.wheelRate * (-c.axle.droopTravel - t) * dzw;
      const partner = c.side === 1 ? i + 1 : i - 1;
      generalized -= c.barRate * (t - (travel[partner] ?? 0)) * dzw;
      rhs10[row] = (rhs10[row] ?? 0) + generalized;
      out[base] = thetaDot;

      // Bushings and the steering column react on this corner's forces.
      const lateralBody = Fx * r01 + Fy * r11;
      const compliance = c.axle.compliance;
      out[base + 6] = ((compliance?.steer ?? 0) * -lateralBody - toeC) / BUSHING_LAG;
      out[base + 7] = ((compliance?.camber ?? 0) * -side * lateralBody - camberC) / BUSHING_LAG;
      if (c.front) {
        const kp = toWorld([s.kingpinPoint[0] ?? 0, side * (s.kingpinPoint[1] ?? 0), s.kingpinPoint[2] ?? 0], tmpA);
        const kpa = toWorld([s.kingpinAxis[0] ?? 0, side * (s.kingpinAxis[1] ?? 0), s.kingpinAxis[2] ?? 0], tmpB);
        const kpx = (kp[0] ?? 0) + c.offset[0] * r00 + c.offset[2] * r02;
        const kpy = (kp[1] ?? 0) + c.offset[0] * r10 + c.offset[2] * r12;
        const kpz = (kp[2] ?? 0) + c.offset[0] * r20 + c.offset[2] * r22;
        const ox = px - kpx;
        const oy = py - kpy;
        const oz = pzr - kpz;
        tmpC[0] = oy * Fz - oz * Fy + Mx;
        tmpC[1] = oz * Fx - ox * Fz + My;
        tmpC[2] = ox * Fy - oy * Fx + Mz;
        kingpin[i] = (kpa[0] ?? 0) * (tmpC[0] ?? 0) + (kpa[1] ?? 0) * (tmpC[1] ?? 0) + (kpa[2] ?? 0) * (tmpC[2] ?? 0);
        steerSum += Math.atan2(r00 * hy - r10 * hx, hx * r00 + hy * r10);
      }
      if (record) {
        report.loads[i] = fz;
        report.slips[i] = forces?.kappa ?? 0;
        report.angles[i] = forces?.alpha ?? 0;
        report.cambers[i] = side === 1 ? -gamma : gamma;
      }
    }
    if (record) {
      report.steer = steerSum / 2;
      report.airborne = airborne;
    }
    out[RACK] = (steerCompliance * ((kingpin[0] ?? 0) + (kingpin[1] ?? 0)) - (x[RACK] ?? 0)) / BUSHING_LAG;

    solveLinearSystem(mass10, rhs10, 10);
    out[0] = vx;
    out[1] = vy;
    out[2] = vz;
    out[3] = 0.5 * (-wx * qx - wy * qy - wz * qz);
    out[4] = 0.5 * (wx * qw + wy * qz - wz * qy);
    out[5] = 0.5 * (wy * qw + wz * qx - wx * qz);
    out[6] = 0.5 * (wz * qw + wx * qy - wy * qx);
    for (let k = 0; k < 6; k++) out[7 + k] = rhs10[k] ?? 0;
    for (let i = 0; i < 4; i++) out[BODY + i * CORNER + 1] = rhs10[6 + i] ?? 0;

    for (let i = 0; i < 4; i++) {
      const target = brakeCommand[i] ?? 0;
      out[BRAKE + i] = (target - (x[BRAKE + i] ?? 0)) / hydraulicLag;
    }
  }

  function lowSpeedDamping(fz: number): number {
    // Critical damping of the wheel on its carcass spring, as Pacejka's kVlow0 over the slip stiffness.
    const cx = tire.longitudinalStiffness;
    const kxk = tire.pkx1 * Math.max(fz, tire.fzmin);
    return (2 * Math.sqrt((cx * wheelInertia) / (r0 * r0))) / kxk;
  }

  /** Driveline right-hand side: engine, clutch, gearbox, differential and halfshafts. Writes shaft torques for the wheels. */
  function driveline(x: Float64Array, out: Float64Array): void {
    const ratio = (gears[control.gear - 1] ?? 1) * spec.gearbox.finalDrive;
    const engineSpin = x[ENGINE] ?? 0;
    const inputSpin = x[INPUT] ?? 0;
    const carrier = inputSpin / ratio;
    const twistL = x[SHAFT_L] ?? 0;
    const twistR = x[SHAFT_R] ?? 0;
    const wheelL = relSpin[drivenLeft] ?? 0;
    const wheelR = relSpin[drivenRight] ?? 0;
    // Side-gear speeds: the carrier fixes their mean; the differential sets how torque splits.
    const lockedL = shaftK * twistL + shaftC * (carrier - wheelL);
    const lockedR = shaftK * twistR + shaftC * (carrier - wheelR);
    const sum = lockedL + lockedR;
    const diff = spec.differential;
    let capacity = 0;
    if (diff.kind === "clutch") capacity = diff.preload + (sum * carrier >= 0 ? diff.powerLock : diff.coastLock) * Math.abs(sum);
    else if (diff.kind === "torsen") capacity = ((diff.biasRatio - 1) / (diff.biasRatio + 1)) * Math.abs(sum);
    let split: number;
    const lockedSplit = lockedL - lockedR;
    if (diff.kind !== "open" && Math.abs(lockedSplit) <= capacity) split = lockedSplit;
    else split = diff.kind === "open" ? 0 : capacity * Math.sign(lockedSplit);
    // T_L − T_R = split fixes the side-gear speed difference D through the shaft dampers.
    const D = (split - shaftK * (twistL - twistR)) / shaftC + (wheelL - wheelR);
    const sideL = carrier + D / 2;
    const sideR = carrier - D / 2;
    const torqueL = shaftK * twistL + shaftC * (sideL - wheelL);
    const torqueR = shaftK * twistR + shaftC * (sideR - wheelR);
    out[SHAFT_L] = sideL - wheelL;
    out[SHAFT_R] = sideR - wheelR;
    shaftTorque[0] = 0;
    shaftTorque[1] = 0;
    shaftTorque[2] = 0;
    shaftTorque[3] = 0;
    shaftTorque[drivenLeft] = torqueL;
    shaftTorque[drivenRight] = torqueR;
    const axleTorque = torqueL + torqueR;
    const load = axleTorque * carrier >= 0 ? axleTorque / (ratio * efficiency) : (axleTorque * efficiency) / ratio;

    const engineRpm = engineSpin * RPM;
    const friction = engineFriction * (1 / 3 + ((2 / 3) * engineRpm) / spec.engine.redlineRpm);
    let engineTorque = throttle * torqueAt(spec.engine.torqueCurve, engineRpm) - (1 - throttle) * friction;
    if (engineSpin < idle) engineTorque = Math.max(engineTorque, Math.min(0.3 * enginePeak, 4 * (idle - engineSpin)));
    if (engineSpin <= 0 && engineTorque < 0) engineTorque = 0;
    // Karnopp clutch: stick inside a small slip band while the torque to keep both sides together fits the capacity.
    const slip = engineSpin - inputSpin;
    let clutch: number;
    if (Math.abs(slip) < CLUTCH_STICK_BAND) {
      const together = (inputInertia * engineTorque + engineInertia * load) / (engineInertia + inputInertia);
      const hold = together + ((engineInertia * inputInertia) / (engineInertia + inputInertia)) * (slip / STICK_TIME);
      clutch = clamp(hold, -clutchCapacity, clutchCapacity);
    } else clutch = clutchCapacity * Math.sign(slip);
    out[ENGINE] = (engineTorque - clutch) / engineInertia;
    out[INPUT] = (clutch - load) / inputInertia;
  }

  function rk4(): void {
    integrator.step(plant, h, plantDerivative);
    const norm = Math.hypot(plant[3] ?? 1, plant[4] ?? 0, plant[5] ?? 0, plant[6] ?? 0) || 1;
    for (let k = 3; k < 7; k++) plant[k] = (plant[k] ?? 0) / norm;
    if ((plant[ENGINE] ?? 0) < 0) plant[ENGINE] = 0;
  }

  /** The 1 kHz driver and controllers: steering, pedals, clutch foot, shifts, launch modulation and ABS. */
  function controlStep(input: AxisInput): void {
    derivative(plant, k1, true);
    const throttleIn = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);
    const handbrake = clamp(input.handbrake, 0, 1);
    const steerTarget = (-clamp(input.steer, -1, 1) * spec.steering.maxHandwheel) / spec.steering.ratio;
    const steerStep = (handwheelRate / spec.steering.ratio) * CONTROL_STEP;
    control.steer += clamp(steerTarget - control.steer, -steerStep, steerStep);

    const ratio = (gears[control.gear - 1] ?? 1) * spec.gearbox.finalDrive;
    const engineSpin = plant[ENGINE] ?? 0;
    const inputSpin = plant[INPUT] ?? 0;
    const wheelSide = ((relSpin[drivenLeft] ?? 0) + (relSpin[drivenRight] ?? 0)) / 2;
    const locked = Math.abs(engineSpin - inputSpin) < CLUTCH_STICK_BAND && control.clutch >= 1;
    const vx = plant[7] ?? 0;
    const vy = plant[8] ?? 0;
    const speed = Math.hypot(vx, vy);

    // Driver modulation of throttle on driven-wheel slip once the clutch is in.
    const drivenSlip = Math.max(report.slips[drivenLeft] ?? 0, report.slips[drivenRight] ?? 0);
    if (launchControl && locked) control.launchScale = clamp(control.launchScale + CONTROL_STEP * clamp(25 * (0.12 - drivenSlip), -6, 3), 0.25, 1);
    else if (!launchControl) control.launchScale = 1;

    // Clutch foot and throttle.
    let foot = control.clutch;
    let pedal = throttleIn;
    if (control.shiftRemaining > 0) {
      control.shiftRemaining = Math.max(0, control.shiftRemaining - CONTROL_STEP);
      foot = 0;
      pedal = 0;
    } else if (throttleIn > 0.05 && (control.launching || (!locked && ratio * Math.abs(wheelSide) < idle * 1.2))) {
      // Launch: hold the launch rpm with the throttle and let the clutch out.
      // The driver feathers the clutch: it comes out while the driven wheels grip and backs off when they spin.
      // The driver feels for the clutch torque the driven tyres can carry at the target slip and trims on wheelspin.
      control.launching = true;
      pedal = throttleIn * clamp(0.6 + (launchSpin - engineSpin) / 60, 0, 1);
      let grip = 0;
      for (const i of [drivenLeft, drivenRight]) {
        const fz = report.loads[i] ?? 0;
        if (fz > 0) grip += magicFormula(tire, { kappa: LAUNCH_SLIP, alpha: 0, gamma: 0, fz, pressure }).fx * r0;
      }
      const wanted = clamp((grip / (ratio * efficiency)) * (1 + 4 * (LAUNCH_SLIP - drivenSlip)), 0, clutchMax);
      const target = engineSpin > 0.7 * launchSpin || foot > 0 ? Math.sqrt(wanted / clutchMax) : 0;
      const rate = CONTROL_STEP / engageSeconds;
      foot = target >= foot ? Math.min(target, foot + rate) : Math.max(target, foot - 4 * rate);
      // Once the input shaft catches the engine the driver lets the pedal all the way up.
      if (Math.abs(engineSpin - inputSpin) < 5 * CLUTCH_STICK_BAND) foot = Math.min(1, control.clutch + rate);
      if (locked) control.launching = false;
    } else if (throttleIn > 0.05) {
      foot = Math.min(1, foot + CONTROL_STEP / CLUTCH_RELEASE_SECONDS);
      pedal = throttleIn * control.launchScale;
    } else {
      // Off throttle: keep the clutch in for engine braking while the wheels would hold the engine above idle.
      // A hard stop declutches so the engine's inertia does not fight the ABS.
      foot = ratio * Math.abs(wheelSide) > idle * 1.15 && brake < 0.5 ? Math.min(1, foot + CONTROL_STEP / CLUTCH_RELEASE_SECONDS) : 0;
      control.launching = false;
    }
    if (engineSpin >= redline) pedal = 0;
    control.clutch = foot;
    clutchCapacity = clutchMax * foot * foot;
    throttle = pedal;

    // Shifts: the synchro matches the input shaft to the new gear.
    if (control.shiftRemaining === 0 && locked) {
      let next = control.gear;
      if (engineSpin > upshift && control.gear < gears.length && throttleIn > 0.05) next = control.gear + 1;
      else if (engineSpin < downshift && control.gear > 1 && brake === 0 && throttleIn > 0.05) next = control.gear - 1;
      if (next !== control.gear) {
        const nextRatio = (gears[next - 1] ?? 1) * spec.gearbox.finalDrive;
        plant[INPUT] = (inputSpin * nextRatio) / ratio;
        control.gear = next;
        control.shiftRemaining = shiftSeconds;
        control.clutch = 0;
        clutchCapacity = 0;
        throttle = 0;
      }
    } else if (!locked && control.gear > 1 && brake === 0 && ratio * Math.abs(wheelSide) < idle * 1.1 && control.shiftRemaining === 0) {
      const firstRatio = (gears[0] ?? 1) * spec.gearbox.finalDrive;
      plant[INPUT] = (inputSpin * firstRatio) / ratio;
      control.gear = 1;
    }

    // Brakes and ABS: slip tracking on each wheel's measured slip.
    const service = brake * spec.brakes.maxTorque * 0.5;
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      if (c === undefined) continue;
      const share = c.front ? spec.brakes.frontShare : 1 - spec.brakes.frontShare;
      // PI slip control in friction units (brake torque over load × radius), so it follows load transfer like EBD.
      // A fresh stop starts at a dry road's friction; the integral then finds the tyre's peak.
      let integral = control.abs[i] ?? -1;
      let level = 1;
      if (absOn && brake > 0 && speed > 2) {
        const scale = ((report.loads[i] ?? 0) * r0) / Math.max(1, service * share);
        const error = (report.slips[i] ?? 0) - ABS_TARGET_SLIP;
        if (integral < 0) integral = ABS_ONSET_MU;
        integral = clamp(integral + CONTROL_STEP * ABS_INTEGRAL_GAIN * error, 0, 2);
        level = clamp((integral + ABS_PROPORTIONAL_GAIN * error) * scale, 0, 1);
      } else integral = -1;
      control.abs[i] = integral;
      brakeCommand[i] = service * share * level + (c.front ? 0 : (handbrake * handbrakeTorque) / 2);
    }
  }

  function heading(): number {
    const qw = plant[3] ?? 1;
    const qx = plant[4] ?? 0;
    const qy = plant[5] ?? 0;
    const qz = plant[6] ?? 0;
    return Math.atan2(2 * (qx * qy + qw * qz), 1 - 2 * (qy * qy + qz * qz));
  }

  function enginePosition(): [number, number, number] {
    return [plant[1] ?? 0, (plant[2] ?? 0) - hs, plant[0] ?? 0];
  }

  function snapshot(): ReferenceCarState {
    return {
      plant: Array.from(plant),
      gear: control.gear,
      shiftRemaining: control.shiftRemaining,
      clutch: control.clutch,
      launching: control.launching,
      steer: control.steer,
      launchScale: control.launchScale,
      abs: [...control.abs],
      carry: control.carry,
    };
  }

  // Settle onto the springs before the first tick so a fresh car starts at rest.
  function settle(): void {
    for (let i = 0; i < 1500; i++) {
      controlStep({ throttle: 0, brake: 1, steer: 0, handbrake: 1 });
      for (let k = 0; k < substeps; k++) rk4();
    }
    plant[0] = spawn[2];
    plant[1] = spawn[0];
    for (let k = 7; k < 13; k++) plant[k] = 0;
    // Take out any yaw the settle picked up: q ← rotZ(spawn − ψ) ⊗ q.
    const turn = (spawnHeading - heading()) / 2;
    const cw = Math.cos(turn);
    const sz = Math.sin(turn);
    const qw = plant[3] ?? 1;
    const qx = plant[4] ?? 0;
    const qy = plant[5] ?? 0;
    const qz = plant[6] ?? 0;
    plant[3] = cw * qw - sz * qz;
    plant[4] = cw * qx - sz * qy;
    plant[5] = cw * qy + sz * qx;
    plant[6] = cw * qz + sz * qw;
    const norm = Math.hypot(plant[3] ?? 1, plant[4] ?? 0, plant[5] ?? 0, plant[6] ?? 0) || 1;
    for (let k = 3; k < 7; k++) plant[k] = (plant[k] ?? 0) / norm;
    for (let i = 0; i < 4; i++) {
      plant[BODY + i * CORNER + 2] = 0;
      plant[BRAKE + i] = 0;
    }
    plant[ENGINE] = idle;
    plant[INPUT] = 0;
    control = freshControl();
  }
  settle();
  const settled = snapshot();

  return {
    tick(dt, input) {
      const before = [plant[7] ?? 0, plant[8] ?? 0];
      const total = Math.max(0, dt);
      control.carry += total;
      while (control.carry >= CONTROL_STEP - 1e-12) {
        controlStep(input);
        for (let k = 0; k < substeps; k++) rk4();
        control.carry -= CONTROL_STEP;
      }
      const psi = heading();
      const fx = Math.cos(psi);
      const fy = Math.sin(psi);
      const vx = plant[7] ?? 0;
      const vy = plant[8] ?? 0;
      const ax = total > 0 ? (vx - (before[0] ?? 0)) / total : 0;
      const ay = total > 0 ? (vy - (before[1] ?? 0)) / total : 0;
      const qw = plant[3] ?? 1;
      const qx = plant[4] ?? 0;
      const qy = plant[5] ?? 0;
      const qz = plant[6] ?? 0;
      const pitch = Math.asin(clamp(2 * (qw * qy - qz * qx), -1, 1));
      const roll = Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy));
      return {
        position: enginePosition(),
        heading: psi,
        forwardSpeed: vx * fx + vy * fy,
        lateralSpeed: vx * fy - vy * fx,
        yawRate: plant[12] ?? 0,
        steerAngle: -control.steer,
        roadWheelAngle: -report.steer,
        lateralAccel: ax * fy - ay * fx,
        longitudinalAccel: ax * fx + ay * fy,
        bodyPitch: pitch,
        bodyRoll: roll,
        rpm: (plant[ENGINE] ?? 0) * RPM,
        gear: control.gear,
        wheelLoads: [...report.loads],
        slipRatios: [...report.slips],
        slipAngles: [...report.angles],
        cambers: [...report.cambers],
        airborne: report.airborne,
      };
    },
    velocity: () => [plant[8] ?? 0, plant[7] ?? 0],
    pose: () => ({ position: enginePosition(), heading: heading() }),
    applyImpulse(dvx, dvz, dvy = 0) {
      plant[7] = (plant[7] ?? 0) + dvz;
      plant[8] = (plant[8] ?? 0) + dvx;
      plant[9] = (plant[9] ?? 0) + dvy;
    },
    spec: () => spec,
    snapshot,
    restore(next) {
      plant = Float64Array.from(next.plant);
      control = { gear: next.gear, shiftRemaining: next.shiftRemaining, clutch: next.clutch, launching: next.launching, steer: next.steer, launchScale: next.launchScale, abs: [...next.abs], carry: next.carry };
    },
    reset() {
      plant = Float64Array.from(settled.plant);
      control = freshControl();
    },
  };
}
