import type { AxisInput } from "../input/axisInput";

const GRAVITY = 9.81;
const WATER_DENSITY = 1025;
const DEFAULT_SUBSTEP = 1 / 240;

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
}

/** World hooks for a boat instance. */
export interface BoatOptions {
  position?: readonly [number, number, number];
  heading?: number;
  /** Water surface height, m, under a point at a time (waves); default flat at the spawn height. */
  waterHeight?: (x: number, z: number, time: number) => number;
  /** Surface current, m/s, `[vx, vz]`; the hull drags toward it. */
  current?: (x: number, z: number) => readonly [number, number];
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
}

function forwardOf(heading: number): readonly [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

/**
 * Creates a {@link BoatDynamics}: throttle drives the prop, brake reverses it, steer swings the rudder or outboard.
 * A rudder boat barely turns at rest unless the prop is washing over it; an outboard turns at rest because it swings
 * the thrust itself. Deterministic for a given `dt` sequence.
 * @capability boat-dynamics force-based powered hull — hull-speed drag hump, planing, keel, rudder that needs flow or outboard thrust
 */
export function createBoatDynamics(initial: BoatTuning, options: BoatOptions = {}): BoatDynamics {
  let tuning = initial;
  const spawnY = options.position?.[1] ?? 0;
  const water = options.waterHeight ?? (() => spawnY);
  const current = options.current;
  const state: BoatState = fresh(options.position ?? [0, 0, 0], options.heading ?? 0);
  state.y = water(state.x, state.z, 0);
  const telemetry = { planing: 0, engineLoad: 0 };

  function fresh(position: readonly [number, number, number], heading: number): BoatState {
    return { x: position[0], y: position[1], z: position[2], heading, vx: 0, vz: 0, yawRate: 0, steerAngle: 0, time: 0, bodyPitch: 0, bodyRoll: 0 };
  }

  function substep(h: number, input: AxisInput): void {
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
    forceLong -= 0.5 * WATER_DENSITY * dragArea * u * Math.abs(u) * 0.01;
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

  return {
    tick(dt, input) {
      const maxSub = Math.max(1 / 2000, tuning.maxSubstep ?? DEFAULT_SUBSTEP);
      const steps = dt > 0 ? Math.max(1, Math.ceil(dt / maxSub - 1e-9)) : 0;
      const h = steps > 0 ? dt / steps : 0;
      for (let i = 0; i < steps; i += 1) substep(h, input);
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
        bodyPitch: state.bodyPitch,
        bodyRoll: state.bodyRoll,
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
    },
    tuning: () => tuning,
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    resetTo(position, heading) {
      Object.assign(state, fresh(position, heading));
      state.y = water(state.x, state.z, 0);
    },
  };
}
