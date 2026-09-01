/** `[x, y, z]`. */
export type PhysicsVec3 = readonly [number, number, number];
/** Unit quaternion `[x, y, z, w]`; `[0, 0, 0, 1]` is identity. */
export type PhysicsQuat = readonly [number, number, number, number];

/** The identity rotation. */
export const IDENTITY_QUAT: PhysicsQuat = [0, 0, 0, 1];

/** Collision shape of a body or a cast. Capsules stand along +Y; a trimesh or heightfield is static-only on every backend. */
export type BodyShape =
  | { kind: "box"; halfExtents: PhysicsVec3 }
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; radius: number; halfHeight: number }
  | { kind: "convex"; points: readonly PhysicsVec3[] }
  | { kind: "trimesh"; vertices: ArrayLike<number>; indices: ArrayLike<number> }
  | { kind: "heightfield"; rows: number; columns: number; heights: ArrayLike<number>; scale: PhysicsVec3 };

/** Shape discriminator, as listed in {@link PhysicsCapabilities.shapes}. */
export type BodyShapeKind = BodyShape["kind"];

/** `dynamic` integrates under forces, `kinematic` moves only through {@link PhysicsBackend.setKinematicTarget}, `static` never moves. */
export type BodyKind = "dynamic" | "kinematic" | "static";

/** Everything a backend needs to create a body. Rotation-free backends ignore `rotation` and `angularVelocity` and say so in {@link PhysicsCapabilities}. */
export interface BodyDesc {
  shape: BodyShape;
  /** Default `dynamic`. */
  kind?: BodyKind;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  velocity?: PhysicsVec3;
  angularVelocity?: PhysicsVec3;
  /** Default 1; ignored for kinematic and static bodies. */
  mass?: number;
  friction?: number;
  restitution?: number;
  /** Collision layer bitmask this body belongs to. Default `1`. */
  layers?: number;
  /** Collision layer bitmask this body collides with. Default all bits. */
  mask?: number;
  /** Continuous collision detection for fast small bodies (bullets, thrown props). */
  ccd?: boolean;
  asleep?: boolean;
  userData?: unknown;
}

/** Backend-issued body id; stable for the body's lifetime and across snapshot/restore. */
export type BodyHandle = number;
/** Backend-issued joint id. */
export type JointHandle = number;

/** A body's live pose and motion. Rotation-free backends report identity rotation and zero angular velocity. */
export interface BodyState {
  position: PhysicsVec3;
  rotation: PhysicsQuat;
  velocity: PhysicsVec3;
  angularVelocity: PhysicsVec3;
  sleeping: boolean;
}

/** Joint between two bodies, or between `bodyA` and a world anchor when `bodyB` is omitted. */
export interface JointDesc {
  kind: "fixed" | "hinge" | "ball" | "distance" | "spring";
  bodyA: BodyHandle;
  bodyB?: BodyHandle;
  /** Anchor in A's local frame. Default origin. */
  anchorA?: PhysicsVec3;
  /** Anchor in B's local frame, or the world point when B is omitted. Default origin. */
  anchorB?: PhysicsVec3;
  /** Hinge axis in world space. */
  axis?: PhysicsVec3;
  /** Hinge angle limits in radians. */
  limits?: readonly [min: number, max: number];
  restLength?: number;
  stiffness?: number;
  damping?: number;
}

/** A ray query. */
export interface RayDesc {
  origin: PhysicsVec3;
  /** Need not be normalized. */
  direction: PhysicsVec3;
  maxDistance: number;
  /** Only bodies whose `layers` intersect this mask are hit. Default all. */
  mask?: number;
  exclude?: BodyHandle;
}

/** Nearest surface a ray reached. */
export interface RayHit {
  body: BodyHandle;
  point: PhysicsVec3;
  normal: PhysicsVec3;
  distance: number;
}

/** Sweep `shape` from `position` along `motion` and report the first body it touches. */
export interface ShapeCastDesc {
  shape: BodyShape;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  motion: PhysicsVec3;
  mask?: number;
  exclude?: BodyHandle;
}

/** First contact of a shape sweep. */
export interface ShapeCastHit {
  body: BodyHandle;
  /** Fraction of `motion` travelled at first contact, 0..1. */
  toi: number;
  point: PhysicsVec3;
  normal: PhysicsVec3;
  distance: number;
}

/** Which bodies a shape placed at `position` intersects. */
export interface OverlapDesc {
  shape: BodyShape;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  mask?: number;
  exclude?: BodyHandle;
}

