import { uniformGravity, type GravityField } from "./gravityField";

const DEFAULT_SUBSTEP = 1 / 240;
const SEA_LEVEL_DENSITY = 1.225;

/** Body-frame or world-frame vector, m or N. The body frame is `[left, up, forward]` about the centre of mass. */
export type AircraftVector = readonly [number, number, number];

/** Unit quaternion `[x, y, z, w]` taking body-frame vectors to world space. */
export type AircraftQuaternion = readonly [number, number, number, number];

/**
 * One lifting surface: a wing panel, a tailplane, a fin, a canard. Its lift acts at `at`, so the moments that pitch,
 * roll and yaw the body come from where the surfaces sit, not from commanded rates.
 */
export interface AircraftSurface {
  /** Mount point relative to the centre of mass, body frame `[left, up, forward]`, m. */
  at: AircraftVector;
  /** Direction positive lift pushes, body frame (default `[0, 1, 0]`, a horizontal surface; `[1, 0, 0]` is a fin). Kept perpendicular to the chord, which runs along body forward. */
  normal?: AircraftVector;
  /** Planform area, m². */
  area: number;
  /** Lift curve slope, per rad (default `5`; thin-airfoil theory gives `2π`, lower for short spans). */
  liftSlope?: number;
  /** Angle of attack where the surface stalls, rad (default `0.28`). */
  stallAngle?: number;
  /** Lift kept past the stall as a share of peak lift, `0..1` (default `0.6`). */
  postStallLift?: number;
  /** Fixed mounting angle added to the local angle of attack, rad (default `0`); trims the cruise attitude. */
  incidence?: number;
  /** Zero-lift drag coefficient `CD0` of the drag polar `CD = CD0 + k·CL²` (default `0.02`). */
  cd0?: number;
  /** Induced drag factor `k` of the drag polar (default `0.06`). */
  inducedDrag?: number;
  /**
   * Control authority: angle-of-attack change, rad, per rad of each channel's deflection. The sim signs it from the
   * surface's lever arm, so positive input always gives nose-up pitch, right roll and nose-right yaw. A surface on the
   * centreline has no roll arm, so its `roll` does nothing.
   */
  control?: { pitch?: number; roll?: number; yaw?: number };
}

/** One control channel's actuator: how far the surfaces move and how fast. */
export interface AircraftControlChannel {
  /** Largest deflection, rad (default `0.35`). */
  maxDeflection?: number;
  /** Actuator slew rate, rad/s (default `2`). */
  rate?: number;
}

/** A thrust source fixed to the body. */
export interface AircraftEngineTuning {
  /** Thrust at full throttle, N. */
  maxThrust: number;
  /** Engine spool response, 1/s: thrust follows the throttle with this first-order rate (default `1.5`; ~1.5 s to 90%). */
  spoolRate?: number;
  /** Thrust line offset from the centre of mass, body frame m (default on the centre of mass). */
  at?: AircraftVector;
  /** Thrust direction, body frame (default `[0, 0, 1]`, forward). */
  direction?: AircraftVector;
}

/** Wheels or skids: what the body rests on when it touches the ground. */
export interface AircraftGearTuning {
  /** Height of the centre of mass above the ground when resting on the gear, m. */
  height: number;
  /** Rolling resistance coefficient (default `0.02`). */
  rollingResistance?: number;
  /** Deceleration at full `brake`, m/s² (default `4`). */
  brakeDecel?: number;
  /** Sideways friction coefficient of the tyres or skids (default `0.8`). */
  sideGrip?: number;
  /** Largest nose-up attitude the gear allows before the tail strikes, rad (default `0.25`). */
  maxPitch?: number;
}

/**
 * A main rotor. Collective sets blade pitch, throttle sets rotor speed, and cyclic (the pitch and roll channels) tilts
 * the disc. Its drag torque yaws the body the other way unless a tail rotor, a second rotor or a pedal input cancels it.
 */
