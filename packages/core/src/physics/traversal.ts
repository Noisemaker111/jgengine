import type { PhysicsWorld } from "./physicsWorld";

export interface GrappleConfig {
  /** Metres per second the rope shortens under `reel` / lengthens under `payOut`. Default 8. */
  reelSpeed?: number;
  /** Rope refuses to shorten past this — the traveller stops on top of the anchor, not inside it. Default 1.5. */
  minLength?: number;
  /** Firing range; `fire` beyond this misses. Default 40. */
  maxLength?: number;
  /** Elastic rope (spring) that yanks and bounces, vs a rigid `distance` cable that holds a hard length. Default false. */
  elastic?: boolean;
  /** Spring restoring rate when `elastic`. Default 40. */
  stiffness?: number;
  /** Spring damping when `elastic`. Default 6. */
  damping?: number;
}

/**
 * A fired-anchor rope on the joint API — grapple (reel toward a hit point), zipline (rigid cable to a
 * far anchor you then slide/reel along), swing (rigid rope + gravity = a pendulum). `fire` attaches a
 * `distance`/`spring` joint from the traveller body to a fixed world point; `reel` shrinks its rest
 * length so the constraint drags the body in; `moveAnchor` re-points it (zipline glide, grapple-to-
 * moving-target). The pick — a raycast to find the anchor — is the caller's; core owns the constraint.
 */
export class Grapple {
  readonly body: number;
  private readonly world: PhysicsWorld;
  private readonly reelSpeed: number;
  private readonly minLength: number;
  private readonly maxLength: number;
  private readonly elastic: boolean;
  private readonly stiffness: number;
  private readonly damping: number;
  private joint = -1;
  private length = 0;
  private ax = 0;
  private ay = 0;
  private az = 0;

  constructor(world: PhysicsWorld, body: number, config: GrappleConfig = {}) {
    this.world = world;
    this.body = body;
    this.reelSpeed = config.reelSpeed ?? 8;
    this.minLength = config.minLength ?? 1.5;
    this.maxLength = config.maxLength ?? 40;
    this.elastic = config.elastic ?? false;
    this.stiffness = config.stiffness ?? 40;
    this.damping = config.damping ?? 6;
  }

  get attached(): boolean {
    return this.joint >= 0;
  }

  get ropeLength(): number {
    return this.length;
  }

  anchor(): readonly [number, number, number] | null {
    return this.joint < 0 ? null : [this.ax, this.ay, this.az];
  }

  distanceToAnchor(): number {
    const w = this.world;
    const dx = this.ax - w.posX[this.body]!;
    const dy = this.ay - w.posY[this.body]!;
    const dz = this.az - w.posZ[this.body]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Attach to a world anchor point. Returns false (a miss) when the point is beyond `maxLength`. */
  fire(x: number, y: number, z: number): boolean {
    if (this.joint >= 0) this.release();
    const w = this.world;
    const dx = x - w.posX[this.body]!;
    const dy = y - w.posY[this.body]!;
    const dz = z - w.posZ[this.body]!;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > this.maxLength) return false;
    this.ax = x;
    this.ay = y;
    this.az = z;
    this.length = dist;
    const opts = {
      bodyA: this.body,
      anchorB: [x, y, z] as const,
      restLength: dist,
      stiffness: this.stiffness,
      damping: this.damping,
    };
    this.joint = this.elastic ? w.springJoint(opts) : w.distanceJoint(opts);
    w.wake(this.body);
    return true;
  }

  /** Shorten the rope by `reelSpeed * dt`, pulling the traveller toward the anchor. Clamps at `minLength`. */
  reel(dt: number): void {
    if (this.joint < 0) return;
    this.length = Math.max(this.minLength, this.length - this.reelSpeed * dt);
    this.world.setJointRest(this.joint, this.length);
    this.world.wake(this.body);
  }

  /** Pay out slack, lengthening the rope up to `maxLength`. */
  payOut(dt: number): void {
    if (this.joint < 0) return;
    this.length = Math.min(this.maxLength, this.length + this.reelSpeed * dt);
    this.world.setJointRest(this.joint, this.length);
    this.world.wake(this.body);
  }

  /** Re-point the anchor (slide a zipline attachment along the cable, or track a moving target). */
  moveAnchor(x: number, y: number, z: number): void {
    if (this.joint < 0) return;
    this.ax = x;
    this.ay = y;
    this.az = z;
    this.world.setJointAnchor(this.joint, x, y, z);
    this.world.wake(this.body);
  }

  release(): void {
    if (this.joint < 0) return;
    this.world.removeJoint(this.joint);
    this.joint = -1;
  }
}

export interface GlideConfig {
  /** Fraction of world gravity the glider still feels — 1 is normal fall, 0 hangs. Default 0.25. */
  gravityScale?: number;
  /** Forward acceleration applied along the steer vector each `apply`. Default 6. */
  thrust?: number;
  /** Terminal descent clamp so a glide never plummets. Default 8. */
  maxFallSpeed?: number;
}

/**
 * A reduced-gravity, forward-thrust glide over a physics body — wingsuit / glider / paraglider
 * (Enshrouded, Grounded). Call `apply(dt, steerX, steerZ)` each frame *before* `world.step`: it feeds
 * back most of the gravity the sim is about to apply (leaving `gravityScale` of it), pushes the body
 * along the steer vector by `thrust`, and clamps descent to `maxFallSpeed`. Stop calling it to fall
 * normally again — no attach/detach state to leak.
 */
export class Glide {
  readonly body: number;
  private readonly world: PhysicsWorld;
  private readonly gravityScale: number;
  private readonly thrust: number;
  private readonly maxFallSpeed: number;

  constructor(world: PhysicsWorld, body: number, config: GlideConfig = {}) {
    this.world = world;
    this.body = body;
    this.gravityScale = config.gravityScale ?? 0.25;
    this.thrust = config.thrust ?? 6;
    this.maxFallSpeed = config.maxFallSpeed ?? 8;
  }

  apply(dt: number, steerX = 0, steerZ = 0): void {
    const w = this.world;
    const b = this.body;
    const counter = -w.gravity * (1 - this.gravityScale);
    w.velY[b]! += counter * dt;
    w.velX[b]! += steerX * this.thrust * dt;
    w.velZ[b]! += steerZ * this.thrust * dt;
    if (w.velY[b]! < -this.maxFallSpeed) w.velY[b] = -this.maxFallSpeed;
    w.wake(b);
  }
}
