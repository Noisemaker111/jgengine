import type { PlantSpecies } from "../species/plantSpecies";
import { NODE_AXIS_START, NODE_DEAD, type GrowthState } from "./growthState";
import { PLANT_PI, plantAcos, plantCos, plantSin } from "./plantMath";
import { hasCambium, thickenNode } from "./pipeModel";

const GRAVITY = 9.81;
/** Fresh leaf mass over dry leaf mass. */
const LEAF_FRESH_FACTOR = 2.5;
const MAX_BEND_PER_YEAR = 0.25;
const MIN_TURN_SQ = 2.5e-15;
const INV_FOUR_PI = 1 / (4 * PLANT_PI);
/**
 * Difference in maturation strain between reaction wood and the wood opposite it (Alméras & Fournier
 * 2009 measure 0.1–0.4%): how hard a new ring pulls a leaning stem back.
 */
const REACTION_STRAIN = 0.003;
/** Height a limb resting on the ground lies at, metres. */
const GROUND_REST_M = 0.02;
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
  /** Sapwood area each node laid down this year, m². */
  ring: Float64Array;
  /** First node of the stem each node belongs to. */
  stemBase: Int32Array;
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
    ring: new Float64Array(capacity),
    stemBase: new Int32Array(capacity),
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
  const n = state.nodeCount;
  const { mass, mx, mz, turn, before, ring: laid } = scratch;
  const woodLoad = species.wood.densityKgM3 * species.wood.greenFactor;
  const leafLoad = LEAF_FRESH_FACTOR / species.leaf.sla;
  const stiffness = species.wood.modulusGPa * 1e9;
  const keep = 1 - species.wood.reactionCompensation;
  const { end, parent, sapArea, heartArea, length, foliage, flags, dir } = state;
  const moments = state.moment;
  const { foliageAbove, need, share, surplusPerFoliage } = ring;
  before.set(end.subarray(0, n * 3));
  mass.fill(0, 0, n);
  mx.fill(0, 0, n);
  mz.fill(0, 0, n);
  for (let i = n - 1; i >= 0; i -= 1) {
    laid[i] = 0;
    if (((flags[i] ?? 0) & NODE_DEAD) === 0) {
      const above = foliageAbove[i] ?? 0;
      const area = (need[i] ?? 0) * share + surplusPerFoliage * above;
      thickenNode(state, species, i, above, area);
      laid[i] = area;
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
  if (hasCambium(species)) holdPosture(state, scratch);
}

/**
 * Posture control (Moulia, Coutand & Lenne 2006; Alméras & Fournier 2009): reaction wood laid on one
 * side of a stem turns it back towards the direction its base grew in (upright for the trunk, leaning
 * out for each further basal stem), so a whip that sags in its first years still grows into an upright
 * tree. A ring Δr wide on a stem of radius r curves it by 2·ε·Δr / r² per metre, so a young stem rights
 * itself within a few seasons while an old trunk barely moves. Branches keep the sag and gravimorphic
 * compensation of {@link applySag}; a limb that would still pass below the ground rests on it. Each
 * turn swings the node's subtree, and every tip is placed again from its parent's.
 */
function holdPosture(state: GrowthState, scratch: SagScratch): void {
  const n = state.nodeCount;
  const { turn, ring, stemBase } = scratch;
  const { end, parent, sapArea, heartArea, length, flags, dir, order } = state;
  for (let i = 0; i < n; i += 1) {
    const p = parent[i] ?? -1;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    let qw = 1;
    let px = 0;
    let py = 0;
    let pz = 0;
    if (p >= 0) {
      qx = turn[p * 4] ?? 0;
      qy = turn[p * 4 + 1] ?? 0;
      qz = turn[p * 4 + 2] ?? 0;
      qw = turn[p * 4 + 3] ?? 1;
      px = end[p * 3] ?? 0;
      py = end[p * 3 + 1] ?? 0;
      pz = end[p * 3 + 2] ?? 0;
    }
    const base = p >= 0 && (order[i] ?? 0) === 0 && ((flags[i] ?? 0) & NODE_AXIS_START) === 0 ? (stemBase[p] ?? i) : i;
    stemBase[i] = base;
    const i3 = i * 3;
    let vx = dir[i3] ?? 0;
    let vy = dir[i3 + 1] ?? 0;
    let vz = dir[i3 + 2] ?? 0;
    if (qx * qx + qy * qy + qz * qz > MIN_TURN_SQ) {
      const cx = qy * vz - qz * vy;
      const cy = qz * vx - qx * vz;
      const cz = qx * vy - qy * vx;
      vx += 2 * (qw * cx + qy * cz - qz * cy);
      vy += 2 * (qw * cy + qz * cx - qx * cz);
      vz += 2 * (qw * cz + qx * cy - qy * cx);
    }
    const area = (sapArea[i] ?? 0) + (heartArea[i] ?? 0);
    const added = ring[i] ?? 0;
    if ((order[i] ?? 0) === 0 && base !== i && ((flags[i] ?? 0) & NODE_DEAD) === 0 && area > 0 && added > 0) {
      // The base's direction was already placed this pass.
      const tx = dir[base * 3] ?? 0;
      const ty = dir[base * 3 + 1] ?? 1;
      const tz = dir[base * 3 + 2] ?? 0;
      let ax = vy * tz - vz * ty;
      let ay = vz * tx - vx * tz;
      let az = vx * ty - vy * tx;
      const sine = Math.sqrt(ax * ax + ay * ay + az * az);
      if (sine > 1e-4) {
        const off = plantAcos(Math.max(-1, Math.min(1, vx * tx + vy * ty + vz * tz)));
        const radius = Math.sqrt(area / PLANT_PI);
        const width = added / (2 * PLANT_PI * radius);
        const angle = Math.min(off, ((2 * REACTION_STRAIN * width) / (radius * radius)) * (length[i] ?? 0));
        if (angle > 1e-7) {
          const s = plantSin(angle * 0.5) / sine;
          ax *= s;
          ay *= s;
          az *= s;
          const aw = plantCos(angle * 0.5);
          // q = r ⊗ q: a world-frame turn of this node and everything it carries.
          const nx = aw * qx + ax * qw + ay * qz - az * qy;
          const ny = aw * qy - ax * qz + ay * qw + az * qx;
          const nz = aw * qz + ax * qy - ay * qx + az * qw;
          const nw = aw * qw - ax * qx - ay * qy - az * qz;
          qx = nx;
          qy = ny;
          qz = nz;
          qw = nw;
          const cx = ay * vz - az * vy;
          const cy = az * vx - ax * vz;
          const cz = ax * vy - ay * vx;
          const ox = vx + 2 * (aw * cx + ay * cz - az * cy);
          const oy = vy + 2 * (aw * cy + az * cx - ax * cz);
          const oz = vz + 2 * (aw * cz + ax * cy - ay * cx);
          vx = ox;
          vy = oy;
          vz = oz;
        }
      }
    }
    turn[i * 4] = qx;
    turn[i * 4 + 1] = qy;
    turn[i * 4 + 2] = qz;
    turn[i * 4 + 3] = qw;
    const len = length[i] ?? 0;
    let norm = Math.sqrt(vx * vx + vy * vy + vz * vz);
    vx /= norm;
    vy /= norm;
    vz /= norm;
    if (p >= 0 && len > 0 && py + vy * len < GROUND_REST_M) {
      // The ground carries a limb that would pass through it: it runs along the surface instead.
      const flat = Math.sqrt(vx * vx + vz * vz);
      const rise = Math.max(-1, Math.min(1, (GROUND_REST_M - py) / len));
      const across = Math.sqrt(1 - rise * rise);
      if (flat > 1e-6) {
        vx = (vx / flat) * across;
        vz = (vz / flat) * across;
      } else {
        vx = across;
        vz = 0;
      }
      vy = rise;
      norm = 1;
    }
    dir[i3] = vx;
    dir[i3 + 1] = vy;
    dir[i3 + 2] = vz;
    end[i3] = px + vx * len;
    end[i3 + 1] = py + vy * len;
    end[i3 + 2] = pz + vz * len;
  }
}