export interface AircraftRotorTuning {
  /** Thrust at full collective and full rotor speed, out of ground effect and in a hover, N. */
  maxThrust: number;
  /** Blade radius, m. Sets the disc area, so the induced velocity behind translational lift, and the ground-effect height. */
  radius: number;
  /** Hub position relative to the centre of mass, body frame m (default `[0, 1.5, 0]`). A hub above the centre of mass turns disc tilt into pitch and roll moments. */
  at?: AircraftVector;
  /** Rotor speed response to throttle, 1/s (default `0.5`): rotors spin up slowly. */
  spoolRate?: number;
  /**
   * Drag torque on the body at full collective and full rotor speed, N·m, scaling with collective and rotor speed².
   * Positive yaws the nose left (a rotor turning counter-clockwise seen from above); negative yaws it right.
   */
  torque: number;
  /** Disc tilt at full cyclic, rad (default `0.15`); the pitch and roll actuators set how fast it gets there. */
  cyclic?: number;
  /** Extra thrust once the rotor moves into clean air, as a share of thrust (default `0.2`): translational lift. */
  translationalLift?: number;
  /** Pitch and roll damping from the disc, N·m per rad/s (default `0`). */
  damping?: number;
  /**
   * Tail rotor: sideways thrust at full yaw input and full rotor speed, N, acting at `at` (body frame m). Neutral pedal
   * gives no thrust, so holding heading takes a yaw input that matches the main rotor torque. `sideDamping`, N per m/s
   * of sideways air through it (default `maxThrust / 10`), is the yaw damping a spinning tail rotor adds.
   */
  tail?: { maxThrust: number; at: AircraftVector; sideDamping?: number };
}

/**
 * A rigid aircraft in physical units. There is no aircraft type: a jet, a glider and a paper plane differ only in these
 * numbers. Rotation comes from surface forces acting on the inertia tensor, so loops, rolls, stalls and weathervaning
 * are outcomes, not special cases.
 */
export interface RigidAircraftTuning {
  /** Mass, kg. */
  massKg: number;
  /** Principal moments of inertia about the body axes, kg·m²: `pitch` about left, `yaw` about up, `roll` about forward. */
  inertia: { pitch: number; yaw: number; roll: number };
  surfaces: readonly AircraftSurface[];
  engine?: AircraftEngineTuning;
  rotor?: AircraftRotorTuning;
  /** Actuators per channel; each channel defaults to `{ maxDeflection: 0.35, rate: 2 }`. */
  controls?: { pitch?: AircraftControlChannel; roll?: AircraftControlChannel; yaw?: AircraftControlChannel };
  /** Fuselage drag coefficient × frontal area, m² (default `0`). */
  dragArea?: number;
  /** Omit for a body that never touches the ground (it falls through). */
  gear?: AircraftGearTuning;
  /** Integration substep, s (default `1/240`). */
  maxSubstep?: number;
}

/** Pilot input for one tick. */
export interface RigidAircraftInput {
  /** `0..1`. */
  throttle: number;
  /** `-1..1`, positive pulls the nose up. */
  pitch: number;
  /** `-1..1`, positive rolls right (right wing down). */
  roll: number;
  /** `-1..1`, positive yaws the nose right. */
  yaw: number;
  /** Wheel brake, `0..1`. */
  brake?: number;
  /** Rotor collective, `0..1` (default `0`). */
  collective?: number;
}

/** Per-tick overrides layered over tuning: damage, icing, boost, gusts. Each scale defaults to `1`. */
export interface RigidAircraftModifiers {
  thrustScale?: number;
  liftScale?: number;
  dragScale?: number;
  /** Extra world-space force this tick, N — a tow, a gust, a tractor beam. */
  force?: AircraftVector;
  /** Extra body-frame torque this tick, N·m `[about left, about up, about forward]`. */
  torque?: AircraftVector;
}

/** World hooks for one aircraft instance. */
export interface RigidAircraftOptions {
  position?: AircraftVector;
  velocity?: AircraftVector;
  /** Spawn heading, rad, with forward `[sin h, 0, cos h]`; ignored when `orientation` is set. */
  heading?: number;
  orientation?: AircraftQuaternion;
  /** Wind velocity at a point, m/s. */
  wind?: (position: AircraftVector) => AircraftVector;
  /** Terrain height under a point; the gear rests on it. Default `0`. */
  groundHeight?: (x: number, z: number) => number;
  /** Default uniform `9.81` m/s² down. */
  gravityField?: GravityField;
  /** Air density at an altitude, kg/m³ (default sea level, `1.225`). */
  airDensity?: (altitude: number) => number;
}

/** Serializable integrator state: everything `restore` needs to resume bit-for-bit. */
export interface RigidAircraftState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Angular velocity, body frame rad/s. */
  wx: number;
  wy: number;
  wz: number;
  pitchDeflection: number;
  rollDeflection: number;
  yawDeflection: number;
  /** Engine output as a share of `maxThrust`, `0..1`. */
  spool: number;
  /** Rotor speed as a share of its rated speed, `0..1`. */
  rotorSpeed: number;
  time: number;
}

