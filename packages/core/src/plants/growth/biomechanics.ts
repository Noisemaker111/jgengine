import type { PlantSpecies } from "../species/plantSpecies";
import { NODE_DEAD, type GrowthState } from "./growthState";
import { PLANT_PI } from "./plantMath";
import { thickenNode } from "./pipeModel";

const GRAVITY = 9.81;
/** Fresh leaf mass over dry leaf mass. */
const LEAF_FRESH_FACTOR = 2.5;
const MAX_BEND_PER_YEAR = 0.25;
const MIN_TURN_SQ = 2.5e-15;
const INV_FOUR_PI = 1 / (4 * PLANT_PI);
// Reciprocals of the sine and cosine series denominators: multiplies on the hottest loop.
const INV_6 = 1 / 6;
const INV_12 = 1 / 12;
const INV_20 = 1 / 20;
const INV_30 = 1 / 30;
const INV_42 = 1 / 42;
const INV_56 = 1 / 56;
const INV_72 = 1 / 72;
const INV_90 = 1 / 90;

/**
 * Reused per-node buffers for one sag pass.
 * @internal
 */
export interface SagScratch {
  mass: Float64Array;
  mx: Float64Array;
  mz: Float64Array;
  /** Accumulated rotation per node as a quaternion (x, y, z, w). */
  turn: Float64Array;
  /** Tips before this year's sag, 3 per node. */
  before: Float32Array;
}

/**
 * Allocate sag buffers for `capacity` nodes.
 * @internal
 */
export function createSagScratch(capacity: number): SagScratch {
  return {
    mass: new Float64Array(capacity),
    mx: new Float64Array(capacity),
    mz: new Float64Array(capacity),
    turn: new Float64Array(capacity * 4),
    before: new Float32Array(capacity * 3),
  };
}

/**
 * This year's ring, laid in the same pass as the load it adds: `share` of each node's `need` plus
 * `surplusPerFoliage` m² of sapwood per m² of leaves above it.
 * @internal
 */
export interface SagRing {
  foliageAbove: Float64Array;
  need: Float64Array;
  share: number;
  surplusPerFoliage: number;
}

/**
 * Lay this year's ring, then gravitational sag with gravimorphic compensation (Jirasek, Prusinkiewicz
 * & Moulia 2000). Each node's bending moment comes from the weight of everything it carries and the
 * horizontal lever to that load's centre of mass. Only the moment added since last year bends wood
 * that is already set, by κ = ΔM / (E·I) over the internode, and reaction wood straightens back a
 * species share of it. The rotation swings the node's whole subtree, and every tip is placed again
 * from its parent's tip, direction and length.
 * @internal
 */
