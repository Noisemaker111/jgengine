import type { Vec3 } from "../../world/geometry";
import { solveLinearSystem } from "./rungeKutta";

/** How a body moves relative to its parent. */
export type RigidJoint =
  /** Six degrees of freedom; only the root (body 0) may use it. */
  | { kind: "free" }
  /** Rotation about `axis` (unit, parent axes) through the body's origin. */
  | { kind: "revolute"; axis: Vec3 }
  /** Translation along `axis` (unit, parent axes). */
  | { kind: "prismatic"; axis: Vec3 };

/**
 * One rigid body of a {@link RigidBodyTree}. Every frame is parallel to the world in the reference pose (all joint
 * coordinates zero, root unrotated), so a body is placed by world points in that pose.
 */
export interface RigidBodyDefinition {
  name: string;
  /** Index of the parent body; `-1` only for the root, which must come first. Parents come before children. */
  parent: number;
  joint: RigidJoint;
  /** World position of this body's frame origin (its joint) in the reference pose, m. */
  origin: Vec3;
  mass: number;
  /** World position of the centre of mass in the reference pose, m. */
  com: Vec3;
  /** Inertia tensor about the centre of mass in world axes in the reference pose, kg·m²: `[Ixx, Iyy, Izz, Ixy, Ixz, Iyz]` (tensor elements, so a product is `−∫xy dm`). */
  inertia: readonly [number, number, number, number, number, number];
}

/**
 * The positions of a tree: root position (3, world) and unit quaternion `[w, x, y, z]` (body to world), then one
 * coordinate per non-root joint. Velocities: root angular then linear velocity of the root origin, both in root
 * axes (6), then one rate per non-root joint.
 */
export interface RigidBodyTree {
  readonly bodies: readonly RigidBodyDefinition[];
  /** Number of position coordinates (`7 + joints`). */
  readonly positions: number;
  /** Number of velocity coordinates (`6 + joints`). */
  readonly dofs: number;
  /** Velocity index of a non-root body's joint rate. */
  dofOf(body: number): number;
  /** Position index of a non-root body's joint coordinate. */
  coordinateOf(body: number): number;
  /** Compute poses and velocities for `q`, `u`; everything below reads this state. */
  update(q: ArrayLike<number>, u: ArrayLike<number>): void;
  /** World rotation (body axes to world, row-major 3×3) of a body after {@link update}. */
  rotation(body: number): Float64Array;
  /** World position of a body's origin after {@link update}. */
  origin(body: number): Float64Array;
  /** World angular velocity of a body, rad/s. */
  angularVelocity(body: number, out: Float64Array): Float64Array;
  /** World velocity of the material point of `body` now at world point `p`, m/s. */
  pointVelocity(body: number, p: ArrayLike<number>, out: Float64Array): Float64Array;
  /** Clear applied forces, then add gravity `g` (world, m/s²) at every centre of mass. */
  clearForces(gravity: Vec3): void;
  /** Apply a world force at a world point on `body`. */
  applyForce(body: number, point: ArrayLike<number>, force: ArrayLike<number>): void;
  /** Apply a world torque to `body`. */
  applyTorque(body: number, torque: ArrayLike<number>): void;
  /** Add a generalized force on a velocity coordinate (a joint actuator; the equal and opposite reaction is implicit). */
  applyGeneralized(dof: number, value: number): void;
  /** Mass matrix `H(q)` (dofs × dofs, row-major) into `out`. */
  massMatrix(out: Float64Array): Float64Array;
  /** `τ_applied − C(q, u)`: applied generalized forces minus Coriolis, centrifugal and gyroscopic terms. */
  forcing(out: Float64Array): Float64Array;
  /** Velocity coordinates' accelerations `u̇ = H⁻¹(τ − C)` for the current state and forces. */
  accelerations(out: Float64Array): Float64Array;
  /**
   * Jacobian of the world velocity of the material point of `body` now at world `p` (3 × dofs, row-major), and its
   * acceleration with `u̇ = 0` (the velocity-product term), so `a_p = J·u̇ + bias`.
   */
  pointJacobian(body: number, p: ArrayLike<number>, jacobian: Float64Array, bias: Float64Array): void;
  /** Kinetic energy, J. */
  kineticEnergy(): number;
  /** Write the position-coordinate rates `q̇` for velocities `u` (quaternion kinematics for the root). */
  positionRates(q: ArrayLike<number>, u: ArrayLike<number>, out: Float64Array, offset?: number): void;
}