/** One aircraft tick: pose plus the telemetry HUDs, camera, sound and probes read. */
export interface RigidAircraftStep {
  position: AircraftVector;
  velocity: AircraftVector;
  orientation: AircraftQuaternion;
  /** Heading, rad, forward `[sin h, 0, cos h]`; equals three.js `rotation.y` in `YXZ` order. */
  heading: number;
  /** Nose-up attitude, rad; three.js `rotation.x = -pitch` in `YXZ` order. */
  pitch: number;
  /** Bank, rad, positive right wing down; three.js `rotation.z` in `YXZ` order. */
  bank: number;
  /** Body rates, rad/s: positive nose up, nose right, right roll. */
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  /** Speed relative to the air, m/s. */
  airspeed: number;
  /** Angle of attack at the centre of mass, rad. */
  angleOfAttack: number;
  /** Sideslip, rad, positive when the body moves to its right. */
  sideslip: number;
  /** Load factor along the body's up axis, g; `1` in level flight, `0` in free fall. */
  gLoad: number;
  /** The largest surface is past its stall angle. */
  stalled: boolean;
  /** Share of surface area past its stall angle, `0..1`. */
  stallFraction: number;
  /** Engine thrust this tick, N. */
  thrust: number;
  /** Current actuator deflection per channel, rad. */
  deflection: { pitch: number; roll: number; yaw: number };
  grounded: boolean;
  /** Rotor telemetry; absent without a `rotor` block. */
  rotor?: {
    /** Rotor speed, share of rated, `0..1`. */
    speed: number;
    /** Main rotor thrust, N. */
    thrust: number;
    /** Drag torque on the body, N·m, positive nose left. */
    torque: number;
    /** Thrust multiplier from ground effect, `≥ 1`. */
    groundEffect: number;
    /** Thrust multiplier from translational lift, `≥ 1`. */
    translationalLift: number;
  };
}

/** A force-and-torque aircraft on the same tick/snapshot/retune contract as `VehicleDynamics`. */
export interface RigidAircraft {
  tick(dt: number, input: RigidAircraftInput, modifiers?: RigidAircraftModifiers): RigidAircraftStep;
  pose(): { position: AircraftVector; orientation: AircraftQuaternion };
  velocity(): AircraftVector;
  /** Adds a world-space velocity change, m/s — a hit, a catapult, an explosion. */
  applyImpulse(dv: AircraftVector): void;
  retune(next: RigidAircraftTuning): void;
  tuning(): RigidAircraftTuning;
  snapshot(): RigidAircraftState;
  restore(state: RigidAircraftState): void;
  resetTo(position: AircraftVector, orientation?: AircraftQuaternion): void;
}

interface PreparedSurface {
  ax: number;
  ay: number;
  az: number;
  nx: number;
  ny: number;
  nz: number;
  sx: number;
  sy: number;
  sz: number;
  area: number;
  slope: number;
  stall: number;
  postStall: number;
  incidence: number;
  cd0: number;
  k: number;
  kPitch: number;
  kRoll: number;
  kYaw: number;
}

/** Quaternion for a heading about world up, forward `[sin h, 0, cos h]`. */
export function aircraftHeadingQuaternion(heading: number): AircraftQuaternion {
  return [0, Math.sin(heading / 2), 0, Math.cos(heading / 2)];
}

/**
 * Quaternion from heading, nose-up pitch and right bank, rad — the inverse of a step's `heading`/`pitch`/`bank`.
 * Matches three.js `Euler(-pitch, heading, bank, "YXZ")`.
 */
export function aircraftAttitudeQuaternion(heading: number, pitch: number, bank: number): AircraftQuaternion {
  const [x1, y1, z1, w1] = aircraftHeadingQuaternion(heading);
  const hx = -pitch / 2;
  const [x2, w2] = [Math.sin(hx), Math.cos(hx)];
  const hz = bank / 2;
  const [z3, w3] = [Math.sin(hz), Math.cos(hz)];
  const ax = w1 * x2 + x1 * w2;
  const ay = y1 * w2 + z1 * x2;
  const az = z1 * w2 - y1 * x2;
  const aw = w1 * w2 - x1 * x2;
  return [ax * w3 + ay * z3, ay * w3 - ax * z3, az * w3 + aw * z3, aw * w3 - az * z3];
}

