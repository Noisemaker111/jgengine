// @skill jgengine-world
import { steadyAirData } from "./aircraftTrim";
import { createRotorLoads, evaluateRotor, rotorStateCount, rotorStateNames, settleRotor, solveNewton, type RotorDesign, type RotorFlow, type RotorPitch } from "./helicopterRotor";
import {
  referenceQuaternion,
  type ReferenceAeroCoefficients,
  type ReferenceAircraft,
  type ReferenceAircraftModel,
  type ReferenceAircraftState,
  type ReferenceAirData,
  type ReferenceGearLeg,
  type ReferenceMassProperties,
  type ReferencePilotInput,
  type ReferencePropulsion,
  type ReferencePropulsionOutput,
  type ReferenceSurfaces,
  type ReferenceVector,
} from "./referenceAircraft";

/** A small lifting surface on the airframe (tailplane or fin), sized and placed in body axes. */
export interface HelicopterSurface {
  /** m². */
  area: number;
  /** Aerodynamic centre, body axes m from the centre of gravity. */
  at: ReferenceVector;
  /** Lift slope, per rad. */
  liftSlope: number;
  /** Setting angle, rad (the fin's offloads the tail rotor in cruise). */
  incidence?: number;
  /** Lift coefficient where it stalls flat (default `1`). */
  maxLift?: number;
}

/** A single-main-rotor helicopter with a tail rotor, a turboshaft and a speed governor. Body axes: x forward, y right, z down. */
export interface HelicopterDesign {
  name: string;
  mass: ReferenceMassProperties;
  mainRotor: RotorDesign;
  /** Main rotor hub, body axes m from the centre of gravity. */
  hub: ReferenceVector;
  /** Forward tilt of the main rotor shaft, rad. */
  shaftTilt: number;
  /** A tail rotor that thrusts to the right (body +y), countering a counter-clockwise main rotor. */
  tailRotor: RotorDesign;
  tailHub: ReferenceVector;
  /** Polar inertia of the main rotor and drive train about the main shaft, kg·m². */
  rotorInertia: number;
  engine: {
    /** Shaft power available at sea level, W; it falls with density. */
    maxPower: number;
    /** Governor closed-loop bandwidth, rad/s (default `2`). */
    governorFrequency?: number;
    /** Governor damping ratio (default `0.7`). */
    governorDamping?: number;
  };
  controls: {
    /** Main rotor collective at 75% radius at the bottom and top of the lever, rad. */
    collective: [number, number];
    /** Longitudinal cyclic at full aft stick, rad (`sin ψ` pitch: aft stick tilts the disc back). */
    longitudinal: number;
    /** Lateral cyclic at full right stick, rad (`cos ψ` pitch: right stick tilts the disc right). */
    lateral: number;
    /** Tail rotor collective with pedals centred, and the change at full pedal, rad (right pedal lowers it). */
    tailPitch: [number, number];
    /** Swashplate servo bandwidth, rad/s, and slew limit, rad/s. */
    bandwidth: number;
    rateLimit: number;
  };
  fuselage: {
    /** Drag area along x, y and z, m² (`D = ½ρV²·area`). */
    dragArea: number;
    sideArea: number;
    verticalArea: number;
  };
  tailplane: HelicopterSurface;
  fin: HelicopterSurface;
  gear: readonly ReferenceGearLeg[];
}

/** Options for {@link createHelicopterModel}. */
export interface HelicopterModelOptions {
  /** Overrides the engine's sea-level power, W; `0` flies with the engine failed (the rotor freewheels). */
  enginePower?: number;
}

/** A helicopter model with its design and per-rotor telemetry. */
export interface HelicopterModel extends ReferenceAircraftModel {
  readonly design: HelicopterDesign;
  /** Main rotor, tail rotor and engine figures for a propulsion state in this air, as the last evaluation saw them. */
  rotorTelemetry(): HelicopterRotorTelemetry;
}

/** What the rotors did at the last evaluation. */
export interface HelicopterRotorTelemetry {
  /** Main rotor thrust along the shaft, N. */
  mainThrust: number;
  /** Main rotor aerodynamic power, W. */
  mainPower: number;
  /** Tail rotor thrust to the right, N. */
  tailThrust: number;
  tailPower: number;
  /** Engine shaft power, W. */
  enginePower: number;
  /** Rotor speed over rated. */
  rotorSpeed: number;
  groundEffect: number;
}

