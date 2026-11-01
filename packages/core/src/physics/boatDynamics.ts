import type { AxisInput } from "../input/axisInput";
import { waveFieldHeight, type WaveField } from "../water/seaState";
import { hullManoeuvringForces, rudderForces, type HullManoeuvring, type ManoeuvringLoads } from "./boatManoeuvring";
import { planingForces, planingTrim, type PlaningBottom } from "./boatPlaning";
import { prepareOpenWater, propellerPoint, type BoatPropeller, type PreparedOpenWater } from "./boatPropeller";
import { prepareHullResistance, type BoatWater, type HullResistance } from "./boatResistance";
import { prepareSeakeeping, seakeepingExcitation, seakeepingForces, seakeepingForcesFromHeight, type HullSeakeeping, type PreparedSeakeeping, type SeakeepingExcitation, type SeakeepingLoads } from "./boatSeakeeping";

const GRAVITY = 9.81;
const WATER_DENSITY = 1025;
const DEFAULT_SUBSTEP = 1 / 240;
const DEG = Math.PI / 180;

/** How the boat turns: a rudder needs water flowing past it; an outboard swings its own thrust. */
export type BoatSteering =
  | {
      kind: "rudder";
      /** Rudder area, m². */
      area: number;
      /** Largest rudder angle, rad (default `0.6`). */
      maxAngle?: number;
      /** Share of prop thrust that washes over the rudder as flow, `0..1` (default `0.5`) — steering at low speed. */
      propWash?: number;
    }
  | {
      kind: "outboard";
      /** Largest thrust angle, rad (default `0.5`). */
      maxAngle?: number;
    };

/**
 * A powered hull in physical units. Drag rises toward hull speed (`√(g·L)·1.34`) and then falls away once the hull
 * planes, the keel resists sliding sideways, and the prop's thrust fades as the boat approaches the prop's speed.
 */
export interface BoatTuning {
  /** Displacement, kg. */
  massKg: number;
  /** Waterline length, m; sets hull speed and the rudder's lever arm. */
  length: number;
  /** Beam, m; sets the visual roll response. */
  beam: number;
  /** Peak prop thrust, N. */
  maxThrust: number;
  /** Speed at which prop thrust reaches zero, m/s. */
  propSpeed: number;
  /** Reverse thrust as a share of `maxThrust` (default `0.4`). */
  reverseScale?: number;
  /** Hull drag coefficient × wetted frontal area, m², before planing (default `0.3 · beam`). */
  dragArea?: number;
  /** Speed where the hull planes and drag drops, m/s; omit for a displacement hull that never planes. */
  planingSpeed?: number;
  /** Drag multiplier once fully planing, `0..1` (default `0.35`). */
  planingDrag?: number;
  /** Keel lateral resistance, N per (m/s)² of sideways speed (default `massKg · 6`). */
  keel?: number;
  /** Extra yaw damping, N·m per rad/s, on top of the keel resisting rotation along the hull (default `0`). */
  yawDamping?: number;
  steering: BoatSteering;
  /** Rudder or outboard slew rate, rad/s (default `2`). */
  steerRate?: number;
  /** Largest bow-up pitch while climbing onto the plane, rad (default `0.12`). */
  bowRise?: number;
  /** Largest heel in a hard turn, rad (default `0.15`); planing hulls lean into the turn. */
  maxHeel?: number;
  /** Integration substep, s (default `1/240`). */
  maxSubstep?: number;
  /** The water the hydrodynamic effects use (default sea water at 15 °C). */
  water?: BoatWater;
  /** Physical effects, each its own term with its own toggle; an effect left out keeps the simple model's term. */
  effects?: BoatEffects;
}

/**
 * Hydrodynamic inertia, the `addedMass` effect: the water the hull carries along when it surges, sways and yaws, plus
 * the hull's own yaw inertia and centre of gravity for the coupled sway–yaw equations.
 */
export interface BoatAddedMass {
  /** `false` turns the effect off while keeping its numbers (default `true`). */
  enabled?: boolean;
  /** Surge added mass, kg (default Lamb's prolate spheroid of the hull's length and twice its volume). */
  surge?: number;
  /** Sway added mass, kg (default `0`). */
  sway?: number;
  /** Yaw added inertia, kg·m² (default `0`). */
  yaw?: number;
  /** Centre of gravity forward of midship, m (default `0`). */
  centreOfGravity?: number;
  /** Yaw radius of gyration about G, m (default `length/√12`). */
  yawRadius?: number;
}