function prepareSurface(surface: AircraftSurface): PreparedSurface {
  const [ax, ay, az] = surface.at;
  let [nx, ny, nz] = surface.normal ?? [0, 1, 0];
  nz = 0;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  // Span s = n × forward; the chord always runs along body forward.
  const sx = ny;
  const sy = -nx;
  const sz = 0;
  // The lever arm at × n says which way this surface's lift turns the body; controls are signed from it.
  const mx = ay * nz - az * ny;
  const my = az * nx - ax * nz;
  const mz = ax * ny - ay * nx;
  const signed = (gain: number | undefined, axis: number): number => (gain === undefined || Math.abs(axis) < 1e-9 ? 0 : Math.sign(axis) * gain);
  return {
    ax,
    ay,
    az,
    nx,
    ny,
    nz,
    sx,
    sy,
    sz,
    area: surface.area,
    slope: surface.liftSlope ?? 5,
    stall: surface.stallAngle ?? 0.28,
    postStall: surface.postStallLift ?? 0.6,
    incidence: surface.incidence ?? 0,
    cd0: surface.cd0 ?? 0.02,
    k: surface.inducedDrag ?? 0.06,
    kPitch: signed(surface.control?.pitch, -mx),
    kRoll: signed(surface.control?.roll, mz),
    kYaw: signed(surface.control?.yaw, -my),
  };
}

function wrapAngle(angle: number): number {
  if (angle > Math.PI) return angle - 2 * Math.PI;
  if (angle < -Math.PI) return angle + 2 * Math.PI;
  return angle;
}

/** Lift coefficient: linear to the stall, then a flat-plate `sin 2α` curve scaled to `postStall` of peak. */
function liftCoefficient(alpha: number, slope: number, stall: number, postStall: number): { cl: number; stalled: number } {
  const magnitude = Math.abs(alpha);
  if (magnitude <= stall) return { cl: slope * alpha, stalled: 0 };
  const peak = slope * stall;
  const plate = (Math.sin(2 * alpha) * peak * postStall) / Math.max(1e-6, Math.sin(2 * stall));
  const blend = Math.exp(-(magnitude - stall) / 0.04);
  return { cl: plate + (Math.sign(alpha) * peak - plate) * blend, stalled: 1 - blend };
}

/**
 * Creates a {@link RigidAircraft}: a quaternion rigid body with a diagonal inertia tensor, pushed by lifting surfaces,
 * fuselage drag, an engine and gravity. Controls deflect surfaces through rate-limited actuators; nothing commands a
 * rotation rate, so a jet loops when its tail can push the nose around and a glider stalls when it runs out of speed.
 * Fixed internal substeps make it deterministic for a given `dt` sequence.
 * @capability rigid-aircraft force-and-torque aircraft — lifting surfaces with stall and drag polar, control surfaces, inertia, loops and rolls
 */
