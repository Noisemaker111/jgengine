import { solveLinearSystem } from "../../math/linearAlgebra";
import { surgeAddedMass } from "./boatComparison";
import { hullMeshFromOffsets, type HullMesh } from "./hullForm";
import { createHullIntegrator, createHullLoads, type HullIntegrator, floatingEquilibrium, MARINE_GRAVITY, SEA_WATER_DENSITY, hydrostaticParticulars } from "./hullHydrostatics";
import { seaWaterAt, type OceanSea } from "./oceanWaves";
import { sectionHeave } from "./sectionHydrodynamics";
import { heavePitchResponse, stripSections, type StripHull } from "./stripTheory";

/**
 * A rigid hull for time-domain seakeeping, in hull axes (x forward from the aft end, y to port, z up from the keel).
 * Buoyancy and the Froude–Krylov wave force come from integrating the incident sea's pressure over the instantaneous
 * wetted mesh; radiation is constant added mass and damping about G; each station adds a diffraction force by the
 * strip-theory diffraction force (its section's diffraction integral at the reference frequency, applied to every wave
 * component) and a momentum slamming force when it re-enters the water.
 */
export interface SeakeepingHull {
  mesh: HullMesh;
  massKg: number;
  centreOfGravity: readonly [number, number, number];
  /** Radii of gyration about G, m: roll, pitch, yaw. */
  gyration: readonly [number, number, number];
  /** 6×6 added mass about G in body axes (surge, sway, heave, roll, pitch, yaw), row-major. */
  addedMass: readonly number[];
  /** 6×6 linear radiation and viscous damping about G in body axes, row-major. */
  damping: readonly number[];
  /** Stations for the diffraction and slamming forces. */
  stations: readonly SeakeepingStation[];
  density: number;
  gravity: number;
}

/** One strip of the hull for the station forces. */
export interface SeakeepingStation {
  /** Station position along the hull, m, and its share of the length, m. */
  x: number;
  width: number;
  /** Sectional heave added mass, kg/m, and damping, N·s/m², at the reference frequency. */
  addedMass: number;
  damping: number;
  /** Diffraction integral `∫φ₃·n_z·e^(kz) ds` of the section at the reference frequency, per unit heave velocity. */
  diffraction: readonly [number, number];
  /** Keel height above the baseline, m. */
  keel: number;
  /** High-frequency added mass, kg/m, against immersion of the keel, m, for slamming. */
  slamDepths: readonly number[];
  slamAddedMass: readonly number[];
}

/** Body state: G in earth axes (z up from still water), roll/pitch/yaw, and body velocities `[u, v, w, p, q, r]` at G. */
export interface SeakeepingState {
  position: [number, number, number];
  attitude: [number, number, number];
  velocity: [number, number, number, number, number, number];
  time: number;
  /** Largest slamming force on any station during the last step, N, and the station's x. */
  slamForce: number;
  slamStation: number;
}

/** Options for {@link seakeepingHullFromStrip}. */
export interface SeakeepingHullOptions {
  /** Frequency the radiation coefficients are taken at, rad/s (default: the heave natural frequency estimate). */
  referenceFrequency?: number;
  /** Roll added inertia as a share of the dry roll inertia (default `0.2`). */
  rollAddedInertia?: number;
  /** Roll damping as a share of critical (default `0.05`). */
  rollDamping?: number;
  /** Roll and yaw radii of gyration over beam and length (defaults `0.35`, `0.25`). */
  rollRadius?: number;
  yawRadius?: number;
}

/**
 * Builds a {@link SeakeepingHull} from a strip-theory hull: mesh from its offsets, heave–pitch added mass and damping
 * from strip theory at the reference frequency, surge added mass from Lamb's spheroid, sway and yaw from flat-plate
 * strips (`ρπT²/2`), roll as shares of the dry inertia and of critical damping, and per-station diffraction and
 * high-frequency slamming tables from the 2-D sections.
 * @capability seakeeping-hull time-domain seakeeping hull built from strip theory
 */