/**
 * The physical effects a boat can switch on. Each is a separate term with its own parameters and `enabled` toggle, so a
 * game takes only what it wants (a real propeller on an arcade hull, seakeeping on a raft); `boatFromReference` turns
 * them all on for a published hull.
 */
export interface BoatEffects {
  /** Added mass and yaw inertia. */
  addedMass?: BoatAddedMass;
  /** Calm-water resistance: friction line, form factor and wave-making (Holtrop–Mennen), or a measured coefficient. */
  resistance?: HullResistance;
  /** Savitsky planing lift, friction and running trim. */
  planing?: PlaningBottom;
  /** Screw propeller thrust from `K_T` at the advance ratio, driven by a governed or power-limited engine. */
  propeller?: BoatPropeller;
  /** MMG hull derivatives and rudder. */
  manoeuvring?: HullManoeuvring;
  /** Heave, pitch and roll in waves by strip theory. */
  seakeeping?: HullSeakeeping;
}

/** World hooks for a boat instance. */
export interface BoatOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Water surface height, m, under a point at a time (waves); default flat at the spawn height. */
  waterHeight?: (x: number, z: number, time: number) => number;
  /** Surface current, m/s, `[vx, vz]`; the hull drags toward it. */
  current?: (x: number, z: number) => readonly [number, number];
  /** The sea state the hull rides: its surface replaces `waterHeight`, and the `seakeeping` effect takes its wave forces from it. */
  sea?: WaveField;
  /** Still-water level for the `seakeeping` effect without a `sea`, m (default the spawn height). */
  waterLevel?: number;
}

/** Serializable boat state. */
export interface BoatState {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  steerAngle: number;
  time: number;
  bodyPitch: number;
  bodyRoll: number;
  /** Planing running trim, rad, bow up (`planing` effect). */
  trim: number;
  /** Heave of G above the still level, m, and its rate (`seakeeping` effect). */
  heave: number;
  heaveRate: number;
  /** Wave pitch, rad, bow down, and its rate (`seakeeping` effect). */
  pitch: number;
  pitchRate: number;
  /** Wave roll, rad, port down, and its rate (`seakeeping` effect). */
  roll: number;
  rollRate: number;
}

/** One boat tick: pose plus the telemetry wake, spray and engine sound read. */
export interface BoatStep {
  position: readonly [number, number, number];
  heading: number;
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  /** Rudder or outboard angle, rad, positive steers like `steer > 0`. */
  steerAngle: number;
  /** `0` displacement … `1` fully planing. */
  planing: number;
  /** Thrust in use as a share of `maxThrust`, `0..1` — engine load. */
  engineLoad: number;
  /** Net propulsive force along the hull, N (after thrust deduction with the `propeller` effect). */
  thrust: number;
  /** Calm-water resistance along the hull, N. */
  resistance: number;
  /** Propeller shaft speed, rev/s (`0` without the `propeller` effect). */
  propRevs: number;
  bodyPitch: number;
  bodyRoll: number;
  /** Always `0`: the hull rides the water surface. Present so `tickDrivableVehicle` can drive it. */
  airOffset: number;
  airborne: boolean;
}

/** A force-based powered hull on the same tick/snapshot/retune contract as `VehicleDynamics`. */
export interface BoatDynamics {
  tick(dt: number, input: AxisInput): BoatStep;
  pose(): { position: readonly [number, number, number]; heading: number };
  velocity(): readonly [number, number];
  applyImpulse(dvx: number, dvz: number): void;
  retune(next: BoatTuning): void;
  tuning(): BoatTuning;
  snapshot(): BoatState;
  restore(state: BoatState): void;
  resetTo(position: readonly [number, number, number], heading: number): void;
  /** Swap the sea state the hull rides (weather), or `undefined` to fall back to `waterHeight`. */
  setSea(sea: WaveField | undefined): void;
}

