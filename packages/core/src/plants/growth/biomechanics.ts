import type { PlantSpecies } from "../species/plantSpecies";
import { NODE_DEAD, type GrowthState } from "./growthState";
import { PLANT_PI } from "./plantMath";

const GRAVITY = 9.81;
/** Fresh leaf mass over dry leaf mass. */
const LEAF_FRESH_FACTOR = 2.5;
const MAX_BEND_PER_YEAR = 0.25;
const MIN_TURN_SQ = 2.5e-15;

/**
 * Reused per-node buffers for one sag pass.
 * @internal
 */
export interface SagScratch {
  mass: Float64Array;
  mx: Float64Array;
  my: Float64Array;
  mz: Float64Array;
  /** Accumulated rotation per node as a quaternion (x, y, z, w). */
  turn: Float64Array;
}

/**
 * Allocate sag buffers for `capacity` nodes.
 * @internal
 */
export function createSagScratch(capacity: number): SagScratch {
  return {
    mass: new Float64Array(capacity),
    mx: new Float64Array(capacity),
    my: new Float64Array(capacity),
    mz: new Float64Array(capacity),
    turn: new Float64Array(capacity * 4),
  };
}

/**
 * Gravitational sag with gravimorphic compensation (Jirasek, Prusinkiewicz & Moulia 2000). Each node's
 * bending moment comes from the weight of everything it carries and the horizontal lever to that
 * load's centre of mass. Only the moment added since last year bends wood that is already set, by
 * κ = ΔM / (E·I) over the internode, and reaction wood straightens back a species share of it. The
 * rotation swings the node's whole subtree. Returns true when any node moved.
 * @internal
 */
export function applySag(state: GrowthState, species: PlantSpecies, scratch: SagScratch): boolean {
  const n = state.nodeCount;
  const { mass, mx, my, mz, turn } = scratch;
  const woodLoad = species.wood.densityKgM3 * species.wood.greenFactor;
  const leafLoad = LEAF_FRESH_FACTOR / species.leaf.sla;
  const stiffness = species.wood.modulusGPa * 1e9;
  const keep = 1 - species.wood.reactionCompensation;
  const { end, parent, sapArea, heartArea, length, foliage, flags, dir } = state;
  const moments = state.moment;
  for (let i = n - 1; i >= 0; i -= 1) {
    const p = parent[i] ?? -1;
    const sx = p >= 0 ? (end[p * 3] ?? 0) : 0;
    const sy = p >= 0 ? (end[p * 3 + 1] ?? 0) : 0;
    const sz = p >= 0 ? (end[p * 3 + 2] ?? 0) : 0;
    const own = ((sapArea[i] ?? 0) + (heartArea[i] ?? 0)) * (length[i] ?? 0) * woodLoad + (foliage[i] ?? 0) * leafLoad;
    mass[i] = (mass[i] ?? 0) + own;
    mx[i] = (mx[i] ?? 0) + own * 0.5 * (sx + (end[i * 3] ?? 0));
    my[i] = (my[i] ?? 0) + own * 0.5 * (sy + (end[i * 3 + 1] ?? 0));
    mz[i] = (mz[i] ?? 0) + own * 0.5 * (sz + (end[i * 3 + 2] ?? 0));
    if (p >= 0) {
      mass[p] = (mass[p] ?? 0) + (mass[i] ?? 0);
      mx[p] = (mx[p] ?? 0) + (mx[i] ?? 0);
      my[p] = (my[p] ?? 0) + (my[i] ?? 0);
      mz[p] = (mz[p] ?? 0) + (mz[i] ?? 0);
    }
  }
  let moved = false;
  for (let i = 0; i < n; i += 1) {
    const p = parent[i] ?? -1;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    let qw = 1;
    if (p >= 0) {
      qx = turn[p * 4] ?? 0;
      qy = turn[p * 4 + 1] ?? 0;
      qz = turn[p * 4 + 2] ?? 0;
      qw = turn[p * 4 + 3] ?? 1;
    }
    const load = mass[i] ?? 0;
    if (load > 0 && ((flags[i] ?? 0) & NODE_DEAD) === 0) {
      const sx = p >= 0 ? (end[p * 3] ?? 0) : 0;
      const sz = p >= 0 ? (end[p * 3 + 2] ?? 0) : 0;
      const hx = (mx[i] ?? 0) / load - sx;
      const hz = (mz[i] ?? 0) / load - sz;
      const lever = Math.sqrt(hx * hx + hz * hz);
      const moment = load * GRAVITY * lever;
      const added = moment - (moments[i] ?? 0);
      moments[i] = moment;
      if (added > 0 && lever > 1e-4) {
        const area = (sapArea[i] ?? 0) + (heartArea[i] ?? 0);
        const inertia = (area * area) / (4 * PLANT_PI);
        let angle = inertia > 0 ? (added / (stiffness * inertia)) * (length[i] ?? 0) * keep : 0;
        if (angle > MAX_BEND_PER_YEAR) angle = MAX_BEND_PER_YEAR;
        if (angle > 1e-7) {
          // Axis up × lever: a positive turn lowers the side the load hangs on.
          const ax = hz / lever;
          const az = -hx / lever;
          // Half-angles stay under 0.125 rad, where these series are exact to double precision.
          const h = angle / 2;
          const h2 = h * h;
          const s = h * (1 - (h2 / 6) * (1 - (h2 / 20) * (1 - (h2 / 42) * (1 - h2 / 72))));
          const rx = ax * s;
          const rz = az * s;
          const rw = 1 - (h2 / 2) * (1 - (h2 / 12) * (1 - (h2 / 30) * (1 - (h2 / 56) * (1 - h2 / 90))));
          // q = q_parent ⊗ r (r has no y component).
          const nx = qw * rx + qy * rz;
          const ny = qz * rx - qx * rz;
          const nz = qw * rz - qy * rx;
          const nw = qw * rw - qx * rx - qz * rz;
          qx = nx + qx * rw;
          qy = ny + qy * rw;
          qz = nz + qz * rw;
          qw = nw;
          moved = true;
        }
      }
    }
    turn[i * 4] = qx;
    turn[i * 4 + 1] = qy;
    turn[i * 4 + 2] = qz;
    turn[i * 4 + 3] = qw;
    // Turns under about 1e-7 rad are below what a float32 direction holds.
    if (qx * qx + qy * qy + qz * qz > MIN_TURN_SQ) rotateDirection(dir, i, qx, qy, qz, qw);
    mass[i] = 0;
    mx[i] = 0;
    my[i] = 0;
    mz[i] = 0;
  }
  return moved;
}