export function seakeepingHullFromStrip(hull: StripHull, options: SeakeepingHullOptions = {}): SeakeepingHull {
  const density = hull.density ?? SEA_WATER_DENSITY;
  const gravity = hull.gravity ?? MARINE_GRAVITY;
  const prepared = stripSections(hull.offsets, hull.draft);
  const mass = density * prepared.volume;
  const stations = prepared.x;
  const length = (stations[stations.length - 1] ?? 0) - (stations[0] ?? 0);
  const beam = 2 * Math.max(...prepared.halfBreadth);
  const omega = options.referenceFrequency ?? Math.sqrt(gravity / Math.max(1e-3, hull.draft)) * 0.8;
  const strip = heavePitchResponse(hull, omega, prepared);
  const mesh = hullMeshFromOffsets(hull.offsets);
  const [xg, zg] = hull.centreOfGravity;
  const centreOfGravity: [number, number, number] = [xg, 0, zg];
  const rollRadius = (options.rollRadius ?? 0.35) * beam;
  const yawRadius = (options.yawRadius ?? 0.25) * length;
  const gyration: [number, number, number] = [rollRadius, hull.pitchRadius, yawRadius];
  const sway = (i: number) => {
    const section = prepared.sections[i];
    const depth = section === undefined ? 0 : -Math.min(...section.map((point) => point[1]));
    return 0.5 * density * Math.PI * depth * depth;
  };
  let a22 = 0;
  let a66 = 0;
  for (let i = 1; i < stations.length; i += 1) {
    const dx = (stations[i] ?? 0) - (stations[i - 1] ?? 0);
    const xm = 0.5 * ((stations[i] ?? 0) + (stations[i - 1] ?? 0)) - xg;
    const value = 0.5 * (sway(i) + sway(i - 1));
    a22 += value * dx;
    a66 += value * xm * xm * dx;
  }
  const rollInertia = mass * rollRadius * rollRadius;
  const rollAdded = (options.rollAddedInertia ?? 0.2) * rollInertia;
  const particulars = hydrostaticParticulars(mesh, { massKg: mass, centreOfGravity, density, gravity });
  const rollStiffness = density * gravity * particulars.volume * Math.max(0, particulars.transverseMetacentricHeight);
  const rollDamping = 2 * (options.rollDamping ?? 0.05) * Math.sqrt((rollInertia + rollAdded) * rollStiffness);
  const [a33, a35, a53, a55] = strip.coefficients.addedMass;
  const [b33, b35, b53, b55] = strip.coefficients.damping;
  const added = new Array<number>(36).fill(0);
  const damping = new Array<number>(36).fill(0);
  added[0] = surgeAddedMass(mass, length, density);
  added[7] = a22;
  added[14] = a33;
  added[16] = a35;
  added[26] = a53;
  added[28] = a55;
  added[21] = rollAdded;
  added[35] = a66;
  damping[14] = b33;
  damping[16] = b35;
  damping[26] = b53;
  damping[28] = b55;
  damping[21] = rollDamping;
  const seaStations: SeakeepingStation[] = [];
  const deck = hull.offsets.waterlines[hull.offsets.waterlines.length - 1] ?? hull.draft;
  const slamDepths = Array.from({ length: 9 }, (_, i) => (deck * (i + 1)) / 9);
  const slamTables = slamDepths.map((depth) => {
    const cut = stripSections(hull.offsets, depth);
    return cut.sections.map((section) => (section === undefined ? 0 : sectionHeave(section, Infinity, density, gravity, 12).addedMass));
  });
  for (let i = 0; i < stations.length; i += 1) {
    const left = i > 0 ? (stations[i] ?? 0) - (stations[i - 1] ?? 0) : 0;
    const right = i < stations.length - 1 ? (stations[i + 1] ?? 0) - (stations[i] ?? 0) : 0;
    const section = prepared.sections[i];
    const local = section === undefined ? undefined : sectionHeave(section, omega, density, gravity, hull.panels ?? 20);
    seaStations.push({
      x: stations[i] ?? 0,
      width: 0.5 * (left + right),
      addedMass: local?.addedMass ?? 0,
      damping: local?.damping ?? 0,
      diffraction: local?.diffraction ?? [0, 0],
      keel: 0,
      slamDepths: [0, ...slamDepths],
      slamAddedMass: [0, ...slamTables.map((table) => table[i] ?? 0)],
    });
  }
  return { mesh, massKg: mass, centreOfGravity, gyration, addedMass: added, damping, stations: seaStations, density, gravity };
}

const integrators = new WeakMap<HullMesh, HullIntegrator>();

function integratorFor(mesh: HullMesh): HullIntegrator {
  const cached = integrators.get(mesh);
  if (cached !== undefined) return cached;
  const created = createHullIntegrator(mesh);
  integrators.set(mesh, created);
  return created;
}

/** Row-major `Rz(yaw)·Ry(pitch)·Rx(roll)`: body to earth. */
function attitudeMatrix(roll: number, pitch: number, yaw: number, out: Float64Array): Float64Array {
  const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  out[0] = cy * cp;
  out[1] = cy * sp * sr - sy * cr;
  out[2] = cy * sp * cr + sy * sr;
  out[3] = sy * cp;
  out[4] = sy * sp * sr + cy * cr;
  out[5] = sy * sp * cr - cy * sr;
  out[6] = -sp;
  out[7] = cp * sr;
  out[8] = cp * cr;
  return out;
}