const ROTOR_SPEED = 0;
const GOVERNOR = 1;
const MAIN = 2;

function surfaceForce(surface: HelicopterSurface, density: number, local: ReferenceVector, vertical: boolean, out: [number, number, number]): void {
  const [ul, vl, wl] = local;
  const cross = vertical ? vl : wl;
  const speed2 = ul * ul + cross * cross;
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  if (speed2 < 1e-6) return;
  const flow = Math.atan2(cross, ul);
  const limit = surface.maxLift ?? 1;
  const cl = Math.max(-limit, Math.min(limit, surface.liftSlope * (flow + (surface.incidence ?? 0))));
  const lift = 0.5 * density * speed2 * surface.area * cl;
  out[0] = lift * Math.sin(flow);
  if (vertical) out[1] = -lift * Math.cos(flow);
  else out[2] = -lift * Math.cos(flow);
}

/**
 * Builds a reference helicopter: the airframe flies on {@link createReferenceAircraft}'s 6-DOF, the main and tail
 * rotors are blade-element rotors with flapping and dynamic inflow ({@link evaluateRotor}), a governor holds rotor speed
 * with the engine's power and lets the rotor freewheel when the engine cannot drive it (autorotation), and the
 * fuselage, tailplane and fin add drag, damping and weathercock stability. The pilot's throttle is the collective
 * lever; pitch, roll and yaw move the swashplate and the tail rotor pitch through servos.
 * @capability reference-helicopter blade-element helicopter on the reference 6-DOF: flapping, dynamic inflow, governor, autorotation
 */