function rotateDirection(dir: Float32Array, i: number, qx: number, qy: number, qz: number, qw: number): void {
  const vx = dir[i * 3] ?? 0;
  const vy = dir[i * 3 + 1] ?? 0;
  const vz = dir[i * 3 + 2] ?? 0;
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const cx = qy * vz - qz * vy;
  const cy = qz * vx - qx * vz;
  const cz = qx * vy - qy * vx;
  let x = vx + 2 * (qw * cx + qy * cz - qz * cy);
  let y = vy + 2 * (qw * cy + qz * cx - qx * cz);
  let z = vz + 2 * (qw * cz + qx * cy - qy * cx);
  const length = Math.sqrt(x * x + y * y + z * z);
  x /= length;
  y /= length;
  z /= length;
  dir[i * 3] = x;
  dir[i * 3 + 1] = y;
  dir[i * 3 + 2] = z;
}

/**
 * Recompute every tip from its parent's tip, direction and length (after sag or a merge).
 * @internal
 */
export function placeNodes(state: GrowthState): void {
  for (let i = 0; i < state.nodeCount; i += 1) {
    const p = state.parent[i] ?? -1;
    const length = state.length[i] ?? 0;
    const sx = p >= 0 ? (state.end[p * 3] ?? 0) : 0;
    const sy = p >= 0 ? (state.end[p * 3 + 1] ?? 0) : 0;
    const sz = p >= 0 ? (state.end[p * 3 + 2] ?? 0) : 0;
    state.end[i * 3] = sx + (state.dir[i * 3] ?? 0) * length;
    state.end[i * 3 + 1] = sy + (state.dir[i * 3 + 1] ?? 0) * length;
    state.end[i * 3 + 2] = sz + (state.dir[i * 3 + 2] ?? 0) * length;
  }
}