function cross(a: ArrayLike<number>, b: ArrayLike<number>, out: Float64Array, o = 0): void {
  const ax = a[0] ?? 0;
  const ay = a[1] ?? 0;
  const az = a[2] ?? 0;
  const bx = b[0] ?? 0;
  const by = b[1] ?? 0;
  const bz = b[2] ?? 0;
  out[o] = ay * bz - az * by;
  out[o + 1] = az * bx - ax * bz;
  out[o + 2] = ax * by - ay * bx;
}

/** `out = M·v` for row-major 3×3 `M` (offsets into flat arrays). */
function mulMv(m: ArrayLike<number>, mo: number, v: ArrayLike<number>, vo: number, out: Float64Array, oo: number): void {
  const x = v[vo] ?? 0;
  const y = v[vo + 1] ?? 0;
  const z = v[vo + 2] ?? 0;
  out[oo] = (m[mo] ?? 0) * x + (m[mo + 1] ?? 0) * y + (m[mo + 2] ?? 0) * z;
  out[oo + 1] = (m[mo + 3] ?? 0) * x + (m[mo + 4] ?? 0) * y + (m[mo + 5] ?? 0) * z;
  out[oo + 2] = (m[mo + 6] ?? 0) * x + (m[mo + 7] ?? 0) * y + (m[mo + 8] ?? 0) * z;
}

/** `out = Mᵀ·v`. */
function mulMtv(m: ArrayLike<number>, mo: number, v: ArrayLike<number>, vo: number, out: Float64Array, oo: number): void {
  const x = v[vo] ?? 0;
  const y = v[vo + 1] ?? 0;
  const z = v[vo + 2] ?? 0;
  out[oo] = (m[mo] ?? 0) * x + (m[mo + 3] ?? 0) * y + (m[mo + 6] ?? 0) * z;
  out[oo + 1] = (m[mo + 1] ?? 0) * x + (m[mo + 4] ?? 0) * y + (m[mo + 7] ?? 0) * z;
  out[oo + 2] = (m[mo + 2] ?? 0) * x + (m[mo + 5] ?? 0) * y + (m[mo + 8] ?? 0) * z;
}

function rotationAbout(axis: ArrayLike<number>, ao: number, angle: number, out: Float64Array): void {
  const x = axis[ao] ?? 0;
  const y = axis[ao + 1] ?? 0;
  const z = axis[ao + 2] ?? 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  out[0] = t * x * x + c;
  out[1] = t * x * y - s * z;
  out[2] = t * x * z + s * y;
  out[3] = t * x * y + s * z;
  out[4] = t * y * y + c;
  out[5] = t * y * z - s * x;
  out[6] = t * x * z - s * y;
  out[7] = t * y * z + s * x;
  out[8] = t * z * z + c;
}

/**
 * Creates a {@link RigidBodyTree}: a tree of rigid bodies on free, revolute and prismatic joints with exact
 * dynamics in spatial-vector form (Featherstone, *Rigid Body Dynamics Algorithms*, 2008): the composite-rigid-body
 * algorithm for the mass matrix and the recursive Newton–Euler algorithm for the velocity-product and applied
 * forces. No small-angle or decoupling approximations; gyroscopic coupling of every spinning body is included.
 * @capability rigid-body-tree exact multibody dynamics of a tree of rigid bodies — mass matrix, bias forces, point Jacobians
 */
