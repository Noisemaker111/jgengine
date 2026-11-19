export type PhysicsVec3 = readonly [number, number, number];
export type PhysicsQuat = readonly [number, number, number, number];

/** A writable `[x, y, z]` a backend fills in place, so a reused result object allocates nothing. */
export type PhysicsVec3Out = [number, number, number];
export type PhysicsQuatOut = [number, number, number, number];

export const IDENTITY_QUAT: PhysicsQuat = [0, 0, 0, 1];

export type BodyShape =
  | { kind: "box"; halfExtents: PhysicsVec3 }
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; radius: number; halfHeight: number }
  | { kind: "convex"; points: readonly PhysicsVec3[] }
  | { kind: "trimesh"; vertices: ArrayLike<number>; indices: ArrayLike<number> }
  | { kind: "heightfield"; rows: number; columns: number; heights: ArrayLike<number>; scale: PhysicsVec3 };

export type BodyShapeKind = BodyShape["kind"];

/** `dynamic` integrates under forces, `kinematic` moves only through {@link PhysicsBackend.setKinematicTarget}, `static` never moves. */
export type BodyKind = "dynamic" | "kinematic" | "static";

export interface BodyDesc {
  shape: BodyShape;
  kind?: BodyKind;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  velocity?: PhysicsVec3;
  angularVelocity?: PhysicsVec3;
  mass?: number;
  friction?: number;
  restitution?: number;
  layers?: number;
  mask?: number;
  ccd?: boolean;
  /** Per-second linear velocity damping on this body (air drag, water); default `0`. */
  linearDamping?: number;
  /** Per-second angular velocity damping on this body; default `0`. Ignored by rotation-free backends. */
  angularDamping?: number;
  asleep?: boolean;
  userData?: unknown;
}

export type BodyHandle = number;
export type JointHandle = number;

export interface BodyState {
  position: PhysicsVec3Out;
  rotation: PhysicsQuatOut;
  velocity: PhysicsVec3Out;
  angularVelocity: PhysicsVec3Out;
  sleeping: boolean;
}

export interface JointDesc {
  kind: "fixed" | "hinge" | "ball" | "distance" | "spring";
  bodyA: BodyHandle;
  bodyB?: BodyHandle;
  anchorA?: PhysicsVec3;
  anchorB?: PhysicsVec3;
  axis?: PhysicsVec3;
  /** Hinge angle limits in radians. */
  limits?: readonly [min: number, max: number];
  restLength?: number;
  stiffness?: number;
  damping?: number;
}

export interface RayDesc {
  origin: PhysicsVec3;
  /** Need not be normalized. */
  direction: PhysicsVec3;
  maxDistance: number;
  mask?: number;
  exclude?: BodyHandle;
}

export interface RayHit {
  body: BodyHandle;
  point: PhysicsVec3Out;
  normal: PhysicsVec3Out;
  distance: number;
}

export interface ShapeCastDesc {
  shape: BodyShape;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  motion: PhysicsVec3;
  mask?: number | undefined;
  exclude?: BodyHandle;
}

export interface ShapeCastHit {
  body: BodyHandle;
  /** Fraction of `motion` travelled at first contact, 0..1. */
  toi: number;
  point: PhysicsVec3Out;
  normal: PhysicsVec3Out;
  distance: number;
}

export interface OverlapDesc {
  shape: BodyShape;
  position: PhysicsVec3;
  rotation?: PhysicsQuat;
  mask?: number | undefined;
  exclude?: BodyHandle;
}