export function createRigidAircraft(initial: RigidAircraftTuning, options: RigidAircraftOptions = {}): RigidAircraft {
  let tuning = initial;
  let surfaces = initial.surfaces.map(prepareSurface);
  let largest = largestSurface(surfaces);
  const windAt = options.wind;
  const groundAt = options.groundHeight ?? (() => 0);
  const gravityField = options.gravityField ?? uniformGravity([0, -9.81, 0]);
  const densityAt = options.airDensity ?? (() => SEA_LEVEL_DENSITY);
  const state: RigidAircraftState = fresh(options.position ?? [0, 0, 0], options.orientation ?? aircraftHeadingQuaternion(options.heading ?? 0));
  if (options.velocity !== undefined) [state.vx, state.vy, state.vz] = options.velocity;
  const telemetry = { airspeed: 0, alpha: 0, sideslip: 0, gLoad: 1, stallFraction: 0, stalled: false, thrust: 0, grounded: false };
  const rotorTelemetry = { thrust: 0, torque: 0, groundEffect: 1, translationalLift: 1 };

  function largestSurface(list: readonly PreparedSurface[]): number {
    let best = -1;
    for (let i = 0; i < list.length; i += 1) if (best < 0 || list[i]!.area > list[best]!.area) best = i;
    return best;
  }

  function fresh(position: AircraftVector, orientation: AircraftQuaternion): RigidAircraftState {
    const [qx, qy, qz, qw] = orientation;
    const n = Math.hypot(qx, qy, qz, qw) || 1;
    return {
      x: position[0],
      y: position[1],
      z: position[2],
      vx: 0,
      vy: 0,
      vz: 0,
      qx: qx / n,
      qy: qy / n,
      qz: qz / n,
      qw: qw / n,
      wx: 0,
      wy: 0,
      wz: 0,
      pitchDeflection: 0,
      rollDeflection: 0,
      yawDeflection: 0,
      spool: 0,
      rotorSpeed: 0,
      time: 0,
    };
  }

  // Scratch for rotating vectors without allocating in the substep.
  const out = [0, 0, 0];
  function toWorld(x: number, y: number, z: number): void {
    const { qx, qy, qz, qw } = state;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    out[0] = x + qw * tx + (qy * tz - qz * ty);
    out[1] = y + qw * ty + (qz * tx - qx * tz);
    out[2] = z + qw * tz + (qx * ty - qy * tx);
  }
  function toBody(x: number, y: number, z: number): void {
    const { qx, qy, qz, qw } = state;
    const tx = 2 * (-qy * z + qz * y);
    const ty = 2 * (-qz * x + qx * z);
    const tz = 2 * (-qx * y + qy * x);
    out[0] = x + qw * tx + (-qy * tz + qz * ty);
    out[1] = y + qw * ty + (-qz * tx + qx * tz);
    out[2] = z + qw * tz + (-qx * ty + qy * tx);
  }

  function slew(current: number, target: number, rate: number, h: number): number {
    const step = rate * h;
    return current + Math.max(-step, Math.min(step, target - current));
  }

  function substep(h: number, input: RigidAircraftInput, modifiers: RigidAircraftModifiers | undefined): void {
    const t = tuning;
    const m = t.massKg;
    const controls = t.controls;
    const pitchCh = controls?.pitch;
    const rollCh = controls?.roll;
    const yawCh = controls?.yaw;
    state.pitchDeflection = slew(state.pitchDeflection, clamp1(input.pitch) * (pitchCh?.maxDeflection ?? 0.35), pitchCh?.rate ?? 2, h);
    state.rollDeflection = slew(state.rollDeflection, clamp1(input.roll) * (rollCh?.maxDeflection ?? 0.35), rollCh?.rate ?? 2, h);
    state.yawDeflection = slew(state.yawDeflection, clamp1(input.yaw) * (yawCh?.maxDeflection ?? 0.35), yawCh?.rate ?? 2, h);
    const engine = t.engine;
    const throttle = Math.max(0, Math.min(1, input.throttle));
    state.spool += (throttle - state.spool) * (1 - Math.exp(-(engine?.spoolRate ?? 1.5) * h));

    let wvx = state.vx;
    let wvy = state.vy;
    let wvz = state.vz;
    if (windAt !== undefined) {
      const wind = windAt([state.x, state.y, state.z]);
      wvx -= wind[0];
      wvy -= wind[1];
      wvz -= wind[2];
    }
    toBody(wvx, wvy, wvz);
    const bx = out[0]!;
    const by = out[1]!;
    const bz = out[2]!;
    const rho = densityAt(state.y);
    const { wx, wy, wz } = state;
    const liftScale = modifiers?.liftScale ?? 1;
    const dragScale = modifiers?.dragScale ?? 1;

    let fx = 0;
    let fy = 0;
    let fz = 0;
    let mx = modifiers?.torque?.[0] ?? 0;
    let my = modifiers?.torque?.[1] ?? 0;
    let mz = modifiers?.torque?.[2] ?? 0;
    let stalledArea = 0;
    let totalArea = 0;
    let largestStalled = false;
    for (let i = 0; i < surfaces.length; i += 1) {
      const s = surfaces[i]!;
      totalArea += s.area;
      // Local airflow includes the body's rotation (ω × r): that is where pitch, roll and yaw damping come from.
      const px = bx + (wy * s.az - wz * s.ay);
      const py = by + (wz * s.ax - wx * s.az);
      const pz = bz + (wx * s.ay - wy * s.ax);
      const un = px * s.nx + py * s.ny + pz * s.nz;
      const uf = pz;
      const speed2 = un * un + uf * uf;
      if (speed2 < 1e-8) continue;
      const alpha = wrapAngle(
        Math.atan2(-un, uf) + s.incidence + s.kPitch * state.pitchDeflection + s.kRoll * state.rollDeflection + s.kYaw * state.yawDeflection,
      );
      const { cl, stalled } = liftCoefficient(alpha, s.slope, s.stall, s.postStall);
      // Below ~1 m/s of local flow the angle of attack is noise, not a stall.
      if (stalled > 0.5 && speed2 > 1) {
        stalledArea += s.area;
        if (i === largest) largestStalled = true;
      }
      const cd = s.cd0 + s.k * cl * cl + 1.28 * Math.sin(alpha) ** 2 * stalled;
      const speed = Math.sqrt(speed2);
      // d: direction the air moves past the surface; lift is perpendicular to it, in the plane across the span.
      const dx = -(un * s.nx) / speed;
      const dy = -(un * s.ny) / speed;
      const dz = -(un * s.nz + uf) / speed;
      const lx = s.sy * dz - s.sz * dy;
      const ly = s.sz * dx - s.sx * dz;
      const lz = s.sx * dy - s.sy * dx;
      const q = 0.5 * rho * speed2 * s.area;
      const lift = q * cl * liftScale;
      const drag = q * cd * dragScale;
      const sfx = lift * lx + drag * dx;
      const sfy = lift * ly + drag * dy;
      const sfz = lift * lz + drag * dz;
      fx += sfx;
      fy += sfy;
      fz += sfz;
      mx += s.ay * sfz - s.az * sfy;
      my += s.az * sfx - s.ax * sfz;
      mz += s.ax * sfy - s.ay * sfx;
    }

    const airspeed = Math.hypot(bx, by, bz);
    if (t.dragArea !== undefined && airspeed > 0) {
      const k = -0.5 * rho * t.dragArea * airspeed * dragScale;
      fx += k * bx;
      fy += k * by;
      fz += k * bz;
    }

    let thrust = 0;
    if (engine !== undefined) {
      thrust = engine.maxThrust * state.spool * (modifiers?.thrustScale ?? 1);
      const [tdx, tdy, tdz] = engine.direction ?? [0, 0, 1];
      const tl = Math.hypot(tdx, tdy, tdz) || 1;
      const tx = (thrust * tdx) / tl;
      const ty = (thrust * tdy) / tl;
      const tz = (thrust * tdz) / tl;
      fx += tx;
      fy += ty;
      fz += tz;
      if (engine.at !== undefined) {
        const [ax, ay, az] = engine.at;
        mx += ay * tz - az * ty;
        my += az * tx - ax * tz;
        mz += ax * ty - ay * tx;
      }
    }

    const rotor = t.rotor;
    if (rotor !== undefined) {
      state.rotorSpeed += (throttle - state.rotorSpeed) * (1 - Math.exp(-(rotor.spoolRate ?? 0.5) * h));
      const [hx, hy, hz] = rotor.at ?? [0, 1.5, 0];
      const cyclic = rotor.cyclic ?? 0.15;
      const tiltPitch = (state.pitchDeflection / (pitchCh?.maxDeflection ?? 0.35)) * cyclic;
      const tiltRoll = (state.rollDeflection / (rollCh?.maxDeflection ?? 0.35)) * cyclic;
      // Nose-up cyclic tilts the disc back (−forward), right cyclic tilts it right (−left).
      let dx = -Math.sin(tiltRoll);
      let dz = -Math.sin(tiltPitch);
      let dy = Math.sqrt(Math.max(0, 1 - dx * dx - dz * dz));
      const collective = clamp01(input.collective ?? 0);
      const rpm2 = state.rotorSpeed * state.rotorSpeed;
      const nominal = rotor.maxThrust * collective * rpm2;
      const disc = Math.PI * rotor.radius * rotor.radius;
      // Momentum theory: hover induced velocity v_i = √(T / 2ρA). Clean air arriving at about v_i adds translational
      // lift; climbing through the disc at w cuts thrust by roughly w / 2v_i, which damps vertical motion.
      const induced = Math.sqrt(Math.max(nominal, rotor.maxThrust * 0.05) / (2 * rho * disc));
      const hubVx = bx + (wy * hz - wz * hy);
      const hubVy = by + (wz * hx - wx * hz);
      const hubVz = bz + (wx * hy - wy * hx);
      const edgewise = Math.hypot(hubVx, hubVz);
      const translational = 1 + (rotor.translationalLift ?? 0.2) * (1 - Math.exp(-((edgewise / induced) ** 2)));
      const inflow = Math.max(0.2, Math.min(1.5, 1 - hubVy / (2 * induced)));
      toWorld(hx, hy, hz);
      const clearance = Math.max(rotor.radius / 2, state.y + out[1]! - groundAt(state.x, state.z));
      // Cheeseman–Bennett: T_IGE / T_OGE = 1 / (1 − (R / 4z)²).
      const groundEffect = 1 / (1 - (rotor.radius / (4 * clearance)) ** 2);
      const rotorThrust = nominal * translational * inflow * groundEffect;
      dx *= rotorThrust;
      dy *= rotorThrust;
      dz *= rotorThrust;
      fx += dx;
      fy += dy;
      fz += dz;
      mx += hy * dz - hz * dy;
      my += hz * dx - hx * dz;
      mz += hx * dy - hy * dx;
      const torque = rotor.torque * collective * rpm2;
      my += torque;
      const damping = rotor.damping ?? 0;
      mx -= damping * wx;
      mz -= damping * wz;
      if (rotor.tail !== undefined) {
        const [, ty, tz] = rotor.tail.at;
        const side = bx + (wy * tz - wz * ty);
        const tailThrust =
          rotor.tail.maxThrust * rpm2 * (state.yawDeflection / (yawCh?.maxDeflection ?? 0.35)) -
          (rotor.tail.sideDamping ?? rotor.tail.maxThrust / 10) * state.rotorSpeed * side;
        fx += tailThrust;
        // A sideways force along +left at the tail: moment = at × (F, 0, 0).
        my += tz * tailThrust;
        mz -= ty * tailThrust;
      }
      rotorTelemetry.thrust = rotorThrust;
      rotorTelemetry.torque = torque;
      rotorTelemetry.groundEffect = groundEffect;
      rotorTelemetry.translationalLift = translational;
    }

    toWorld(fx, fy, fz);
    let ax = out[0]! / m;
    let ay = out[1]! / m;
    let az = out[2]! / m;
    if (modifiers?.force !== undefined) {
      ax += modifiers.force[0] / m;
      ay += modifiers.force[1] / m;
      az += modifiers.force[2] / m;
    }
    const gravity = gravityField.sample([state.x, state.y, state.z]);

    const gear = t.gear;
    const floor = gear === undefined ? Number.NEGATIVE_INFINITY : groundAt(state.x, state.z) + gear.height;
    let grounded = gear !== undefined && state.y <= floor + 1e-4;
    let supportY = 0;
    if (grounded && gear !== undefined) {
      const netY = ay + gravity[1];
      if (netY <= 0) {
        supportY = -netY;
        const load = supportY;
        // Heading-aligned tyre frame on flat ground: rolling resistance and brakes along, grip across.
        toWorld(0, 0, 1);
        const hl = Math.hypot(out[0]!, out[2]!) || 1;
        const hx = out[0]! / hl;
        const hz = out[2]! / hl;
        const along = state.vx * hx + state.vz * hz;
        const across = -state.vx * hz + state.vz * hx;
        const roll = (gear.rollingResistance ?? 0.02) * load + clamp01(input.brake ?? 0) * (gear.brakeDecel ?? 4);
        const alongDv = Math.min(Math.abs(along), roll * h) * Math.sign(along);
        const acrossDv = Math.min(Math.abs(across), (gear.sideGrip ?? 0.8) * load * h) * Math.sign(across);
        ax -= (alongDv * hx - acrossDv * hz) / h;
        az -= (alongDv * hz + acrossDv * hx) / h;
      } else {
        grounded = false;
      }
    }

    state.vx += (ax + gravity[0]) * h;
    state.vy += (ay + gravity[1] + supportY) * h;
    state.vz += (az + gravity[2]) * h;
    state.x += state.vx * h;
    state.y += state.vy * h;
    state.z += state.vz * h;

    const { pitch: ip, yaw: iy, roll: ir } = t.inertia;
    // Euler's rotation equation, body frame: I·ω̇ = M − ω × (I·ω).
    const gx = wy * (ir * wz) - wz * (iy * wy);
    const gy = wz * (ip * wx) - wx * (ir * wz);
    const gz = wx * (iy * wy) - wy * (ip * wx);
    state.wx += ((mx - gx) / ip) * h;
    state.wy += ((my - gy) / iy) * h;
    state.wz += ((mz - gz) / ir) * h;
    integrateOrientation(h);

    if (gear !== undefined) {
      const ground = groundAt(state.x, state.z) + gear.height;
      if (state.y < ground) {
        state.y = ground;
        if (state.vy < 0) state.vy = 0;
        grounded = true;
      }
      if (grounded) settleOnGear(gear.maxPitch ?? 0.25);
    }

    const g0 = Math.max(1e-3, Math.hypot(gravity[0], gravity[1], gravity[2]));
    // Specific force (everything but gravity) along body up, over g: what the pilot's seat feels.
    toBody(ax, ay + supportY, az);
    telemetry.gLoad = out[1]! / g0;
    telemetry.airspeed = airspeed;
    telemetry.alpha = airspeed > 1e-3 ? Math.atan2(-by, bz) : 0;
    telemetry.sideslip = airspeed > 1e-3 ? Math.asin(Math.max(-1, Math.min(1, -bx / airspeed))) : 0;
    telemetry.stallFraction = totalArea > 0 ? stalledArea / totalArea : 0;
    telemetry.stalled = largestStalled;
    telemetry.thrust = thrust;
    telemetry.grounded = grounded;
    state.time += h;
  }

  function integrateOrientation(h: number): void {
    const { qx, qy, qz, qw, wx, wy, wz } = state;
    // q̇ = ½ q ⊗ (ω, 0) with ω in the body frame.
    const nx = qx + 0.5 * h * (qw * wx + qy * wz - qz * wy);
    const ny = qy + 0.5 * h * (qw * wy + qz * wx - qx * wz);
    const nz = qz + 0.5 * h * (qw * wz + qx * wy - qy * wx);
    const nw = qw - 0.5 * h * (qx * wx + qy * wy + qz * wz);
    const n = Math.hypot(nx, ny, nz, nw) || 1;
    state.qx = nx / n;
    state.qy = ny / n;
    state.qz = nz / n;
    state.qw = nw / n;
  }

  function settleOnGear(maxPitch: number): void {
    const attitude = attitudeOf(state);
    const pitch = Math.max(0, Math.min(maxPitch, attitude.pitch));
    if (pitch === attitude.pitch && attitude.bank === 0) return;
    const [qx, qy, qz, qw] = aircraftAttitudeQuaternion(attitude.heading, pitch, 0);
    state.qx = qx;
    state.qy = qy;
    state.qz = qz;
    state.qw = qw;
    state.wz = 0;
    if (pitch !== attitude.pitch) state.wx = 0;
  }

  function stepOf(): RigidAircraftStep {
    const attitude = attitudeOf(state);
    return {
      position: [state.x, state.y, state.z],
      velocity: [state.vx, state.vy, state.vz],
      orientation: [state.qx, state.qy, state.qz, state.qw],
      heading: attitude.heading,
      pitch: attitude.pitch,
      bank: attitude.bank,
      pitchRate: -state.wx,
      yawRate: -state.wy,
      rollRate: state.wz,
      airspeed: telemetry.airspeed,
      angleOfAttack: telemetry.alpha,
      sideslip: telemetry.sideslip,
      gLoad: telemetry.gLoad,
      stalled: telemetry.stalled,
      stallFraction: telemetry.stallFraction,
      thrust: telemetry.thrust,
      deflection: { pitch: state.pitchDeflection, roll: state.rollDeflection, yaw: state.yawDeflection },
      grounded: telemetry.grounded,
      ...(tuning.rotor === undefined
        ? {}
        : {
            rotor: {
              speed: state.rotorSpeed,
              thrust: rotorTelemetry.thrust,
              torque: rotorTelemetry.torque,
              groundEffect: rotorTelemetry.groundEffect,
              translationalLift: rotorTelemetry.translationalLift,
            },
          }),
    };
  }

  return {
    tick(dt, input, modifiers) {
      const maxSub = Math.max(1 / 4000, tuning.maxSubstep ?? DEFAULT_SUBSTEP);
      const steps = dt > 0 ? Math.max(1, Math.ceil(dt / maxSub - 1e-9)) : 0;
      const h = steps > 0 ? dt / steps : 0;
      for (let i = 0; i < steps; i += 1) substep(h, input, modifiers);
      return stepOf();
    },
    pose: () => ({ position: [state.x, state.y, state.z], orientation: [state.qx, state.qy, state.qz, state.qw] }),
    velocity: () => [state.vx, state.vy, state.vz],
    applyImpulse(dv) {
      state.vx += dv[0];
      state.vy += dv[1];
      state.vz += dv[2];
    },
    retune(next) {
      tuning = next;
      surfaces = next.surfaces.map(prepareSurface);
      largest = largestSurface(surfaces);
    },
    tuning: () => tuning,
    snapshot: () => ({ ...state }),
    restore(next) {
      Object.assign(state, next);
    },
    resetTo(position, orientation) {
      Object.assign(state, fresh(position, orientation ?? aircraftHeadingQuaternion(attitudeOf(state).heading)));
    },
  };
}

function clamp1(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Heading, nose-up pitch and right bank of a body orientation (three.js `YXZ` Euler with `x = -pitch`). */
function attitudeOf(q: { qx: number; qy: number; qz: number; qw: number }): { heading: number; pitch: number; bank: number } {
  const { qx: x, qy: y, qz: z, qw: w } = q;
  const m13 = 2 * (x * z + w * y);
  const m23 = 2 * (y * z - w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m21 = 2 * (x * y + w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m31 = 2 * (x * z - w * y);
  const m11 = 1 - 2 * (y * y + z * z);
  const ex = Math.asin(-Math.max(-1, Math.min(1, m23)));
  if (Math.abs(m23) < 0.9999999) return { heading: Math.atan2(m13, m33), pitch: -ex, bank: Math.atan2(m21, m22) };
  return { heading: Math.atan2(-m31, m11), pitch: -ex, bank: 0 };
}