/** A contact reported during {@link PhysicsBackend.step}; the object is reused between calls, so copy what you keep. */
export interface ContactEvent {
  a: BodyHandle;
  b: BodyHandle;
  normal: PhysicsVec3;
  approachSpeed: number;
  impulse: number;
}

/** What a backend can actually simulate, so a game or the conformance suite can adapt instead of guessing. */
export interface PhysicsCapabilities {
  rotation: boolean;
  shapes: readonly BodyShapeKind[];
  ccd: boolean;
  joints: readonly JointDesc["kind"][];
}

/** Solver-wide knobs a backend accepts at creation and through `retune`. */
export interface PhysicsBackendConfig {
  gravity?: PhysicsVec3;
  /** Fixed substep length the backend integrates with; the caller's `step(dt)` is accumulated into it. */
  fixedDt?: number;
  maxSubsteps?: number;
}

/**
 * The seam every physics consumer talks to: the in-tree `PhysicsWorld` behind `createPhysicsWorldBackend`, or a
 * native solver such as Rapier behind its own adapter. Handles are backend-issued and survive snapshot/restore,
 * so gameplay state can store them.
 *
 * @capability physics-backend one interface over interchangeable rigid-body solvers — bodies, joints, raycast, shapecast, snapshot
 */
export interface PhysicsBackend {
  readonly name: string;
  readonly capabilities: PhysicsCapabilities;
  addBody(desc: BodyDesc): BodyHandle;
  removeBody(handle: BodyHandle): void;
  hasBody(handle: BodyHandle): boolean;
  /** Read a body's state into `out` (or a fresh object); `null` for an unknown handle. */
  body(handle: BodyHandle, out?: BodyState): BodyState | null;
  userDataOf(handle: BodyHandle): unknown;
  setPosition(handle: BodyHandle, position: PhysicsVec3): void;
  setRotation(handle: BodyHandle, rotation: PhysicsQuat): void;
  setVelocity(handle: BodyHandle, velocity: PhysicsVec3): void;
  setAngularVelocity(handle: BodyHandle, angularVelocity: PhysicsVec3): void;
  applyImpulse(handle: BodyHandle, impulse: PhysicsVec3, point?: PhysicsVec3): void;
  /** Move a kinematic body so the solver sees its velocity over the next step (platforms, doors, hands). */
  setKinematicTarget(handle: BodyHandle, position: PhysicsVec3, rotation?: PhysicsQuat): void;
  wake(handle: BodyHandle): void;
  addJoint(desc: JointDesc): JointHandle;
  removeJoint(handle: JointHandle): void;
  step(dt: number): void;
  raycast(desc: RayDesc): RayHit | null;
  shapecast(desc: ShapeCastDesc): ShapeCastHit | null;
  overlap(desc: OverlapDesc): BodyHandle[];
  onContact(listener: ((event: ContactEvent) => void) | null): void;
  retune(config: PhysicsBackendConfig): void;
  snapshot(): unknown;
  restore(state: unknown): void;
  dispose(): void;
}

/** Axis-aligned bounds of a shape at identity rotation, as half extents. */
export function shapeHalfExtents(shape: BodyShape): [number, number, number] {
  switch (shape.kind) {
    case "box":
      return [shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]];
    case "sphere":
      return [shape.radius, shape.radius, shape.radius];
    case "capsule":
      return [shape.radius, shape.halfHeight + shape.radius, shape.radius];
    case "convex": {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const p of shape.points) {
        x = Math.max(x, Math.abs(p[0]));
        y = Math.max(y, Math.abs(p[1]));
        z = Math.max(z, Math.abs(p[2]));
      }
      return [x, y, z];
    }
    case "trimesh": {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let i = 0; i + 2 < shape.vertices.length; i += 3) {
        x = Math.max(x, Math.abs(shape.vertices[i]!));
        y = Math.max(y, Math.abs(shape.vertices[i + 1]!));
        z = Math.max(z, Math.abs(shape.vertices[i + 2]!));
      }
      return [x, y, z];
    }
    case "heightfield": {
      let maxH = 0;
      for (let i = 0; i < shape.heights.length; i += 1) maxH = Math.max(maxH, Math.abs(shape.heights[i]!));
      return [
        (shape.scale[0] * (shape.columns - 1)) / 2,
        Math.max(maxH * shape.scale[1], 1e-3),
        (shape.scale[2] * (shape.rows - 1)) / 2,
      ];
    }
  }
}

/** True for an absent or identity rotation. */
export function isIdentityQuat(q: PhysicsQuat | undefined): boolean {
  return q === undefined || (q[0] === 0 && q[1] === 0 && q[2] === 0 && Math.abs(q[3] - 1) < 1e-9);
}