/**
 * The hull floating at rest in still water: G above the origin at its equilibrium height, heel and trim.
 * @capability seakeeping-hull hull at rest in still water
 */
export function restingSeakeepingState(hull: SeakeepingHull): SeakeepingState {
  const attitude = floatingEquilibrium(hull.mesh, { massKg: hull.massKg, centreOfGravity: hull.centreOfGravity, density: hull.density, gravity: hull.gravity });
  return { position: [0, 0, attitude.heightOfG], attitude: [attitude.heel, attitude.trim, 0], velocity: [0, 0, 0, 0, 0, 0], time: 0, slamForce: 0, slamStation: 0 };
}

/** External surge force along the body x axis, N, e.g. a propeller holding speed against resistance. */
export type SurgeForce = (state: SeakeepingState) => number;

/**
 * Advances a hull in a sea by `dt` with fourth-order Runge–Kutta, in place. Forces: weight; buoyancy and Froude–Krylov
 * from the sea pressure over the wetted mesh; constant added mass and damping; per-station diffraction
 * `ρω²·Re(A·D·e^(iθ))` from each section's diffraction integral; momentum slamming `−(dm∞/dh)·ḣ²` on a
 * station whose immersion `h` is rising; and an optional surge force.
 * @capability seakeeping-hull six-degree-of-freedom time step of a hull in waves
 */