export function createRigidBodyTree(definitions: readonly RigidBodyDefinition[]): RigidBodyTree {
  const nb = definitions.length;
  const root = definitions[0];
  if (root === undefined || root.joint.kind !== "free" || root.parent !== -1) throw new Error("rigidBodyTree: body 0 must be a free root");
  const dofIndex = new Int32Array(nb);
  const coordIndex = new Int32Array(nb);
  let dofs = 6;
  let positions = 7;
  for (let i = 1; i < nb; i++) {
    const body = definitions[i];
    if (body === undefined || body.parent < 0 || body.parent >= i || body.joint.kind === "free") throw new Error(`rigidBodyTree: body ${i} needs an earlier parent and a 1-DOF joint`);
    dofIndex[i] = dofs++;
    coordIndex[i] = positions++;
  }
  const parent = Int32Array.from(definitions, (body) => body.parent);
  // Joint origin of each body in its parent's frame (reference pose), centre of mass in its own frame, and the
  // rotational inertia about its own origin.
  const jointOffset = new Float64Array(3 * nb);
  const axis = new Float64Array(3 * nb);
  const prismatic = new Uint8Array(nb);
  const mass = new Float64Array(nb);
  const comLocal = new Float64Array(3 * nb);
  const inertiaOrigin = new Float64Array(9 * nb);
  for (let i = 0; i < nb; i++) {
    const body = definitions[i];
    if (body === undefined) continue;
    const parentBody = i === 0 ? undefined : definitions[body.parent];
    for (let k = 0; k < 3; k++) {
      jointOffset[3 * i + k] = (body.origin[k] ?? 0) - (parentBody?.origin[k] ?? 0);
      comLocal[3 * i + k] = (body.com[k] ?? 0) - (body.origin[k] ?? 0);
    }
    if (body.joint.kind !== "free") {
      const a = body.joint.axis;
      const norm = Math.hypot(a[0], a[1], a[2]) || 1;
      for (let k = 0; k < 3; k++) axis[3 * i + k] = (a[k] ?? 0) / norm;
      prismatic[i] = body.joint.kind === "prismatic" ? 1 : 0;
    }
    mass[i] = body.mass;
    const [ixx, iyy, izz, ixy, ixz, iyz] = body.inertia;
    const cx = comLocal[3 * i] ?? 0;
    const cy = comLocal[3 * i + 1] ?? 0;
    const cz = comLocal[3 * i + 2] ?? 0;
    const m = body.mass;
    const io = inertiaOrigin;
    const b = 9 * i;
    io[b] = ixx + m * (cy * cy + cz * cz);
    io[b + 4] = iyy + m * (cx * cx + cz * cz);
    io[b + 8] = izz + m * (cx * cx + cy * cy);
    io[b + 1] = io[b + 3] = ixy - m * cx * cy;
    io[b + 2] = io[b + 6] = ixz - m * cx * cz;
    io[b + 5] = io[b + 7] = iyz - m * cy * cz;
  }

  // Per-body state.
  const E = new Float64Array(9 * nb); // parent axes → body axes (body rotation relative to parent, transposed)
  const r = new Float64Array(3 * nb); // body origin in parent axes
  const Rw = new Float64Array(9 * nb); // body axes → world
  const pw = new Float64Array(3 * nb); // body origin, world
  const v = new Float64Array(6 * nb); // spatial velocity [ω; v_O] in body axes
  const a = new Float64Array(6 * nb);
  const f = new Float64Array(6 * nb);
  const fext = new Float64Array(6 * nb); // applied spatial force at the body origin, body axes
  const tauApplied = new Float64Array(dofs);
  const qd = new Float64Array(dofs);
  const rel = new Float64Array(9);
  const t3 = new Float64Array(3);
  const t3b = new Float64Array(3);
  const t3c = new Float64Array(3);
  const t6 = new Float64Array(6);
  // Composite inertia (mass, first moment h = m·c, rotational inertia about origin) per body.
  const cm = new Float64Array(nb);
  const ch = new Float64Array(3 * nb);
  const cI = new Float64Array(9 * nb);
  const F = new Float64Array(6);
  const ic = new Float64Array(9);
  const rot = new Float64Array(9);
  const unit = new Float64Array(6);
  const H = new Float64Array(dofs * dofs);
  const rhs = new Float64Array(dofs);

  /** Motion transform parent → body i: out = X·m (6-vectors at offsets). */
  function motionToChild(i: number, m: Float64Array, mo: number, out: Float64Array, oo: number): void {
    // ω' = E ω ; v' = E (v − r × ω)
    t3[0] = m[mo + 3] ?? 0;
    t3[1] = m[mo + 4] ?? 0;
    t3[2] = m[mo + 5] ?? 0;
    cross(r.subarray(3 * i, 3 * i + 3), m.subarray(mo, mo + 3), t3b);
    t3[0] -= t3b[0] ?? 0;
    t3[1] -= t3b[1] ?? 0;
    t3[2] -= t3b[2] ?? 0;
    mulMv(E, 9 * i, m, mo, out, oo);
    mulMv(E, 9 * i, t3, 0, out, oo + 3);
  }

  /** Force transform body i → parent, added into `out`: n_p += Eᵀn + r × Eᵀf ; f_p += Eᵀf. */
  function addForceToParent(i: number, fo: Float64Array, foo: number, out: Float64Array, oo: number): void {
    mulMtv(E, 9 * i, fo, foo + 3, t3, 0);
    mulMtv(E, 9 * i, fo, foo, t3b, 0);
    cross(r.subarray(3 * i, 3 * i + 3), t3, t3c);
    out[oo] = (out[oo] ?? 0) + (t3b[0] ?? 0) + (t3c[0] ?? 0);
    out[oo + 1] = (out[oo + 1] ?? 0) + (t3b[1] ?? 0) + (t3c[1] ?? 0);
    out[oo + 2] = (out[oo + 2] ?? 0) + (t3b[2] ?? 0) + (t3c[2] ?? 0);
    out[oo + 3] = (out[oo + 3] ?? 0) + (t3[0] ?? 0);
    out[oo + 4] = (out[oo + 4] ?? 0) + (t3[1] ?? 0);
    out[oo + 5] = (out[oo + 5] ?? 0) + (t3[2] ?? 0);
  }

  /** out = I_i·m for body i's own rigid inertia (spatial, at its origin). */
  function inertiaTimes(mm: number, h: Float64Array, ho: number, io: Float64Array, ioo: number, m: Float64Array, mo: number, out: Float64Array, oo: number): void {
    const wx = m[mo] ?? 0;
    const wy = m[mo + 1] ?? 0;
    const wz = m[mo + 2] ?? 0;
    const vx = m[mo + 3] ?? 0;
    const vy = m[mo + 4] ?? 0;
    const vz = m[mo + 5] ?? 0;
    const hx = h[ho] ?? 0;
    const hy = h[ho + 1] ?? 0;
    const hz = h[ho + 2] ?? 0;
    // n = Io ω + h × v ; f = m v − h × ω
    out[oo] = (io[ioo] ?? 0) * wx + (io[ioo + 1] ?? 0) * wy + (io[ioo + 2] ?? 0) * wz + (hy * vz - hz * vy);
    out[oo + 1] = (io[ioo + 3] ?? 0) * wx + (io[ioo + 4] ?? 0) * wy + (io[ioo + 5] ?? 0) * wz + (hz * vx - hx * vz);
    out[oo + 2] = (io[ioo + 6] ?? 0) * wx + (io[ioo + 7] ?? 0) * wy + (io[ioo + 8] ?? 0) * wz + (hx * vy - hy * vx);
    out[oo + 3] = mm * vx - (hy * wz - hz * wy);
    out[oo + 4] = mm * vy - (hz * wx - hx * wz);
    out[oo + 5] = mm * vz - (hx * wy - hy * wx);
  }

  const hBody = new Float64Array(3 * nb);
  for (let i = 0; i < nb; i++) for (let k = 0; k < 3; k++) hBody[3 * i + k] = (mass[i] ?? 0) * (comLocal[3 * i + k] ?? 0);

  function update(q: ArrayLike<number>, u: ArrayLike<number>): void {
    for (let k = 0; k < dofs; k++) qd[k] = u[k] ?? 0;
    // Root.
    const qw = q[3] ?? 1;
    const qx = q[4] ?? 0;
    const qy = q[5] ?? 0;
    const qz = q[6] ?? 0;
    const norm = Math.hypot(qw, qx, qy, qz) || 1;
    const w = qw / norm;
    const x = qx / norm;
    const y = qy / norm;
    const z = qz / norm;
    Rw[0] = 1 - 2 * (y * y + z * z);
    Rw[1] = 2 * (x * y - w * z);
    Rw[2] = 2 * (x * z + w * y);
    Rw[3] = 2 * (x * y + w * z);
    Rw[4] = 1 - 2 * (x * x + z * z);
    Rw[5] = 2 * (y * z - w * x);
    Rw[6] = 2 * (x * z - w * y);
    Rw[7] = 2 * (y * z + w * x);
    Rw[8] = 1 - 2 * (x * x + y * y);
    for (let k = 0; k < 9; k++) E[k] = Rw[3 * (k % 3) + Math.floor(k / 3)] ?? 0;
    pw[0] = q[0] ?? 0;
    pw[1] = q[1] ?? 0;
    pw[2] = q[2] ?? 0;
    r[0] = pw[0];
    r[1] = pw[1];
    r[2] = pw[2];
    for (let k = 0; k < 6; k++) v[k] = u[k] ?? 0;
    for (let i = 1; i < nb; i++) {
      const p = parent[i] ?? 0;
      const qi = q[coordIndex[i] ?? 0] ?? 0;
      const ax = axis.subarray(3 * i, 3 * i + 3);
      if (prismatic[i] === 1) {
        rel.fill(0);
        rel[0] = rel[4] = rel[8] = 1;
        for (let k = 0; k < 3; k++) r[3 * i + k] = (jointOffset[3 * i + k] ?? 0) + (ax[k] ?? 0) * qi;
      } else {
        rotationAbout(axis, 3 * i, qi, rel);
        for (let k = 0; k < 3; k++) r[3 * i + k] = jointOffset[3 * i + k] ?? 0;
      }
      // E_i = relᵀ ; R_i = R_p · rel ; p_i = p_p + R_p r_i
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) E[9 * i + 3 * row + col] = rel[3 * col + row] ?? 0;
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          let sum = 0;
          for (let k = 0; k < 3; k++) sum += (Rw[9 * p + 3 * row + k] ?? 0) * (rel[3 * k + col] ?? 0);
          Rw[9 * i + 3 * row + col] = sum;
        }
      mulMv(Rw, 9 * p, r, 3 * i, t3, 0);
      for (let k = 0; k < 3; k++) pw[3 * i + k] = (pw[3 * p + k] ?? 0) + (t3[k] ?? 0);
      motionToChild(i, v, 6 * p, v, 6 * i);
      const rate = qd[dofIndex[i] ?? 0] ?? 0;
      const o = prismatic[i] === 1 ? 3 : 0;
      for (let k = 0; k < 3; k++) v[6 * i + o + k] = (v[6 * i + o + k] ?? 0) + (ax[k] ?? 0) * rate;
    }
  }

  function clearForces(gravity: Vec3): void {
    fext.fill(0);
    tauApplied.fill(0);
    for (let i = 0; i < nb; i++) {
      const m = mass[i] ?? 0;
      if (m === 0) continue;
      t3c[0] = gravity[0] * m;
      t3c[1] = gravity[1] * m;
      t3c[2] = gravity[2] * m;
      mulMtv(Rw, 9 * i, t3c, 0, t3, 0);
      // n = c × F, f = F at the body origin.
      cross(comLocal.subarray(3 * i, 3 * i + 3), t3, t3b);
      for (let k = 0; k < 3; k++) {
        fext[6 * i + k] = (fext[6 * i + k] ?? 0) + (t3b[k] ?? 0);
        fext[6 * i + 3 + k] = (fext[6 * i + 3 + k] ?? 0) + (t3[k] ?? 0);
      }
    }
  }

  function applyForce(body: number, point: ArrayLike<number>, force: ArrayLike<number>): void {
    for (let k = 0; k < 3; k++) t3c[k] = (point[k] ?? 0) - (pw[3 * body + k] ?? 0);
    mulMtv(Rw, 9 * body, t3c, 0, t3c, 0);
    mulMtv(Rw, 9 * body, force, 0, t3, 0);
    cross(t3c, t3, t3b);
    for (let k = 0; k < 3; k++) {
      fext[6 * body + k] = (fext[6 * body + k] ?? 0) + (t3b[k] ?? 0);
      fext[6 * body + 3 + k] = (fext[6 * body + 3 + k] ?? 0) + (t3[k] ?? 0);
    }
  }

  function applyTorque(body: number, torque: ArrayLike<number>): void {
    mulMtv(Rw, 9 * body, torque, 0, t3, 0);
    for (let k = 0; k < 3; k++) fext[6 * body + k] = (fext[6 * body + k] ?? 0) + (t3[k] ?? 0);
  }

  /** Recursive Newton–Euler with the given joint accelerations (or none): writes generalized forces into `out`. */
  function inverseDynamics(accel: ArrayLike<number> | undefined, includeVelocity: boolean, includeApplied: boolean, out: Float64Array): void {
    for (let k = 0; k < 6; k++) a[k] = accel === undefined ? 0 : (accel[k] ?? 0);
    for (let i = 1; i < nb; i++) {
      const p = parent[i] ?? 0;
      motionToChild(i, a, 6 * p, a, 6 * i);
      const rate = includeVelocity ? (qd[dofIndex[i] ?? 0] ?? 0) : 0;
      const acc = accel === undefined ? 0 : (accel[dofIndex[i] ?? 0] ?? 0);
      const o = prismatic[i] === 1 ? 3 : 0;
      for (let k = 0; k < 3; k++) {
        const s = axis[3 * i + k] ?? 0;
        a[6 * i + o + k] = (a[6 * i + o + k] ?? 0) + s * acc;
        t6[k] = 0;
        t6[3 + k] = 0;
        t6[o + k] = s * rate;
      }
      if (rate !== 0) {
        // c = v_i × (S q̇): [ω × ω_s ; ω × v_s + v × ω_s]
        const vi = v.subarray(6 * i, 6 * i + 6);
        cross(vi, t6.subarray(0, 3), t3);
        cross(vi, t6.subarray(3, 6), t3b);
        cross(vi.subarray(3, 6), t6.subarray(0, 3), t3c);
        for (let k = 0; k < 3; k++) {
          a[6 * i + k] = (a[6 * i + k] ?? 0) + (t3[k] ?? 0);
          a[6 * i + 3 + k] = (a[6 * i + 3 + k] ?? 0) + (t3b[k] ?? 0) + (t3c[k] ?? 0);
        }
      }
    }
    for (let i = 0; i < nb; i++) {
      inertiaTimes(mass[i] ?? 0, hBody, 3 * i, inertiaOrigin, 9 * i, a, 6 * i, f, 6 * i);
      if (includeVelocity) {
        // v ×* (I v): [ω × n + v × f ; ω × f]
        inertiaTimes(mass[i] ?? 0, hBody, 3 * i, inertiaOrigin, 9 * i, v, 6 * i, t6, 0);
        const vi = v.subarray(6 * i, 6 * i + 6);
        cross(vi, t6.subarray(0, 3), t3);
        cross(vi.subarray(3, 6), t6.subarray(3, 6), t3b);
        cross(vi, t6.subarray(3, 6), t3c);
        for (let k = 0; k < 3; k++) {
          f[6 * i + k] = (f[6 * i + k] ?? 0) + (t3[k] ?? 0) + (t3b[k] ?? 0);
          f[6 * i + 3 + k] = (f[6 * i + 3 + k] ?? 0) + (t3c[k] ?? 0);
        }
      }
      if (includeApplied) for (let k = 0; k < 6; k++) f[6 * i + k] = (f[6 * i + k] ?? 0) - (fext[6 * i + k] ?? 0);
    }
    for (let i = nb - 1; i >= 1; i--) {
      const o = prismatic[i] === 1 ? 3 : 0;
      let tau = 0;
      for (let k = 0; k < 3; k++) tau += (axis[3 * i + k] ?? 0) * (f[6 * i + o + k] ?? 0);
      out[dofIndex[i] ?? 0] = tau;
      addForceToParent(i, f, 6 * i, f, 6 * (parent[i] ?? 0));
    }
    for (let k = 0; k < 6; k++) out[k] = f[k] ?? 0;
  }

  function massMatrix(out: Float64Array): Float64Array {
    for (let i = 0; i < nb; i++) {
      cm[i] = mass[i] ?? 0;
      for (let k = 0; k < 3; k++) ch[3 * i + k] = hBody[3 * i + k] ?? 0;
      for (let k = 0; k < 9; k++) cI[9 * i + k] = inertiaOrigin[9 * i + k] ?? 0;
    }
    for (let i = nb - 1; i >= 1; i--) {
      const p = parent[i] ?? 0;
      const m = cm[i] ?? 0;
      if (m === 0) continue;
      // Composite of i in parent axes: c' = r + Eᵀc ; I_c(parent) = Eᵀ I_c E ; about parent origin by parallel axis.
      const cx = (ch[3 * i] ?? 0) / m;
      const cy = (ch[3 * i + 1] ?? 0) / m;
      const cz = (ch[3 * i + 2] ?? 0) / m;
      const b = 9 * i;
      ic[0] = (cI[b] ?? 0) - m * (cy * cy + cz * cz);
      ic[4] = (cI[b + 4] ?? 0) - m * (cx * cx + cz * cz);
      ic[8] = (cI[b + 8] ?? 0) - m * (cx * cx + cy * cy);
      ic[1] = ic[3] = (cI[b + 1] ?? 0) + m * cx * cy;
      ic[2] = ic[6] = (cI[b + 2] ?? 0) + m * cx * cz;
      ic[5] = ic[7] = (cI[b + 5] ?? 0) + m * cy * cz;
      // R = Eᵀ (body → parent): I' = R ic Rᵀ = Eᵀ ic E
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          let sum = 0;
          for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) sum += (E[b + 3 * k + row] ?? 0) * (ic[3 * k + l] ?? 0) * (E[b + 3 * l + col] ?? 0);
          rot[3 * row + col] = sum;
        }
      t3c[0] = cx;
      t3c[1] = cy;
      t3c[2] = cz;
      mulMtv(E, b, t3c, 0, t3, 0);
      const px = (r[3 * i] ?? 0) + (t3[0] ?? 0);
      const py = (r[3 * i + 1] ?? 0) + (t3[1] ?? 0);
      const pz = (r[3 * i + 2] ?? 0) + (t3[2] ?? 0);
      const pb = 9 * p;
      cI[pb] = (cI[pb] ?? 0) + (rot[0] ?? 0) + m * (py * py + pz * pz);
      cI[pb + 4] = (cI[pb + 4] ?? 0) + (rot[4] ?? 0) + m * (px * px + pz * pz);
      cI[pb + 8] = (cI[pb + 8] ?? 0) + (rot[8] ?? 0) + m * (px * px + py * py);
      const xy = (rot[1] ?? 0) - m * px * py;
      const xz = (rot[2] ?? 0) - m * px * pz;
      const yz = (rot[5] ?? 0) - m * py * pz;
      cI[pb + 1] = (cI[pb + 1] ?? 0) + xy;
      cI[pb + 3] = (cI[pb + 3] ?? 0) + xy;
      cI[pb + 2] = (cI[pb + 2] ?? 0) + xz;
      cI[pb + 6] = (cI[pb + 6] ?? 0) + xz;
      cI[pb + 5] = (cI[pb + 5] ?? 0) + yz;
      cI[pb + 7] = (cI[pb + 7] ?? 0) + yz;
      cm[p] = (cm[p] ?? 0) + m;
      ch[3 * p] = (ch[3 * p] ?? 0) + m * px;
      ch[3 * p + 1] = (ch[3 * p + 1] ?? 0) + m * py;
      ch[3 * p + 2] = (ch[3 * p + 2] ?? 0) + m * pz;
    }
    out.fill(0);
    for (let i = nb - 1; i >= 0; i--) {
      const columns = i === 0 ? 6 : 1;
      for (let c = 0; c < columns; c++) {
        unit.fill(0);
        if (i === 0) unit[c] = 1;
        else {
          const o = prismatic[i] === 1 ? 3 : 0;
          for (let k = 0; k < 3; k++) unit[o + k] = axis[3 * i + k] ?? 0;
        }
        const row = i === 0 ? c : (dofIndex[i] ?? 0);
        inertiaTimes(cm[i] ?? 0, ch, 3 * i, cI, 9 * i, unit, 0, F, 0);
        let j = i;
        for (;;) {
          if (j === 0) {
            for (let k = 0; k < 6; k++) {
              out[row * dofs + k] = F[k] ?? 0;
              out[k * dofs + row] = F[k] ?? 0;
            }
            break;
          }
          const o = prismatic[j] === 1 ? 3 : 0;
          let value = 0;
          for (let k = 0; k < 3; k++) value += (axis[3 * j + k] ?? 0) * (F[o + k] ?? 0);
          const col = dofIndex[j] ?? 0;
          out[row * dofs + col] = value;
          out[col * dofs + row] = value;
          t6.fill(0);
          addForceToParent(j, F, 0, t6, 0);
          for (let k = 0; k < 6; k++) F[k] = t6[k] ?? 0;
          j = parent[j] ?? 0;
        }
      }
    }
    return out;
  }

  const bias = new Float64Array(dofs);
  function forcing(out: Float64Array): Float64Array {
    inverseDynamics(undefined, true, true, bias);
    for (let k = 0; k < dofs; k++) out[k] = (tauApplied[k] ?? 0) - (bias[k] ?? 0);
    return out;
  }

  const ancestors = (body: number): number[] => {
    const chain: number[] = [];
    for (let j = body; j >= 0; j = j === 0 ? -1 : (parent[j] ?? -1)) chain.push(j);
    return chain;
  };
  const chains = definitions.map((_, i) => ancestors(i));
  const wv = new Float64Array(3);
  const lv = new Float64Array(3);
  const rp = new Float64Array(3);

  return {
    bodies: definitions,
    positions,
    dofs,
    dofOf: (body) => dofIndex[body] ?? 0,
    coordinateOf: (body) => coordIndex[body] ?? 0,
    update,
    rotation: (body) => Rw.subarray(9 * body, 9 * body + 9),
    origin: (body) => pw.subarray(3 * body, 3 * body + 3),
    angularVelocity(body, out) {
      mulMv(Rw, 9 * body, v, 6 * body, out, 0);
      return out;
    },
    pointVelocity(body, p, out) {
      mulMv(Rw, 9 * body, v, 6 * body, wv, 0);
      mulMv(Rw, 9 * body, v, 6 * body + 3, lv, 0);
      for (let k = 0; k < 3; k++) rp[k] = (p[k] ?? 0) - (pw[3 * body + k] ?? 0);
      cross(wv, rp, out);
      for (let k = 0; k < 3; k++) out[k] = (out[k] ?? 0) + (lv[k] ?? 0);
      return out;
    },
    clearForces,
    applyForce,
    applyTorque,
    applyGeneralized(dof, value) {
      tauApplied[dof] = (tauApplied[dof] ?? 0) + value;
    },
    massMatrix,
    forcing,
    accelerations(out) {
      massMatrix(H);
      forcing(rhs);
      solveLinearSystem(H, rhs, dofs);
      for (let k = 0; k < dofs; k++) out[k] = rhs[k] ?? 0;
      return out;
    },
    pointJacobian(body, p, jacobian, biasOut) {
      jacobian.fill(0);
      for (const j of chains[body] ?? []) {
        const columns = j === 0 ? 6 : 1;
        for (let c = 0; c < columns; c++) {
          // Unit motion of this dof as world angular velocity and world velocity of the body-j origin.
          if (j === 0) {
            const col = c < 3 ? c : c - 3;
            for (let k = 0; k < 3; k++) {
              const e = Rw[3 * k + col] ?? 0;
              wv[k] = c < 3 ? e : 0;
              lv[k] = c < 3 ? 0 : e;
            }
          } else {
            mulMv(Rw, 9 * j, axis, 3 * j, t3, 0);
            for (let k = 0; k < 3; k++) {
              wv[k] = prismatic[j] === 1 ? 0 : (t3[k] ?? 0);
              lv[k] = prismatic[j] === 1 ? (t3[k] ?? 0) : 0;
            }
          }
          for (let k = 0; k < 3; k++) rp[k] = (p[k] ?? 0) - (pw[3 * j + k] ?? 0);
          cross(wv, rp, t3b);
          const col = j === 0 ? c : (dofIndex[j] ?? 0);
          for (let k = 0; k < 3; k++) jacobian[k * dofs + col] = (t3b[k] ?? 0) + (lv[k] ?? 0);
        }
      }
      // Velocity-product acceleration: spatial accelerations with u̇ = 0, then the classical point acceleration.
      inverseDynamics(undefined, true, false, bias);
      const i = body;
      for (let k = 0; k < 3; k++) rp[k] = (p[k] ?? 0) - (pw[3 * i + k] ?? 0);
      mulMtv(Rw, 9 * i, rp, 0, rp, 0);
      const w = v.subarray(6 * i, 6 * i + 3);
      const vo = v.subarray(6 * i + 3, 6 * i + 6);
      const alpha = a.subarray(6 * i, 6 * i + 3);
      cross(w, vo, t3);
      cross(alpha, rp, t3b);
      cross(w, rp, t3c);
      cross(w, t3c, wv);
      for (let k = 0; k < 3; k++) lv[k] = (a[6 * i + 3 + k] ?? 0) + (t3[k] ?? 0) + (t3b[k] ?? 0) + (wv[k] ?? 0);
      mulMv(Rw, 9 * i, lv, 0, biasOut, 0);
    },
    kineticEnergy() {
      let energy = 0;
      for (let i = 0; i < nb; i++) {
        inertiaTimes(mass[i] ?? 0, hBody, 3 * i, inertiaOrigin, 9 * i, v, 6 * i, t6, 0);
        for (let k = 0; k < 6; k++) energy += 0.5 * (v[6 * i + k] ?? 0) * (t6[k] ?? 0);
      }
      return energy;
    },
    positionRates(q, u, out, offset = 0) {
      const qw = q[3] ?? 1;
      const qx = q[4] ?? 0;
      const qy = q[5] ?? 0;
      const qz = q[6] ?? 0;
      const wx = u[0] ?? 0;
      const wy = u[1] ?? 0;
      const wz = u[2] ?? 0;
      // ṗ = R v_body ; q̇ = ½ q ⊗ (0, ω_body)
      const r00 = 1 - 2 * (qy * qy + qz * qz);
      const r01 = 2 * (qx * qy - qw * qz);
      const r02 = 2 * (qx * qz + qw * qy);
      const r10 = 2 * (qx * qy + qw * qz);
      const r11 = 1 - 2 * (qx * qx + qz * qz);
      const r12 = 2 * (qy * qz - qw * qx);
      const r20 = 2 * (qx * qz - qw * qy);
      const r21 = 2 * (qy * qz + qw * qx);
      const r22 = 1 - 2 * (qx * qx + qy * qy);
      const vx = u[3] ?? 0;
      const vy = u[4] ?? 0;
      const vz = u[5] ?? 0;
      out[offset] = r00 * vx + r01 * vy + r02 * vz;
      out[offset + 1] = r10 * vx + r11 * vy + r12 * vz;
      out[offset + 2] = r20 * vx + r21 * vy + r22 * vz;
      out[offset + 3] = 0.5 * (-qx * wx - qy * wy - qz * wz);
      out[offset + 4] = 0.5 * (qw * wx + qy * wz - qz * wy);
      out[offset + 5] = 0.5 * (qw * wy + qz * wx - qx * wz);
      out[offset + 6] = 0.5 * (qw * wz + qx * wy - qy * wx);
      for (let k = 6; k < dofs; k++) out[offset + 1 + k] = u[k] ?? 0;
    },
  };
}
