/** One rigid segment of a {@link PlanarMultibody}, given in the reference pose (every angle zero). */
export interface PlanarSegment {
  name: string;
  /** Index of the parent segment; `-1` only for the root, which must come first. Parents come before children. */
  parent: number;
  /** This segment's proximal joint relative to the parent's proximal joint (root: unused), m. */
  joint: readonly [number, number];
  /** Centre of mass relative to this segment's proximal joint, m. */
  com: readonly [number, number];
  mass: number;
  /** Moment of inertia about the centre of mass, out of the plane, kg·m². */
  inertia: number;
}

/**
 * A planar tree of rigid segments on a floating base, in absolute coordinates: `q = [x, y, φ₀ … φₙ₋₁]` where
 * `(x, y)` is the root's proximal joint and `φᵢ` is segment `i`'s counter-clockwise rotation from its reference
 * pose. Absolute angles keep every Jacobian a sum of perpendicular lever arms, so the mass matrix and the
 * velocity-product terms are exact and cheap.
 */
export interface PlanarMultibody {
  readonly segments: readonly PlanarSegment[];
  /** Number of coordinates, `2 + segments`. */
  readonly dofs: number;
  readonly totalMass: number;
  /** World position of a point fixed on `segment`, given in that segment's reference-pose frame (relative to its proximal joint). */
  point(q: ArrayLike<number>, segment: number, local: readonly [number, number], out: Float64Array): Float64Array;
  /** World velocity of that point. */
  pointVelocity(q: ArrayLike<number>, u: ArrayLike<number>, segment: number, local: readonly [number, number], out: Float64Array): Float64Array;
  /** Whole-body centre of mass `[x, y]` and its velocity `[vx, vy]`. */
  centerOfMass(q: ArrayLike<number>, u: ArrayLike<number>, out: Float64Array): Float64Array;
  /** Accelerations `q̈` for the generalized forces `Q` (gravity and velocity terms added here). `Q` is not modified. */
  accelerations(q: ArrayLike<number>, u: ArrayLike<number>, Q: ArrayLike<number>, gravity: number, out: Float64Array): Float64Array;
  /** Add the generalized force of a world force `F` acting at a world point on `segment` into `Q`. */
  addPointForce(q: ArrayLike<number>, segment: number, point: ArrayLike<number>, force: ArrayLike<number>, Q: Float64Array): void;
  /** Add a joint torque between `segment` and its parent (on the segment, counter-clockwise positive; the parent gets the reaction). */
  addJointTorque(segment: number, torque: number, Q: Float64Array): void;
  /** Kinetic energy, J. */
  kineticEnergy(q: ArrayLike<number>, u: ArrayLike<number>): number;
}

// stateless: only scratch buffers and an index of the segment tree; the body's state is the caller-held q and u.
/**
 * Creates a {@link PlanarMultibody} from segments. Dynamics are Lagrange's equations in absolute coordinates:
 * `M(q)·q̈ = Q − Σ mᵢ Jᵢᵀ (J̇ᵢ q̇) + gravity`, with `M = Σ mᵢ JᵢᵀJᵢ + Iᵢ eᵢeᵢᵀ` solved by Cholesky.
 * @capability planar-multibody exact planar floating-base multibody dynamics for sagittal-plane biomechanics
 */