export function stepSeakeeping(hull: SeakeepingHull, sea: OceanSea, state: SeakeepingState, dt: number, surge?: SurgeForce): SeakeepingState {
  const integrator = integratorFor(hull.mesh);
  const loads = createHullLoads();
  const rotation = new Float64Array(9);
  const translation = new Float64Array(3);
  const [gx, gy, gz] = hull.centreOfGravity;
  const m = hull.massKg;
  const [kr, kp, ky] = hull.gyration;
  const inertia = [m * kr * kr, m * kp * kp, m * ky * ky];
  let slamPeak = 0;
  let slamAt = 0;

  const derivative = (s: SeakeepingState): number[] => {
    const [roll, pitch, yaw] = s.attitude;
    const R = attitudeMatrix(roll, pitch, yaw, rotation);
    const [ex, ey, ez] = s.position;
    translation[0] = ex - ((R[0] ?? 0) * gx + (R[1] ?? 0) * gy + (R[2] ?? 0) * gz);
    translation[1] = ey - ((R[3] ?? 0) * gx + (R[4] ?? 0) * gy + (R[5] ?? 0) * gz);
    translation[2] = ez - ((R[6] ?? 0) * gx + (R[7] ?? 0) * gy + (R[8] ?? 0) * gz);
    integrator.integrate(R, translation, seaWaterAt(sea, s.time), loads);
    const [fx, fy, fz] = [loads.force[0] ?? 0, loads.force[1] ?? 0, loads.force[2] ?? 0];
    // Pressure moment about G: M_O − r_G × F. Weight acts at G and adds none.
    const moment = [(loads.moment[0] ?? 0) - (ey * fz - ez * fy), (loads.moment[1] ?? 0) - (ez * fx - ex * fz), (loads.moment[2] ?? 0) - (ex * fy - ey * fx)];
    const force = [fx, fy, fz - m * hull.gravity];
    const [u, v, w, p, q, r] = s.velocity;
    for (const station of hull.stations) {
      if (station.width <= 0) continue;
      const bx = station.x - gx;
      const bz = station.keel - gz;
      const px = ex + (R[0] ?? 0) * bx + (R[2] ?? 0) * bz;
      const py = ey + (R[3] ?? 0) * bx + (R[5] ?? 0) * bz;
      const pz = ez + (R[6] ?? 0) * bx + (R[8] ?? 0) * bz;
      // Earth vertical velocity of the keel point: R·(v + ω × r).
      const vx = u + q * bz;
      const vy = v + r * bx - p * bz;
      const vz = w - q * bx;
      const keelRise = (R[6] ?? 0) * vx + (R[7] ?? 0) * vy + (R[8] ?? 0) * vz;
      let eta = 0;
      let etaRate = 0;
      let diffraction = 0;
      for (const c of sea.components) {
        const angle = c.wavenumber * (px * Math.cos(c.direction) + py * Math.sin(c.direction)) - c.frequency * s.time + c.phase;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        eta += c.amplitude * cos;
        etaRate += c.amplitude * c.frequency * sin;
        diffraction += c.amplitude * c.frequency * c.frequency * (station.diffraction[0] * cos - station.diffraction[1] * sin);
      }
      let lift = hull.density * diffraction * station.width;
      const immersion = eta - pz;
      const entry = etaRate - keelRise;
      if (entry > 0 && immersion > 0) {
        const slope = tableSlope(station.slamDepths, station.slamAddedMass, immersion);
        const slam = slope * entry * entry * station.width;
        lift += slam;
        if (slam > slamPeak) {
          slamPeak = slam;
          slamAt = station.x;
        }
      }
      force[2] = (force[2] ?? 0) + lift;
      const rx = px - ex;
      const ry = py - ey;
      moment[0] = (moment[0] ?? 0) + ry * lift;
      moment[1] = (moment[1] ?? 0) - rx * lift;
    }
    // To body axes: Rᵀ·F.
    const body = (vec: number[]) => [0, 1, 2].map((i) => (R[i] ?? 0) * (vec[0] ?? 0) + (R[3 + i] ?? 0) * (vec[1] ?? 0) + (R[6 + i] ?? 0) * (vec[2] ?? 0));
    const fb = body(force);
    const mb = body(moment);
    fb[0] = (fb[0] ?? 0) + (surge?.(s) ?? 0);
    const generalized = [...fb, ...mb];
    const coriolis = [
      m * (q * w - r * v),
      m * (r * u - p * w),
      m * (p * v - q * u),
      q * r * ((inertia[2] ?? 0) - (inertia[1] ?? 0)),
      r * p * ((inertia[0] ?? 0) - (inertia[2] ?? 0)),
      p * q * ((inertia[1] ?? 0) - (inertia[0] ?? 0)),
    ];
    const matrix = new Float64Array(36);
    const rhs = new Float64Array(6);
    const rigid = [m, m, m, inertia[0] ?? 0, inertia[1] ?? 0, inertia[2] ?? 0];
    for (let i = 0; i < 6; i += 1) {
      let damp = 0;
      for (let j = 0; j < 6; j += 1) {
        matrix[i * 6 + j] = (hull.addedMass[i * 6 + j] ?? 0) + (i === j ? (rigid[i] ?? 0) : 0);
        damp += (hull.damping[i * 6 + j] ?? 0) * (s.velocity[j] ?? 0);
      }
      rhs[i] = (generalized[i] ?? 0) - damp - (coriolis[i] ?? 0);
    }
    solveLinearSystem(matrix, rhs, 6);
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), tp = Math.tan(pitch);
    return [
      (R[0] ?? 0) * u + (R[1] ?? 0) * v + (R[2] ?? 0) * w,
      (R[3] ?? 0) * u + (R[4] ?? 0) * v + (R[5] ?? 0) * w,
      (R[6] ?? 0) * u + (R[7] ?? 0) * v + (R[8] ?? 0) * w,
      p + (q * sr + r * cr) * tp,
      q * cr - r * sr,
      (q * sr + r * cr) / cp,
      ...rhs,
    ];
  };
  const shifted = (k: readonly number[], h: number): SeakeepingState => ({
    ...state,
    position: [0, 1, 2].map((i) => (state.position[i] ?? 0) + h * (k[i] ?? 0)) as [number, number, number],
    attitude: [0, 1, 2].map((i) => (state.attitude[i] ?? 0) + h * (k[3 + i] ?? 0)) as [number, number, number],
    velocity: [0, 1, 2, 3, 4, 5].map((i) => (state.velocity[i] ?? 0) + h * (k[6 + i] ?? 0)) as SeakeepingState["velocity"],
    time: state.time + h,
  });
  const k1 = derivative(state);
  const k2 = derivative(shifted(k1, dt / 2));
  const k3 = derivative(shifted(k2, dt / 2));
  const k4 = derivative(shifted(k3, dt));
  const mix = (i: number) => (dt / 6) * ((k1[i] ?? 0) + 2 * (k2[i] ?? 0) + 2 * (k3[i] ?? 0) + (k4[i] ?? 0));
  for (let i = 0; i < 3; i += 1) state.position[i] = (state.position[i] ?? 0) + mix(i);
  for (let i = 0; i < 3; i += 1) state.attitude[i] = (state.attitude[i] ?? 0) + mix(3 + i);
  for (let i = 0; i < 6; i += 1) state.velocity[i] = (state.velocity[i] ?? 0) + mix(6 + i);
  state.time += dt;
  state.slamForce = slamPeak;
  state.slamStation = slamAt;
  return state;
}

function tableSlope(depths: readonly number[], values: readonly number[], depth: number): number {
  for (let i = 1; i < depths.length; i += 1) {
    const d0 = depths[i - 1] ?? 0;
    const d1 = depths[i] ?? 0;
    if (depth <= d1 || i === depths.length - 1) return ((values[i] ?? 0) - (values[i - 1] ?? 0)) / Math.max(1e-9, d1 - d0);
  }
  return 0;
}