export function applySag(state: GrowthState, species: PlantSpecies, scratch: SagScratch, ring: SagRing): void {
  const n = state.slots.nodeCount;
  const { mass, mx, mz, turn, before } = scratch;
  const woodLoad = species.wood.densityKgM3 * species.wood.greenFactor;
  const leafLoad = LEAF_FRESH_FACTOR / species.leaf.sla;
  const stiffness = species.wood.modulusGPa * 1e9;
  const keep = 1 - species.wood.reactionCompensation;
  const { end, parent, sapArea, heartArea, length, foliage, flags, dir } = state.nodes;
  const moments = state.nodes.moment;
  const { foliageAbove, need, share, surplusPerFoliage } = ring;
  before.set(end.subarray(0, n * 3));
  mass.fill(0, 0, n);
  mx.fill(0, 0, n);
  mz.fill(0, 0, n);
  for (let i = n - 1; i >= 0; i -= 1) {
    if (((flags[i] ?? 0) & NODE_DEAD) === 0) {
      const above = foliageAbove[i] ?? 0;
      thickenNode(state, species, i, above, (need[i] ?? 0) * share + surplusPerFoliage * above);
    }
    const p = parent[i] ?? -1;
    const sx = p >= 0 ? (end[p * 3] ?? 0) : 0;
    const sz = p >= 0 ? (end[p * 3 + 2] ?? 0) : 0;
    const own = ((sapArea[i] ?? 0) + (heartArea[i] ?? 0)) * (length[i] ?? 0) * woodLoad + (foliage[i] ?? 0) * leafLoad;
    const m = (mass[i] ?? 0) + own;
    const ax = (mx[i] ?? 0) + own * 0.5 * (sx + (end[i * 3] ?? 0));
    const az = (mz[i] ?? 0) + own * 0.5 * (sz + (end[i * 3 + 2] ?? 0));
    mass[i] = m;
    mx[i] = ax;
    mz[i] = az;
    if (p >= 0) {
      mass[p] = (mass[p] ?? 0) + m;
      mx[p] = (mx[p] ?? 0) + ax;
      mz[p] = (mz[p] ?? 0) + az;
    }
  }
  for (let i = 0; i < n; i += 1) {
    const p = parent[i] ?? -1;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    let qw = 1;
    let px = 0;
    let py = 0;
    let pz = 0;
    let sx = 0;
    let sz = 0;
    if (p >= 0) {
      const q4 = p * 4;
      qx = turn[q4] ?? 0;
      qy = turn[q4 + 1] ?? 0;
      qz = turn[q4 + 2] ?? 0;
      qw = turn[q4 + 3] ?? 1;
      const p3 = p * 3;
      px = end[p3] ?? 0;
      py = end[p3 + 1] ?? 0;
      pz = end[p3 + 2] ?? 0;
      sx = before[p3] ?? 0;
      sz = before[p3 + 2] ?? 0;
    }
    const load = mass[i] ?? 0;
    if (load > 0 && ((flags[i] ?? 0) & NODE_DEAD) === 0) {
      const perLoad = 1 / load;
      const hx = (mx[i] ?? 0) * perLoad - sx;
      const hz = (mz[i] ?? 0) * perLoad - sz;
      const lever = Math.sqrt(hx * hx + hz * hz);
      const moment = load * GRAVITY * lever;
      const added = moment - (moments[i] ?? 0);
      moments[i] = moment;
      if (added > 0 && lever > 1e-4) {
        const area = (sapArea[i] ?? 0) + (heartArea[i] ?? 0);
        const inertia = area * area * INV_FOUR_PI;
        let angle = inertia > 0 ? (added / (stiffness * inertia)) * (length[i] ?? 0) * keep : 0;
        if (angle > MAX_BEND_PER_YEAR) angle = MAX_BEND_PER_YEAR;
        if (angle > 1e-7) {
          // Axis up × lever: a positive turn lowers the side the load hangs on.
          const perLever = 1 / lever;
          const ax = hz * perLever;
          const az = -hx * perLever;
          // Half-angles stay under 0.125 rad, where these series are exact to double precision.
          const h = angle * 0.5;
          const h2 = h * h;
          const s = h * (1 - h2 * INV_6 * (1 - h2 * INV_20 * (1 - h2 * INV_42 * (1 - h2 * INV_72))));
          const rx = ax * s;
          const rz = az * s;
          const rw = 1 - h2 * 0.5 * (1 - h2 * INV_12 * (1 - h2 * INV_30 * (1 - h2 * INV_56 * (1 - h2 * INV_90))));
          // q = q_parent ⊗ r (r has no y component).
          const nx = qw * rx + qy * rz;
          const ny = qz * rx - qx * rz;
          const nz = qw * rz - qy * rx;
          const nw = qw * rw - qx * rx - qz * rz;
          qx = nx + qx * rw;
          qy = ny + qy * rw;
          qz = nz + qz * rw;
          qw = nw;
        }
      }
    }
    const i4 = i * 4;
    turn[i4] = qx;
    turn[i4 + 1] = qy;
    turn[i4 + 2] = qz;
    turn[i4 + 3] = qw;
    const i3 = i * 3;
    let vx = dir[i3] ?? 0;
    let vy = dir[i3 + 1] ?? 0;
    let vz = dir[i3 + 2] ?? 0;
    // Turns under about 1e-7 rad are below what a float32 direction holds.
    if (qx * qx + qy * qy + qz * qz > MIN_TURN_SQ) {
      // v' = v + 2w(q×v) + 2 q×(q×v)
      const cx = qy * vz - qz * vy;
      const cy = qz * vx - qx * vz;
      const cz = qx * vy - qy * vx;
      let x = vx + 2 * (qw * cx + qy * cz - qz * cy);
      let y = vy + 2 * (qw * cy + qz * cx - qx * cz);
      let z = vz + 2 * (qw * cz + qx * cy - qy * cx);
      const perNorm = 1 / Math.sqrt(x * x + y * y + z * z);
      x *= perNorm;
      y *= perNorm;
      z *= perNorm;
      dir[i3] = x;
      dir[i3 + 1] = y;
      dir[i3 + 2] = z;
      vx = dir[i3] ?? 0;
      vy = dir[i3 + 1] ?? 0;
      vz = dir[i3 + 2] ?? 0;
    }
    const len = length[i] ?? 0;
    end[i3] = px + vx * len;
    end[i3 + 1] = py + vy * len;
    end[i3 + 2] = pz + vz * len;
  }
}