function forwardOf(heading: number): readonly [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

/**
 * Surge added mass of a hull as half a prolate spheroid of its length and twice its volume (the double-body image across
 * the still surface): Lamb's `k₁ = α₀/(2 − α₀)` times the displaced mass.
 * @capability boat-dynamics surge added mass of a hull from Lamb's prolate-spheroid coefficient
 */
export function hullSurgeAddedMass(massKg: number, length: number, density = WATER_DENSITY): number {
  const a = length / 2;
  const b = Math.sqrt((3 * (2 * massKg) / density) / (4 * Math.PI * a));
  if (b >= a) return 0.5 * massKg;
  const e = Math.sqrt(1 - (b / a) ** 2);
  const alpha = ((2 * (1 - e * e)) / e ** 3) * (0.5 * Math.log((1 + e) / (1 - e)) - e);
  return (alpha / (2 - alpha)) * massKg;
}

function on<T extends { enabled?: boolean }>(effect: T | undefined): T | undefined {
  return effect !== undefined && effect.enabled !== false ? effect : undefined;
}

/** Every effect's speed-independent numbers, worked out once per tuning (and per sea for seakeeping). */
interface PreparedEffects {
  planar: boolean;
  density: number;
  resistance: ((speed: number) => number) | undefined;
  planing: { bottom: PlaningBottom; floor: number; floorTrim: number; floorResistance: number } | undefined;
  propeller: { spec: BoatPropeller; curve: PreparedOpenWater } | undefined;
  manoeuvring: HullManoeuvring | undefined;
  inertia: { surge: number; sway: number; yaw: number; xG: number; iz: number };
  seakeeping: { spec: HullSeakeeping; prepared: PreparedSeakeeping; excitation: SeakeepingExcitation | undefined; inverse: [number, number, number, number] } | undefined;
}

// Strip sections cost a few tens of milliseconds to solve; boats sharing a hull and sea frequency share them.
const seakeepingCache = new WeakMap<HullSeakeeping, Map<string, PreparedSeakeeping>>();

function prepareEffects(tuning: BoatTuning, sea: WaveField | undefined): PreparedEffects {
  const effects = tuning.effects ?? {};
  const density = tuning.water?.density ?? WATER_DENSITY;
  const gravity = tuning.water?.gravity ?? GRAVITY;
  const m = tuning.massKg;
  const added = on(effects.addedMass);
  const resistance = on(effects.resistance);
  const planing = on(effects.planing);
  const propeller = on(effects.propeller);
  const manoeuvring = on(effects.manoeuvring);
  const seakeeping = on(effects.seakeeping);
  const xG = added?.centreOfGravity ?? 0;
  const yawRadius = added?.yawRadius ?? tuning.length / Math.sqrt(12);
  const inertia = {
    surge: added === undefined ? 0 : added.surge ?? hullSurgeAddedMass(m, tuning.length, density),
    sway: added?.sway ?? 0,
    yaw: added?.yaw ?? 0,
    xG,
    iz: Math.max(1, m * yawRadius * yawRadius + xG * xG * m + (added?.yaw ?? 0)),
  };
  let planingPrepared: PreparedEffects["planing"];
  if (planing !== undefined) {
    const floor = 0.6 * Math.sqrt(gravity * (planing.chineBeam ?? tuning.beam));
    const floorTrim = planingTrim(planing, tuning.beam, m, floor, tuning.water);
    planingPrepared = { bottom: planing, floor, floorTrim, floorResistance: planingForces(planing, tuning.beam, m, floor, floorTrim, tuning.water).resistance };
  }
  let seakeepingPrepared: PreparedEffects["seakeeping"];
  if (seakeeping !== undefined) {
    const frequency = seakeeping.referenceFrequency ?? sea?.peakFrequency;
    const key = `${tuning.length}|${tuning.beam}|${m}|${density}|${gravity}|${frequency ?? "natural"}`;
    let cached = seakeepingCache.get(seakeeping);
    if (cached === undefined) {
      cached = new Map();
      seakeepingCache.set(seakeeping, cached);
    }
    const prepared = cached.get(key) ?? prepareSeakeeping(seakeeping, tuning.length, tuning.beam, m, tuning.water, frequency);
    cached.set(key, prepared);
    const m11 = prepared.inertia[0] + prepared.addedMass[0];
    const m12 = prepared.addedMass[1];
    const m22 = prepared.inertia[2] + prepared.addedMass[2];
    const det = m11 * m22 - m12 * m12;
    seakeepingPrepared = { spec: seakeeping, prepared, excitation: sea === undefined ? undefined : seakeepingExcitation(prepared, sea), inverse: [m22 / det, -m12 / det, -m12 / det, m11 / det] };
  }
  return {
    planar: added !== undefined || resistance !== undefined || planing !== undefined || propeller !== undefined || manoeuvring !== undefined,
    density,
    resistance: resistance === undefined ? undefined : prepareHullResistance(resistance, tuning.length, tuning.beam, m, tuning.water),
    planing: planingPrepared,
    propeller: propeller === undefined ? undefined : { spec: propeller, curve: prepareOpenWater(propeller.openWater, propeller.diameter) },
    manoeuvring,
    inertia,
    seakeeping: seakeepingPrepared,
  };
}

/**
 * Creates a {@link BoatDynamics}: throttle drives the prop, brake reverses it, steer swings the rudder or outboard.
 * A rudder boat barely turns at rest unless the prop is washing over it; an outboard turns at rest because it swings
 * the thrust itself. Deterministic for a given `dt` sequence. With no `effects` the hull is the simple model above;
 * each effect in `tuning.effects` replaces its part of it with the physical term (see {@link BoatEffects}).
 * @capability boat-dynamics force-based powered hull — hull-speed drag hump, planing, keel, rudder that needs flow or outboard thrust; optional resistance, planing, propeller, MMG and seakeeping effects
 */
export function createBoatDynamics(initial: BoatTuning, options: BoatOptions = {}): BoatDynamics {
  let tuning = initial;
  const spawnY = options.position?.[1] ?? 0;
  let sea = options.sea;
  const waterHeight = options.waterHeight;
  let water = sea !== undefined ? seaHeight(sea) : waterHeight ?? (() => spawnY);
  const current = options.current;
  const state: BoatState = fresh(options.position ?? [0, 0, 0], options.heading ?? 0);
  let prepared = prepareEffects(tuning, sea);
  const level = () => sea?.level ?? options.waterLevel ?? spawnY;
  state.y = prepared.seakeeping === undefined ? water(state.x, state.z, 0) : level();
  const telemetry = { planing: 0, engineLoad: 0, thrust: 0, resistance: 0, propRevs: 0 };
  const hull: ManoeuvringLoads = [0, 0, 0];
  const steerLoads: ManoeuvringLoads = [0, 0, 0];
  const waveLoads: SeakeepingLoads = [0, 0, 0];

  function seaHeight(field: WaveField): (x: number, z: number, time: number) => number {
    return (x, z, time) => waveFieldHeight(field, x, z, time);
  }

  function fresh(position: readonly [number, number, number], heading: number): BoatState {
    return { x: position[0], y: position[1], z: position[2], heading, vx: 0, vz: 0, yawRate: 0, steerAngle: 0, time: 0, bodyPitch: 0, bodyRoll: 0, trim: 0, heave: 0, heaveRate: 0, pitch: 0, pitchRate: 0, roll: 0, rollRate: 0 };
  }

  function simpleSubstep(h: number, input: AxisInput): void {
    const t = tuning;
    const m = t.massKg;
    const [fx, fz] = forwardOf(state.heading);
    let relX = state.vx;
    let relZ = state.vz;
    if (current !== undefined) {
      const [cx, cz] = current(state.x, state.z);
      relX -= cx;
      relZ -= cz;
    }
    const u = relX * fx + relZ * fz;
    const v = -relX * fz + relZ * fx;
    const r = state.yawRate;

    const throttle = Math.max(0, Math.min(1, input.throttle));
    const reverse = Math.max(0, Math.min(1, input.brake));
    const steerInput = Math.max(-1, Math.min(1, input.steer));
    const steering = t.steering;
    const maxAngle = steering.maxAngle ?? (steering.kind === "rudder" ? 0.6 : 0.5);
    const targetAngle = -steerInput * maxAngle;
    const slew = (t.steerRate ?? 2) * h;
    state.steerAngle += Math.max(-slew, Math.min(slew, targetAngle - state.steerAngle));

    const propFade = Math.max(0, 1 - Math.max(0, u) / Math.max(0.1, t.propSpeed));
    const thrust = throttle * t.maxThrust * propFade - reverse * t.maxThrust * (t.reverseScale ?? 0.4);
    telemetry.engineLoad = Math.max(throttle * propFade, reverse);

    let forceLong = 0;
    let forceLat = 0;
    let yawMoment = 0;
    const lever = t.length * 0.45;
    if (steering.kind === "outboard") {
      // The motor swings its own thrust, so the stern is pushed sideways even at rest.
      forceLong += thrust * Math.cos(state.steerAngle);
      const side = thrust * Math.sin(state.steerAngle);
      forceLat += side;
      yawMoment += lever * side;
    } else {
      forceLong += thrust;
      const flow = Math.max(0, u) + (steering.propWash ?? 0.5) * Math.sqrt(Math.max(0, thrust) / (WATER_DENSITY * Math.max(0.05, steering.area)));
      // Rudder lift ≈ ½ρ·A·flow²·π·α (thin foil), stalled past ~0.6 rad. It pushes the stern away from the turn.
      const angle = Math.max(-0.6, Math.min(0.6, state.steerAngle));
      const lift = 0.5 * WATER_DENSITY * steering.area * flow * flow * Math.PI * angle;
      forceLat += lift;
      yawMoment += lever * lift;
    }

    const hullSpeed = 1.34 * Math.sqrt(GRAVITY * t.length);
    const planeSpeed = t.planingSpeed;
    const planing = planeSpeed === undefined ? 0 : Math.max(0, Math.min(1, (Math.abs(u) - planeSpeed * 0.8) / (planeSpeed * 0.4)));
    telemetry.planing = planing;
    // Wave-making drag climbs toward hull speed; a planing hull rides over it and sheds most of the hull drag.
    // A displacement hull that never planes keeps climbing its own bow wave, so past hull speed the drag is a wall.
    const over = Math.abs(u) / hullSpeed - 1;
    const hump =
      planeSpeed === undefined && over > 0
        ? 3.5 + 60 * over * over
        : 1 + 2.5 * Math.exp(-((over / 0.35) ** 2));
    const dragArea = (t.dragArea ?? 0.3 * t.beam) * (1 - planing * (1 - (t.planingDrag ?? 0.35))) * (planeSpeed === undefined ? hump : 1 + (hump - 1) * (1 - planing));
    const drag = 0.5 * WATER_DENSITY * dragArea * u * Math.abs(u) * 0.01;
    forceLong -= drag;
    telemetry.thrust = thrust;
    telemetry.resistance = drag;
    // A planing hull runs on a fraction of its bottom, so it grips the water less sideways and turns more freely.
    const keel = (t.keel ?? m * 6) * (1 - 0.7 * planing);
    forceLat -= keel * v * Math.abs(v) + m * 0.8 * v;
    // A turning hull drags every station of the keel sideways at r·x; integrated over the length that resists yaw.
    const length4 = t.length ** 4;
    yawMoment -= keel * r * Math.abs(r) * (length4 / 80) + m * 0.8 * r * (t.length * t.length) / 12 + (t.yawDamping ?? 0) * r;

    const iz = Math.max(1, m * t.length * t.length / 12);
    let du = forceLong / m - r * v;
    const dv = forceLat / m + r * u;
    if (h > 0 && thrust === 0 && Math.sign(u + du * h) !== Math.sign(u) && u !== 0) du = -u / h;
    const nu = u + du * h;
    const nv = v + dv * h;
    const nr = r + (yawMoment / iz) * h;

    state.heading += nr * h;
    const [nfx, nfz] = forwardOf(state.heading);
    let nvx = nfx * nu - nfz * nv;
    let nvz = nfz * nu + nfx * nv;
    if (current !== undefined) {
      const [cx, cz] = current(state.x, state.z);
      nvx += cx;
      nvz += cz;
    }
    state.vx = nvx;
    state.vz = nvz;
    state.yawRate = nr;
    state.x += nvx * h;
    state.z += nvz * h;
    state.time += h;
    state.y = water(state.x, state.z, state.time);

    const response = 1 - Math.exp(-4 * h);
    const climb = planeSpeed === undefined ? 0 : Math.max(0, Math.min(1, Math.abs(u) / planeSpeed)) * (1 - planing);
    const pitchTarget = -(t.bowRise ?? 0.12) * climb;
    const heelTarget = Math.max(-(t.maxHeel ?? 0.15), Math.min(t.maxHeel ?? 0.15, (r * u) / GRAVITY * (planing > 0.5 ? -0.4 : 0.25)));
    state.bodyPitch += (pitchTarget - state.bodyPitch) * response;
    state.bodyRoll += (heelTarget - state.bodyRoll) * response;
  }

  function effectSubstep(h: number, input: AxisInput): void {
    const t = tuning;
    const fx0 = prepared;
    const m = t.massKg;
    const rho = fx0.density;
    const [fx, fz] = forwardOf(state.heading);
    let relX = state.vx;
    let relZ = state.vz;
    if (current !== undefined) {
      const [cx, cz] = current(state.x, state.z);
      relX -= cx;
      relZ -= cz;
    }
    const u = relX * fx + relZ * fz;
    // Ship axes: v to starboard, r turning to starboard (the game's lateral axis points to port).
    const v = -(-relX * fz + relZ * fx);
    const r = state.yawRate;
    const speed = Math.hypot(u, v);

    const throttle = Math.max(0, Math.min(1, input.throttle));
    const reverse = Math.max(0, Math.min(1, input.brake));
    const steerInput = Math.max(-1, Math.min(1, input.steer));
    const steering = t.steering;
    const maxAngle = steering.maxAngle ?? (steering.kind === "rudder" ? 0.6 : 0.5);
    const slew = (t.steerRate ?? 2) * h;
    state.steerAngle += Math.max(-slew, Math.min(slew, -steerInput * maxAngle - state.steerAngle));
    const steer = state.steerAngle;

    let openThrust: number;
    let netThrust: number;
    let race = { inflow: Math.max(0, u), thrustCoefficient: 0, advance: 0, diameter: 0 };
    let leverShare = -0.45;
    const prop = fx0.propeller;
    if (prop !== undefined) {
      const spec = prop.spec;
      let wakeRatio = 1;
      const change = spec.wakeChange;
      if (change !== undefined && speed > 1e-9) {
        const drift = Math.atan2(-v, u) - (spec.position ?? -0.48) * ((r * t.length) / speed);
        const c2 = drift > 0 ? change.c2Positive : change.c2Negative;
        wakeRatio = 1 + (1 - Math.exp(-change.c1 * Math.abs(drift))) * (c2 - 1);
      }
      const inflow = Math.max(0, u * (1 - (spec.wake ?? 0)) * wakeRatio);
      const point = propellerPoint({ ...spec, reverseScale: spec.reverseScale ?? t.reverseScale ?? 0.4 }, prop.curve, inflow, throttle, reverse, rho);
      openThrust = point.thrust;
      netThrust = (1 - (spec.thrustDeduction ?? 0)) * openThrust;
      const count = spec.count ?? 1;
      const kt = point.revs > 1e-9 ? openThrust / (count * rho * point.revs * point.revs * spec.diameter ** 4) : 0;
      race = { inflow, thrustCoefficient: kt, advance: point.advance, diameter: spec.diameter };
      leverShare = spec.position ?? -0.48;
      telemetry.engineLoad = point.load;
      telemetry.propRevs = point.revs;
    } else {
      const propFade = Math.max(0, 1 - Math.max(0, u) / Math.max(0.1, t.propSpeed));
      openThrust = throttle * t.maxThrust * propFade - reverse * t.maxThrust * (t.reverseScale ?? 0.4);
      netThrust = openThrust;
      telemetry.engineLoad = Math.max(throttle * propFade, reverse);
      telemetry.propRevs = 0;
    }

    let X = 0;
    let Y = 0;
    let N = 0;
    const manoeuvring = fx0.manoeuvring;
    const mmgRudder = manoeuvring?.rudder;
    if (steering.kind === "outboard") {
      X += netThrust * Math.cos(steer);
      const side = -openThrust * Math.sin(steer);
      Y += side;
      N += leverShare * t.length * side;
    } else if (mmgRudder !== undefined) {
      X += netThrust;
      rudderForces(mmgRudder, t.length, rho, u, v, r, steer, race, steerLoads);
      X += steerLoads[0];
      Y += steerLoads[1];
      N += steerLoads[2];
    } else {
      X += netThrust;
      const flow = Math.max(0, u) + (steering.propWash ?? 0.5) * Math.sqrt(Math.max(0, openThrust) / (rho * Math.max(0.05, steering.area)));
      const angle = Math.max(-0.6, Math.min(0.6, steer));
      const lift = 0.5 * rho * steering.area * flow * flow * Math.PI * angle;
      Y -= lift;
      N += t.length * 0.45 * lift;
    }

    const planing = fx0.planing;
    let planingShare = 0;
    if (planing !== undefined) planingShare = Math.max(0, Math.min(1, (Math.abs(u) / planing.floor - 1) / 1.5));
    else if (t.planingSpeed !== undefined) planingShare = Math.max(0, Math.min(1, (Math.abs(u) - t.planingSpeed * 0.8) / (t.planingSpeed * 0.4)));
    telemetry.planing = planingShare;

    if (manoeuvring !== undefined) {
      hullManoeuvringForces(manoeuvring, t.length, rho, u, v, r, hull);
      X += hull[0];
      Y += hull[1];
      N += hull[2];
    } else {
      const keel = (t.keel ?? m * 6) * (1 - 0.7 * planingShare);
      Y -= keel * v * Math.abs(v) + m * 0.8 * v;
      N -= keel * r * Math.abs(r) * (t.length ** 4 / 80) + (m * 0.8 * r * t.length * t.length) / 12 + (t.yawDamping ?? 0) * r;
    }

    // Straight-running resistance acts on the whole speed through the water, as the MMG hull term does.
    const along = manoeuvring !== undefined ? Math.sign(u) * speed : u;
    let resistance: number;
    if (planing !== undefined && Math.abs(u) >= planing.floor) {
      const trim = Math.max(0.3 * DEG, state.trim);
      const at = planingForces(planing.bottom, t.beam, m, Math.abs(u), trim, t.water);
      resistance = Math.sign(u) * at.resistance;
      // A Newton step on the trimming moment gives the trim the hull is heading for; the trim eases toward it.
      const delta = 0.001;
      const slope = (planingForces(planing.bottom, t.beam, m, Math.abs(u), trim + delta, t.water).moment - at.moment) / delta;
      const target = slope > 0 ? Math.max(0.3 * DEG, Math.min(20 * DEG, trim - at.moment / slope)) : trim;
      state.trim += (target - state.trim) * (1 - Math.exp(-h / (planing.bottom.trimResponse ?? 0.4)));
    } else if (planing !== undefined) {
      const share = Math.abs(u) / planing.floor;
      const fallback = fx0.resistance;
      resistance = fallback !== undefined ? fallback(along) : Math.sign(u) * planing.floorResistance * share * share;
      state.trim += (planing.floorTrim * share - state.trim) * (1 - Math.exp(-h / (planing.bottom.trimResponse ?? 0.4)));
    } else if (fx0.resistance !== undefined) {
      resistance = fx0.resistance(along);
    } else {
      const hullSpeed = 1.34 * Math.sqrt(GRAVITY * t.length);
      const planeSpeed = t.planingSpeed;
      const over = Math.abs(u) / hullSpeed - 1;
      const hump = planeSpeed === undefined && over > 0 ? 3.5 + 60 * over * over : 1 + 2.5 * Math.exp(-((over / 0.35) ** 2));
      const dragArea = (t.dragArea ?? 0.3 * t.beam) * (1 - planingShare * (1 - (t.planingDrag ?? 0.35))) * (planeSpeed === undefined ? hump : 1 + (hump - 1) * (1 - planingShare));
      resistance = 0.5 * rho * dragArea * u * Math.abs(u) * 0.01;
    }
    X -= resistance;
    telemetry.thrust = netThrust;
    telemetry.resistance = resistance;

    const { surge, sway, xG, iz } = fx0.inertia;
    const mx = surge;
    const my = sway;
    let du = (X + (m + my) * v * r + xG * m * r * r) / (m + mx);
    const a = m + my;
    const b = xG * m;
    const yForce = Y - (m + mx) * u * r;
    const nMoment = N - xG * m * u * r;
    const det = a * iz - b * b;
    const dv = (yForce * iz - b * nMoment) / det;
    const dr = (a * nMoment - b * yForce) / det;
    if (h > 0 && openThrust === 0 && u !== 0 && Math.sign(u + du * h) !== Math.sign(u)) du = -u / h;
    const nu = u + du * h;
    const nvGame = -(v + dv * h);
    const nr = r + dr * h;

    state.heading += nr * h;
    const [nfx, nfz] = forwardOf(state.heading);
    let nvx = nfx * nu - nfz * nvGame;
    let nvz = nfz * nu + nfx * nvGame;
    if (current !== undefined) {
      const [cx, cz] = current(state.x, state.z);
      nvx += cx;
      nvz += cz;
    }
    state.vx = nvx;
    state.vz = nvz;
    state.yawRate = nr;
    state.x += nvx * h;
    state.z += nvz * h;
    state.time += h;
    state.y = water(state.x, state.z, state.time);

    const response = 1 - Math.exp(-4 * h);
    if (planing !== undefined) {
      state.bodyPitch = -state.trim;
    } else {
      const planeSpeed = t.planingSpeed;
      const climb = planeSpeed === undefined ? 0 : Math.max(0, Math.min(1, Math.abs(u) / planeSpeed)) * (1 - planingShare);
      state.bodyPitch += (-(t.bowRise ?? 0.12) * climb - state.bodyPitch) * response;
    }
    const heelTarget = Math.max(-(t.maxHeel ?? 0.15), Math.min(t.maxHeel ?? 0.15, (r * u) / GRAVITY * (planingShare > 0.5 ? -0.4 : 0.25)));
    state.bodyRoll += (heelTarget - state.bodyRoll) * response;
  }

  function seakeepingSubstep(h: number): void {
    const keeping = prepared.seakeeping;
    if (keeping === undefined) return;
    const [fx, fz] = forwardOf(state.heading);
    const still = level();
    if (sea !== undefined && keeping.excitation !== undefined) seakeepingForces(keeping.prepared, keeping.excitation, sea, state.x, state.z, fx, fz, state.time, waveLoads);
    else seakeepingForcesFromHeight(keeping.prepared, (x, z) => water(x, z, state.time), still, state.x, state.z, fx, fz, waveLoads);
    const p = keeping.prepared;
    const fHeave = waveLoads[0] - p.damping[0] * state.heaveRate - p.damping[1] * state.pitchRate - p.restoring[0] * state.heave - p.restoring[1] * state.pitch;
    const fPitch = waveLoads[1] - p.damping[1] * state.heaveRate - p.damping[2] * state.pitchRate - p.restoring[1] * state.heave - p.restoring[2] * state.pitch;
    const [i11, i12, i21, i22] = keeping.inverse;
    state.heaveRate += (i11 * fHeave + i12 * fPitch) * h;
    state.pitchRate += (i21 * fHeave + i22 * fPitch) * h;
    state.heave += state.heaveRate * h;
    state.pitch += state.pitchRate * h;
    const [rollInertia, rollDamping, rollStiffness] = p.roll;
    state.rollRate += ((waveLoads[2] - rollDamping * state.rollRate - rollStiffness * state.roll) / Math.max(1e-9, rollInertia)) * h;
    state.roll += state.rollRate * h;
    state.y = still + state.heave;
  }

  return {
    tick(dt, input) {
      const maxSub = Math.max(1 / 2000, tuning.maxSubstep ?? DEFAULT_SUBSTEP);
      const steps = dt > 0 ? Math.max(1, Math.ceil(dt / maxSub - 1e-9)) : 0;
      const h = steps > 0 ? dt / steps : 0;
      for (let i = 0; i < steps; i += 1) {
        if (prepared.planar) effectSubstep(h, input);
        else simpleSubstep(h, input);
        seakeepingSubstep(h);
      }
      const [fx, fz] = forwardOf(state.heading);
      return {
        position: [state.x, state.y, state.z],
        heading: state.heading,
        forwardSpeed: state.vx * fx + state.vz * fz,
        lateralSpeed: -state.vx * fz + state.vz * fx,
        yawRate: state.yawRate,
        steerAngle: -state.steerAngle,
        planing: telemetry.planing,
        engineLoad: telemetry.engineLoad,
        thrust: telemetry.thrust,
        resistance: telemetry.resistance,
        propRevs: telemetry.propRevs,
        bodyPitch: state.bodyPitch + state.pitch,
        bodyRoll: state.bodyRoll + state.roll,
        airOffset: 0,
        airborne: false,
      };
    },
    pose: () => ({ position: [state.x, state.y, state.z], heading: state.heading }),
    velocity: () => [state.vx, state.vz],
    applyImpulse(dvx, dvz) {
      state.vx += dvx;
      state.vz += dvz;
    },
    retune(next) {
      tuning = next;
      prepared = prepareEffects(tuning, sea);
    },
    tuning: () => tuning,
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    resetTo(position, heading) {
      Object.assign(state, fresh(position, heading));
      state.y = prepared.seakeeping === undefined ? water(state.x, state.z, 0) : level();
    },
    setSea(next) {
      sea = next;
      water = sea !== undefined ? seaHeight(sea) : waterHeight ?? (() => spawnY);
      prepared = prepareEffects(tuning, sea);
    },
  };
}