export interface ContactEvent {
  a: BodyHandle;
  b: BodyHandle;
  normal: PhysicsVec3Out;
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

export interface PhysicsBackendConfig {
  gravity?: PhysicsVec3;
  fixedDt?: number;
  maxSubsteps?: number;
}

export interface CharacterMotionDesc {
  shape: BodyShape;
  skinWidth: number;
  /** Steepest walkable slope in degrees. */
  maxSlopeDeg: number;
  stepHeight: number;
  snapDistance: number;
  mask?: number;
}

export interface CharacterMotionResult {
  moved: PhysicsVec3Out;
  grounded: boolean;
  groundNormal: PhysicsVec3Out;
  groundBody: BodyHandle | null;
  hitWall: boolean;
  hitCeiling: boolean;
}

export interface CharacterMotion {
  move(center: PhysicsVec3, desired: PhysicsVec3, out: CharacterMotionResult, exclude?: BodyHandle): CharacterMotionResult;
  retune(desc: Partial<CharacterMotionDesc>): void;
  dispose(): void;
}

export interface RayCastWheelDesc {
  connection: PhysicsVec3;
  radius: number;
  restLength: number;
  direction?: PhysicsVec3;
  axle?: PhysicsVec3;
  maxTravel?: number;
  stiffness?: number;
  compression?: number;
  relaxation?: number;
  maxForce?: number;
  frictionSlip?: number;
  sideFrictionStiffness?: number;
}

export interface RayCastVehicleDesc {
  chassis: BodyHandle;
  wheels: readonly RayCastWheelDesc[];
  mask?: number;
}

export interface RayCastWheelState {
  inContact: boolean;
  suspensionLength: number;
  suspensionForce: number;
  contactPoint: PhysicsVec3Out;
  contactNormal: PhysicsVec3Out;
  ground: BodyHandle | null;
  rotation: number;
}

export interface RayCastVehicle {
  readonly wheelCount: number;
  setWheelInput(index: number, engineForce: number, brake: number, steering: number): void;
  retuneWheel(index: number, desc: Partial<RayCastWheelDesc>): void;
  update(dt: number): void;
  wheel(index: number, out: RayCastWheelState): RayCastWheelState;
  /** Chassis speed along its forward axis, m/s. */
  speed(): number;
  dispose(): void;
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
  body(handle: BodyHandle, out?: BodyState): BodyState | null;
  userDataOf(handle: BodyHandle): unknown;
  setPosition(handle: BodyHandle, position: PhysicsVec3): void;
  setRotation(handle: BodyHandle, rotation: PhysicsQuat): void;
  setVelocity(handle: BodyHandle, velocity: PhysicsVec3): void;
  setAngularVelocity(handle: BodyHandle, angularVelocity: PhysicsVec3): void;
  applyImpulse(handle: BodyHandle, impulse: PhysicsVec3, point?: PhysicsVec3): void;
  /**
   * Apply a world-space force, N, over the next {@link step} only (thrust, wind, buoyancy, a tow rope). Call it
   * every tick the force should act. A `point` off the centre of mass also applies torque on rotation backends.
   * Pending forces are not part of a snapshot.
   */
  applyForce(handle: BodyHandle, force: PhysicsVec3, point?: PhysicsVec3): void;
  /** Apply a world-space torque, N·m, over the next {@link step} only; a no-op on rotation-free backends. */
  applyTorque(handle: BodyHandle, torque: PhysicsVec3): void;
  /** Move a kinematic body so the solver sees its velocity over the next step (platforms, doors, hands). */
  setKinematicTarget(handle: BodyHandle, position: PhysicsVec3, rotation?: PhysicsQuat): void;
  wake(handle: BodyHandle): void;
  addJoint(desc: JointDesc): JointHandle;
  removeJoint(handle: JointHandle): void;
  step(dt: number): void;
  raycast(desc: RayDesc, out?: RayHit): RayHit | null;
  shapecast(desc: ShapeCastDesc, out?: ShapeCastHit): ShapeCastHit | null;
  overlap(desc: OverlapDesc, out?: BodyHandle[]): BodyHandle[];
  onContact(listener: ((event: ContactEvent) => void) | null): void;
  retune(config: PhysicsBackendConfig): void;
  snapshot(): unknown;
  restore(state: unknown): void;
  dispose(): void;
  createCharacterMotion?(desc: CharacterMotionDesc): CharacterMotion;
  createRayCastVehicle?(desc: RayCastVehicleDesc): RayCastVehicle;
}

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

export function isIdentityQuat(q: PhysicsQuat | undefined): boolean {
  return q === undefined || (q[0] === 0 && q[1] === 0 && q[2] === 0 && Math.abs(q[3] - 1) < 1e-9);
}