export function createHelicopterModel(design: HelicopterDesign, options: HelicopterModelOptions = {}): HelicopterModel {
  const main = design.mainRotor;
  const tail = design.tailRotor;
  const mainSize = rotorStateCount(main);
  const tailSize = rotorStateCount(tail);
  const tailStart = MAIN + mainSize;
  const gearRatio = tail.speed / main.speed;
  const ratedSpeed = main.speed;
  const enginePower = options.enginePower ?? design.engine.maxPower;
  const frequency = design.engine.governorFrequency ?? 2;
  const damping = design.engine.governorDamping ?? 0.7;
  const cosTilt = Math.cos(design.shaftTilt);
  const sinTilt = Math.sin(design.shaftTilt);
  const mainLoads = createRotorLoads(main);
  const tailLoads = createRotorLoads(tail);
  const mainState = new Array<number>(mainSize).fill(0);
  const tailState = new Array<number>(tailSize).fill(0);
  const mainFlow: RotorFlow = { u: 0, v: 0, w: 0, p: 0, q: 0, density: 1.225, speedOfSound: 340, height: Number.POSITIVE_INFINITY };
  const tailFlow: RotorFlow = { u: 0, v: 0, w: 0, p: 0, q: 0, density: 1.225, speedOfSound: 340, height: Number.POSITIVE_INFINITY };
  const mainPitch: RotorPitch = { collective: 0, cosine: 0, sine: 0 };
  const tailPitch: RotorPitch = { collective: 0, cosine: 0, sine: 0 };
  const telemetry: HelicopterRotorTelemetry = { mainThrust: 0, mainPower: 0, tailThrust: 0, tailPower: 0, enginePower: 0, rotorSpeed: 1, groundEffect: 1 };
  const [hx, hy, hz] = design.hub;
  const [tx, ty, tz] = design.tailHub;
  const neutral = { elevator: 0, aileron: 0, rudder: 0, flap: 0 };

  const prepare = (throttle: number, air: ReferenceAirData, surfaces: ReferenceSurfaces): void => {
    const u = air.airspeed * Math.cos(air.alpha) * Math.cos(air.beta);
    const v = air.airspeed * Math.sin(air.beta);
    const w = air.airspeed * Math.sin(air.alpha) * Math.cos(air.beta);
    const { p, q, r } = air;
    const hvx = u + q * hz - r * hy;
    const hvy = v + r * hx - p * hz;
    const hvz = w + p * hy - q * hx;
    mainFlow.u = hvx * cosTilt + hvz * sinTilt;
    mainFlow.v = hvy;
    mainFlow.w = -hvx * sinTilt + hvz * cosTilt;
    mainFlow.p = p * cosTilt + r * sinTilt;
    mainFlow.q = q;
    mainFlow.density = air.density;
    mainFlow.speedOfSound = air.air.speedOfSound;
    mainFlow.height = air.heightAboveGround - hz;
    const [low, high] = design.controls.collective;
    mainPitch.collective = low + Math.max(0, Math.min(1, throttle)) * (high - low);
    mainPitch.cosine = surfaces.aileron;
    mainPitch.sine = surfaces.elevator;
    const tvx = u + q * tz - r * ty;
    const tvy = v + r * tx - p * tz;
    const tvz = w + p * ty - q * tx;
    tailFlow.u = tvx;
    tailFlow.v = tvz;
    tailFlow.w = -tvy;
    tailFlow.p = p;
    tailFlow.q = r;
    tailFlow.density = air.density;
    tailFlow.speedOfSound = air.air.speedOfSound;
    tailPitch.collective = design.controls.tailPitch[0] - surfaces.rudder;
  };

  const propulsion: ReferencePropulsion = {
    stateNames: ["rotorSpeed", "governor", ...rotorStateNames(main, "main"), ...rotorStateNames(tail, "tail")],
    settle(throttle, air, state, surfaces = neutral) {
      prepare(throttle, air, surfaces);
      for (let i = 0; i < mainSize; i += 1) mainState[i] = state[MAIN + i] ?? 0;
      for (let i = 0; i < tailSize; i += 1) tailState[i] = state[tailStart + i] ?? 0;
      settleRotor(main, mainFlow, mainPitch, ratedSpeed, mainState);
      settleRotor(tail, tailFlow, tailPitch, ratedSpeed * gearRatio, tailState);
      evaluateRotor(main, mainFlow, mainPitch, ratedSpeed, mainState, mainLoads);
      evaluateRotor(tail, tailFlow, tailPitch, ratedSpeed * gearRatio, tailState, tailLoads);
      state[ROTOR_SPEED] = ratedSpeed;
      state[GOVERNOR] = (mainLoads.torque + gearRatio * tailLoads.torque) / (design.rotorInertia * frequency * frequency);
      for (let i = 0; i < mainSize; i += 1) state[MAIN + i] = mainState[i] ?? 0;
      for (let i = 0; i < tailSize; i += 1) state[tailStart + i] = tailState[i] ?? 0;
    },
    evaluate(state, throttle, air, out: ReferencePropulsionOutput, surfaces = neutral) {
      prepare(throttle, air, surfaces);
      const speed = Math.max(1e-3, state[ROTOR_SPEED] ?? ratedSpeed);
      for (let i = 0; i < mainSize; i += 1) mainState[i] = state[MAIN + i] ?? 0;
      for (let i = 0; i < tailSize; i += 1) tailState[i] = state[tailStart + i] ?? 0;
      evaluateRotor(main, mainFlow, mainPitch, speed, mainState, mainLoads);
      evaluateRotor(tail, tailFlow, tailPitch, speed * gearRatio, tailState, tailLoads);
      const load = mainLoads.torque + gearRatio * tailLoads.torque;
      const error = ratedSpeed - speed;
      const command = design.rotorInertia * (2 * damping * frequency * error + frequency * frequency * (state[GOVERNOR] ?? 0));
      const available = (enginePower * (air.density / 1.225)) / Math.max(speed, 0.2 * ratedSpeed);
      const engine = Math.max(0, Math.min(available, command));
      out.rates[ROTOR_SPEED] = (engine - load) / design.rotorInertia;
      out.rates[GOVERNOR] = (command > available && error > 0) || (command < 0 && error < 0) ? 0 : error;
      for (let i = 0; i < mainSize; i += 1) out.rates[MAIN + i] = mainLoads.rates[i] ?? 0;
      for (let i = 0; i < tailSize; i += 1) out.rates[tailStart + i] = tailLoads.rates[i] ?? 0;

      const [fxs, fys, fzs] = mainLoads.force;
      const mfx = fxs * cosTilt - fzs * sinTilt;
      const mfy = fys;
      const mfz = fxs * sinTilt + fzs * cosTilt;
      const [mxs, mys] = mainLoads.moment;
      // Engine torque reacts on the airframe about the shaft, nose right for a counter-clockwise rotor.
      const hubMx = mxs * cosTilt - engine * sinTilt;
      const hubMy = mys;
      const hubMz = mxs * sinTilt + engine * cosTilt;
      const tfx = tailLoads.force[0];
      const tfy = -tailLoads.force[2];
      const tfz = tailLoads.force[1];
      out.force[0] = mfx + tfx;
      out.force[1] = mfy + tfy;
      out.force[2] = mfz + tfz;
      out.moment[0] = hy * mfz - hz * mfy + hubMx + ty * tfz - tz * tfy;
      out.moment[1] = hz * mfx - hx * mfz + hubMy + tz * tfx - tx * tfz;
      out.moment[2] = hx * mfy - hy * mfx + hubMz + tx * tfy - ty * tfx;
      const spin = design.rotorInertia * speed;
      out.angularMomentum[0] = spin * sinTilt;
      out.angularMomentum[1] = 0;
      out.angularMomentum[2] = -spin * cosTilt;
      out.thrust = mainLoads.thrust;
      out.shaftPower = engine * speed;
      out.rpm = (speed * 30) / Math.PI;
      telemetry.mainThrust = mainLoads.thrust;
      telemetry.mainPower = mainLoads.power;
      telemetry.tailThrust = tailLoads.thrust;
      telemetry.tailPower = tailLoads.power;
      telemetry.enginePower = engine * speed;
      telemetry.rotorSpeed = speed / ratedSpeed;
      telemetry.groundEffect = mainLoads.groundEffect;
    },
  };

  const fuselage = design.fuselage;
  const force: [number, number, number] = [0, 0, 0];
  const aerodynamics = (air: ReferenceAirData, _surfaces: ReferenceSurfaces, out: ReferenceAeroCoefficients): void => {
    out.cx = 0;
    out.cy = 0;
    out.cz = 0;
    out.cl = 0;
    out.cm = 0;
    out.cn = 0;
    out.cxAlphaDot = 0;
    out.czAlphaDot = 0;
    out.cmAlphaDot = 0;
    const speed = air.airspeed;
    const q = air.dynamicPressure;
    if (speed < 0.05 || q < 1e-4) return;
    const u = speed * Math.cos(air.alpha) * Math.cos(air.beta);
    const v = speed * Math.sin(air.beta);
    const w = speed * Math.sin(air.alpha) * Math.cos(air.beta);
    let fx = -0.5 * air.density * fuselage.dragArea * Math.abs(u) * u;
    let fy = -0.5 * air.density * fuselage.sideArea * Math.abs(v) * v;
    let fz = -0.5 * air.density * fuselage.verticalArea * Math.abs(w) * w;
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (const [surface, vertical] of [
      [design.tailplane, false],
      [design.fin, true],
    ] as const) {
      const [rx, ry, rz] = surface.at;
      const local: ReferenceVector = [u + air.q * rz - air.r * ry, v + air.r * rx - air.p * rz, w + air.p * ry - air.q * rx];
      surfaceForce(surface, air.density, local, vertical, force);
      fx += force[0];
      fy += force[1];
      fz += force[2];
      mx += ry * force[2] - rz * force[1];
      my += rz * force[0] - rx * force[2];
      mz += rx * force[1] - ry * force[0];
    }
    out.cx = fx / q;
    out.cy = fy / q;
    out.cz = fz / q;
    out.cl = mx / q;
    out.cm = my / q;
    out.cn = mz / q;
  };

  const servo = (range: number) => ({ atFullPositive: range, atFullNegative: -range, bandwidth: design.controls.bandwidth, rateLimit: design.controls.rateLimit });
  return {
    name: design.name,
    design,
    mass: design.mass,
    wingArea: 1,
    span: 1,
    chord: 1,
    aerodynamics,
    controls: {
      elevator: servo(design.controls.longitudinal),
      aileron: { ...servo(design.controls.lateral), atFullPositive: -design.controls.lateral, atFullNegative: design.controls.lateral },
      rudder: servo(design.controls.tailPitch[1]),
    },
    propulsion,
    gear: design.gear,
    stallAlpha: Math.PI,
    rotorTelemetry: () => ({ ...telemetry }),
  };
}