export function createPlanarMultibody(segments: readonly PlanarSegment[]): PlanarMultibody {
  const n = segments.length;
  const root = segments[0];
  if (root === undefined || root.parent !== -1) throw new Error("planarMultibody: segment 0 must be the root");
  for (let i = 1; i < n; i++) {
    const s = segments[i];
    if (s === undefined || s.parent < 0 || s.parent >= i) throw new Error(`planarMultibody: segment ${i} needs an earlier parent`);
  }
  const dofs = 2 + n;
  // Ancestor chain of each segment, root first, excluding the segment itself, and each link's lever: the vector from
  // the ancestor's proximal joint to the next segment's proximal joint along the chain, in the ancestor's frame.
  const chains: { segment: number; lever: [number, number] }[][] = [];
  for (let i = 0; i < n; i++) {
    const chain: { segment: number; lever: [number, number] }[] = [];
    let child = i;
    let parent = segments[i]?.parent ?? -1;
    while (parent >= 0) {
      const joint = segments[child]?.joint ?? [0, 0];
      chain.unshift({ segment: parent, lever: [joint[0], joint[1]] });
      child = parent;
      parent = segments[parent]?.parent ?? -1;
    }
    chains.push(chain);
  }
  const mass = Float64Array.from(segments, (s) => s.mass);
  const inertia = Float64Array.from(segments, (s) => s.inertia);
  const totalMass = mass.reduce((sum, m) => sum + m, 0);
  const M = new Float64Array(dofs * dofs);
  const rhs = new Float64Array(dofs);
  const jx = new Float64Array(dofs);
  const jy = new Float64Array(dofs);
  const p = new Float64Array(2);

  // Flattened chains: for segment i, entries chainStart[i]..chainStart[i+1] list (segment, leverX, leverY) from the
  // root down to its parent.
  const chainStart = new Int32Array(n + 1);
  const flat: number[] = [];
  for (let i = 0; i < n; i++) {
    chainStart[i] = flat.length / 3;
    for (const link of chains[i] ?? []) flat.push(link.segment, link.lever[0], link.lever[1]);
  }
  chainStart[n] = flat.length / 3;
  const chainData = Float64Array.from(flat);

  /** Jacobian rows of a point on `segment` (local lever `lx, ly`) into `jx`, `jy`; with `u`, the bias acceleration into `bias`. */
  function jacobian(q: ArrayLike<number>, u: ArrayLike<number> | null, segment: number, lx: number, ly: number, bias: Float64Array): void {
    jx.fill(0);
    jy.fill(0);
    jx[0] = 1;
    jy[1] = 1;
    let bx = 0;
    let by = 0;
    const end = (chainStart[segment + 1] ?? 0) - (chainStart[segment] ?? 0);
    const base = chainStart[segment] ?? 0;
    for (let e = 0; e <= end; e++) {
      let k: number;
      let vx: number;
      let vy: number;
      if (e < end) {
        k = chainData[3 * (base + e)] ?? 0;
        vx = chainData[3 * (base + e) + 1] ?? 0;
        vy = chainData[3 * (base + e) + 2] ?? 0;
      } else {
        k = segment;
        vx = lx;
        vy = ly;
      }
      const a = q[2 + k] ?? 0;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const rx = c * vx - s * vy;
      const ry = s * vx + c * vy;
      jx[2 + k] = (jx[2 + k] ?? 0) - ry;
      jy[2 + k] = (jy[2 + k] ?? 0) + rx;
      if (u !== null) {
        const w = u[2 + k] ?? 0;
        bx -= w * w * rx;
        by -= w * w * ry;
      }
    }
    bias[0] = bx;
    bias[1] = by;
  }

  function point(q: ArrayLike<number>, segment: number, local: readonly [number, number], out: Float64Array): Float64Array {
    let x = q[0] ?? 0;
    let y = q[1] ?? 0;
    const end = (chainStart[segment + 1] ?? 0) - (chainStart[segment] ?? 0);
    const base = chainStart[segment] ?? 0;
    for (let e = 0; e <= end; e++) {
      const k = e < end ? (chainData[3 * (base + e)] ?? 0) : segment;
      const vx = e < end ? (chainData[3 * (base + e) + 1] ?? 0) : local[0];
      const vy = e < end ? (chainData[3 * (base + e) + 2] ?? 0) : local[1];
      const a = q[2 + k] ?? 0;
      const c = Math.cos(a);
      const s = Math.sin(a);
      x += c * vx - s * vy;
      y += s * vx + c * vy;
    }
    out[0] = x;
    out[1] = y;
    return out;
  }

  function pointVelocity(q: ArrayLike<number>, u: ArrayLike<number>, segment: number, local: readonly [number, number], out: Float64Array): Float64Array {
    jacobian(q, null, segment, local[0], local[1], p);
    let vx = 0;
    let vy = 0;
    for (let k = 0; k < dofs; k++) {
      const uk = u[k] ?? 0;
      vx += (jx[k] ?? 0) * uk;
      vy += (jy[k] ?? 0) * uk;
    }
    out[0] = vx;
    out[1] = vy;
    return out;
  }

  const c2 = new Float64Array(2);
  const v2 = new Float64Array(2);
  function centerOfMass(q: ArrayLike<number>, u: ArrayLike<number>, out: Float64Array): Float64Array {
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n; i++) {
      const s = segments[i];
      if (s === undefined) continue;
      point(q, i, s.com, c2);
      pointVelocity(q, u, i, s.com, v2);
      x += s.mass * (c2[0] ?? 0);
      y += s.mass * (c2[1] ?? 0);
      vx += s.mass * (v2[0] ?? 0);
      vy += s.mass * (v2[1] ?? 0);
    }
    out[0] = x / totalMass;
    out[1] = y / totalMass;
    out[2] = vx / totalMass;
    out[3] = vy / totalMass;
    return out;
  }

  const bias = new Float64Array(2);
  function accelerations(q: ArrayLike<number>, u: ArrayLike<number>, Q: ArrayLike<number>, gravity: number, out: Float64Array): Float64Array {
    M.fill(0);
    for (let k = 0; k < dofs; k++) rhs[k] = Q[k] ?? 0;
    for (let i = 0; i < n; i++) {
      const s = segments[i];
      if (s === undefined) continue;
      const m = mass[i] ?? 0;
      jacobian(q, u, i, s.com[0], s.com[1], bias);
      const fx = -m * (bias[0] ?? 0);
      const fy = -m * (bias[1] ?? 0) - m * gravity;
      for (let a = 0; a < dofs; a++) {
        const ja = jx[a] ?? 0;
        const jb = jy[a] ?? 0;
        if (ja === 0 && jb === 0) continue;
        rhs[a] = (rhs[a] ?? 0) + ja * fx + jb * fy;
        const row = a * dofs;
        for (let b = a; b < dofs; b++) {
          const xb = jx[b] ?? 0;
          const yb = jy[b] ?? 0;
          if (xb !== 0 || yb !== 0) M[row + b] = (M[row + b] ?? 0) + m * (ja * xb + jb * yb);
        }
      }
      M[(2 + i) * dofs + 2 + i] = (M[(2 + i) * dofs + 2 + i] ?? 0) + (inertia[i] ?? 0);
    }
    // Cholesky in place on the upper triangle (M = UᵀU), then forward and back substitution.
    for (let a = 0; a < dofs; a++) {
      let d = M[a * dofs + a] ?? 0;
      for (let k = 0; k < a; k++) d -= (M[k * dofs + a] ?? 0) ** 2;
      if (!(d > 0)) throw new Error("planarMultibody: mass matrix is not positive definite");
      const ud = Math.sqrt(d);
      M[a * dofs + a] = ud;
      for (let b = a + 1; b < dofs; b++) {
        let v = M[a * dofs + b] ?? 0;
        for (let k = 0; k < a; k++) v -= (M[k * dofs + a] ?? 0) * (M[k * dofs + b] ?? 0);
        M[a * dofs + b] = v / ud;
      }
    }
    for (let a = 0; a < dofs; a++) {
      let v = rhs[a] ?? 0;
      for (let k = 0; k < a; k++) v -= (M[k * dofs + a] ?? 0) * (out[k] ?? 0);
      out[a] = v / (M[a * dofs + a] ?? 1);
    }
    for (let a = dofs - 1; a >= 0; a--) {
      let v = out[a] ?? 0;
      for (let k = a + 1; k < dofs; k++) v -= (M[a * dofs + k] ?? 0) * (out[k] ?? 0);
      out[a] = v / (M[a * dofs + a] ?? 1);
    }
    return out;
  }

  const local = new Float64Array(2);
  function addPointForce(q: ArrayLike<number>, segment: number, at: ArrayLike<number>, force: ArrayLike<number>, Q: Float64Array): void {
    // Lever of the world point in the segment's reference frame, from its proximal joint.
    const s = segments[segment];
    if (s === undefined) return;
    point(q, segment, [0, 0], local);
    const a = q[2 + segment] ?? 0;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const dx = (at[0] ?? 0) - (local[0] ?? 0);
    const dy = (at[1] ?? 0) - (local[1] ?? 0);
    jacobian(q, null, segment, c * dx + sn * dy, -sn * dx + c * dy, bias);
    const fx = force[0] ?? 0;
    const fy = force[1] ?? 0;
    for (let k = 0; k < dofs; k++) Q[k] = (Q[k] ?? 0) + (jx[k] ?? 0) * fx + (jy[k] ?? 0) * fy;
  }

  function addJointTorque(segment: number, torque: number, Q: Float64Array): void {
    const parent = segments[segment]?.parent ?? -1;
    Q[2 + segment] = (Q[2 + segment] ?? 0) + torque;
    if (parent >= 0) Q[2 + parent] = (Q[2 + parent] ?? 0) - torque;
  }

  function kineticEnergy(q: ArrayLike<number>, u: ArrayLike<number>): number {
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const s = segments[i];
      if (s === undefined) continue;
      pointVelocity(q, u, i, s.com, v2);
      const w = u[2 + i] ?? 0;
      energy += 0.5 * s.mass * ((v2[0] ?? 0) ** 2 + (v2[1] ?? 0) ** 2) + 0.5 * s.inertia * w * w;
    }
    return energy;
  }

  return { segments, dofs, totalMass, point, pointVelocity, centerOfMass, accelerations, addPointForce, addJointTorque, kineticEnergy };
}
