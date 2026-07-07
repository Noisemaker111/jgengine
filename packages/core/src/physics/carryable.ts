import type { PhysicsWorld } from "./physicsWorld";

export interface CarryableConfig {
  /** Spring stiffness pulling the held body toward the follow point. Default 60. */
  followStiffness?: number;
  /** Spring damping on the follow constraint. Default 12. */
  followDamping?: number;
  /** Clamp on the follow impulse so a heavy item lags instead of teleporting. Default 40. */
  maxForce?: number;
  /** Mass one owner hauls at full speed; heavier → encumbered / needs more owners. Default 8. */
  carryCapacity?: number;
}

/**
 * Movement multiplier (1 = unhindered, →0 = crushed) for a body of `mass` carried by `owners`.
 * Pure — the HUD/movement kit reads it to slow a laden hauler (Lethal Company) and to gate items
 * that need 2+ people (R.E.P.O.).
 */
export function carrySpeedMultiplier(mass: number, carryCapacity: number, owners: number): number {
  if (owners <= 0) return 0;
  if (mass <= 0) return 1;
  const scale = (carryCapacity * owners) / mass;
  return scale < 0 ? 0 : scale > 1 ? 1 : scale;
}

/**
 * A grabbed physics object following a moving hold point through a spring constraint (the pick —
 * a raycast — is the caller's/shell's job; core owns the constraint). Supports shared multi-owner
 * carry (the follow point is the average of owners' hold points), an encumbrance read, and
 * drop/throw. Reuses `PhysicsWorld.springJoint` to a world anchor moved each frame.
 */
export class Carryable {
  readonly body: number;
  private readonly world: PhysicsWorld;
  private readonly stiffness: number;
  private readonly damping: number;
  private readonly maxForce: number;
  private readonly capacity: number;
  private readonly holds = new Map<number, [number, number, number]>();
  private joint = -1;

  constructor(world: PhysicsWorld, body: number, config: CarryableConfig = {}) {
    this.world = world;
    this.body = body;
    this.stiffness = config.followStiffness ?? 60;
    this.damping = config.followDamping ?? 12;
    this.maxForce = config.maxForce ?? 40;
    this.capacity = config.carryCapacity ?? 8;
  }

  get held(): boolean {
    return this.holds.size > 0;
  }

  get owners(): number {
    return this.holds.size;
  }

  private mass(): number {
    const im = this.world.invMass[this.body]!;
    return im > 0 ? 1 / im : Number.POSITIVE_INFINITY;
  }

  speedMultiplier(): number {
    return carrySpeedMultiplier(this.mass(), this.capacity, this.holds.size);
  }

  /** Add an owner grabbing at a hold point; the first owner creates the follow constraint. */
  grab(ownerId: number, x: number, y: number, z: number): void {
    this.holds.set(ownerId, [x, y, z]);
    if (this.joint < 0) {
      this.joint = this.world.springJoint({
        bodyA: this.body,
        restLength: 0,
        stiffness: this.stiffness,
        damping: this.damping,
        maxImpulse: this.maxForce,
        anchorB: [x, y, z],
      });
    }
    this.world.wake(this.body);
  }

  setHoldPoint(ownerId: number, x: number, y: number, z: number): void {
    const h = this.holds.get(ownerId);
    if (h === undefined) return;
    h[0] = x;
    h[1] = y;
    h[2] = z;
  }

  release(ownerId: number): void {
    this.holds.delete(ownerId);
    if (this.holds.size === 0 && this.joint >= 0) {
      this.world.removeJoint(this.joint);
      this.joint = -1;
    }
  }

  /** Recompute the follow point (average of live hold points) and drive the constraint. */
  update(): void {
    if (this.joint < 0 || this.holds.size === 0) return;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    for (const h of this.holds.values()) {
      tx += h[0];
      ty += h[1];
      tz += h[2];
    }
    const inv = 1 / this.holds.size;
    this.world.setJointAnchor(this.joint, tx * inv, ty * inv, tz * inv);
    this.world.wake(this.body);
  }

  drop(): void {
    this.holds.clear();
    if (this.joint >= 0) {
      this.world.removeJoint(this.joint);
      this.joint = -1;
    }
  }

  throw(vx: number, vy: number, vz: number): void {
    this.drop();
    this.world.velX[this.body] = vx;
    this.world.velY[this.body] = vy;
    this.world.velZ[this.body] = vz;
    this.world.wake(this.body);
  }
}