/** A steady helicopter flight condition: ground speed along the heading and climb rate, still air. */
export interface HelicopterTrimCondition {
  /** Horizontal speed, m/s (`0` hovers). */
  speed: number;
  altitude: number;
  /** m/s, positive up (default `0`). */
  climbRate?: number;
}

/** A trimmed helicopter: attitude, controls and the power it takes. */
export interface HelicopterTrim {
  pitch: number;
  bank: number;
  /** Collective lever, `0..1`. */
  collective: number;
  surfaces: ReferenceSurfaces;
  /** Main rotor shaft angle to the flight path, rad, positive tilted aft (wind-tunnel convention). */
  shaftAngle: number;
  /** Engine shaft power, W. */
  power: number;
  telemetry: HelicopterRotorTelemetry;
  state: ReferenceAircraftState;
  converged: boolean;
}

/**
 * Trims a reference helicopter for steady flight with no sideslip: solves pitch, bank, collective, both cyclics and
 * pedal so every body acceleration vanishes with the rotors' flapping, inflow and speed steady.
 * @capability reference-helicopter trim a reference helicopter in hover, level flight or a steady climb
 */
export function trimHelicopter(aircraft: ReferenceAircraft, model: HelicopterModel, condition: HelicopterTrimCondition): HelicopterTrim {
  const climb = condition.climbRate ?? 0;
  const north = condition.speed;
  const down = -climb;
  const airspeed = Math.hypot(north, down);
  const input: ReferencePilotInput = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
  const warm = new Array<number>(model.propulsion.stateNames.length).fill(0);
  const build = (x: readonly number[]): ReferenceAircraftState => {
    const [pitch = 0, bank = 0, throttle = 0, elevator = 0, aileron = 0, rudder = 0] = x;
    const ct = Math.cos(pitch);
    const st = Math.sin(pitch);
    const cp = Math.cos(bank);
    const sp = Math.sin(bank);
    const u = ct * north - st * down;
    const v = sp * st * north + sp * ct * down;
    const w = cp * st * north + cp * ct * down;
    const alpha = Math.atan2(w, u);
    const beta = airspeed > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, v / airspeed))) : 0;
    const surfaces = { elevator, aileron, rudder, flap: 0 };
    const propulsion = [...warm];
    model.propulsion.settle(throttle, steadyAirData(aircraft, condition.altitude, airspeed, alpha, beta), propulsion, surfaces);
    return {
      time: 0,
      position: [0, 0, -condition.altitude],
      velocity: [u, v, w],
      attitude: referenceQuaternion(0, pitch, bank),
      rates: [0, 0, 0],
      surfaces,
      propulsion,
    };
  };
  const residual = (x: readonly number[]): number[] => {
    input.throttle = x[2] ?? 0;
    const state = build(x);
    const rate = aircraft.derivative(state, input);
    return [rate.velocity[0], rate.velocity[1], rate.velocity[2], rate.rates[0] * 10, rate.rates[1] * 10, rate.rates[2] * 10];
  };
  const first = build([0, 0, 0.45, 0, 0, 0]);
  for (let i = 0; i < warm.length; i += 1) warm[i] = first.propulsion[i] ?? 0;
  const result = solveNewton(residual, [0, 0, 0.45, 0, 0, 0], { iterations: 40, tolerance: 1e-9, step: [1e-5, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5] });
  const state = build(result.x);
  input.throttle = result.x[2] ?? 0;
  const sample = aircraft.sampleOf(state, input);
  const [pitch = 0, bank = 0, collective = 0] = result.x;
  return {
    pitch,
    bank,
    collective,
    surfaces: { ...state.surfaces },
    shaftAngle: pitch - Math.atan2(climb, Math.max(1e-9, north)) * (condition.speed > 0 ? 1 : 0) - model.design.shaftTilt,
    power: sample.shaftPower,
    telemetry: model.rotorTelemetry(),
    state,
    converged: result.norm < 1e-5,
  };
}
