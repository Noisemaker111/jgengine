import type { PhysicsBounds, PhysicsWorld } from "./physicsWorld";

export type ForceMode = "impulse" | "velocity" | "accelerate";

export interface ForceVolumeConfig {
  /** Region a body's center must be inside to be affected. */
  bounds: PhysicsBounds;
  /** `impulse` adds to velocity, `velocity` sets it, `accelerate` adds force·dt each tick. */
  force: readonly [number, number, number];
  /** Default `impulse`. */
  mode?: ForceMode;
  /** Fire only when a body first enters (boost pad) rather than every tick inside (fan/wind). Default false. */
  once?: boolean;
}

function inside(bounds: PhysicsBounds, x: number, y: number, z: number): boolean {
  return (
    x >= bounds.min[0] &&
    x <= bounds.max[0] &&
    y >= bounds.min[1] &&
    y <= bounds.max[1] &&
    z >= bounds.min[2] &&
    z <= bounds.max[2]
  );
}

/**
 * A trigger region that pushes bodies passing through it — boost pads (`impulse` + `once`),
 * conveyors (`velocity`), fans/wind (`accelerate`). Call `apply` each tick; `once` mode fires only
 * on entry by tracking membership between ticks.
 */
export class ForceVolume {
  readonly bounds: PhysicsBounds;
  readonly mode: ForceMode;
  readonly once: boolean;
  private readonly fx: number;
  private readonly fy: number;
  private readonly fz: number;
  private members = new Set<number>();
  private nextMembers = new Set<number>();

  constructor(config: ForceVolumeConfig) {
    this.bounds = config.bounds;
    this.mode = config.mode ?? "impulse";
    this.once = config.once ?? false;
    this.fx = config.force[0];
    this.fy = config.force[1];
    this.fz = config.force[2];
  }

  apply(world: PhysicsWorld, dt: number): void {
    const next = this.nextMembers;
    next.clear();
    const count = world.count;
    for (let i = 0; i < count; i += 1) {
      if (world.invMass[i] === 0) continue;
      if (!inside(this.bounds, world.posX[i]!, world.posY[i]!, world.posZ[i]!)) continue;
      const wasInside = this.members.has(i);
      next.add(i);
      if (this.once && wasInside) continue;
      switch (this.mode) {
        case "velocity":
          world.velX[i] = this.fx;
          world.velY[i] = this.fy;
          world.velZ[i] = this.fz;
          break;
        case "accelerate":
          world.velX[i]! += this.fx * dt;
          world.velY[i]! += this.fy * dt;
          world.velZ[i]! += this.fz * dt;
          break;
        default:
          world.velX[i]! += this.fx;
          world.velY[i]! += this.fy;
          world.velZ[i]! += this.fz;
      }
      world.wake(i);
    }
    this.nextMembers = this.members;
    this.members = next;
  }
}

export interface PlatformCarryConfig {
  /** Vertical gap between a rider's base and the platform top counted as "standing on". Default 0.12. */
  contactTolerance?: number;
}

/**
 * Carries bodies standing on a moving platform by composing their transform with the platform's
 * per-`step` delta — moving/rotating lifts and conveyor floors (Fall Guys, Gang Beasts). The
 * platform is a body the game repositions each frame; riders are detected by overlap on its top face.
 */
export class PlatformCarry {
  private readonly world: PhysicsWorld;
  private readonly platform: number;
  private readonly tolerance: number;
  private prevX: number;
  private prevY: number;
  private prevZ: number;

  constructor(world: PhysicsWorld, platform: number, config: PlatformCarryConfig = {}) {
    this.world = world;
    this.platform = platform;
    this.tolerance = config.contactTolerance ?? 0.12;
    this.prevX = world.posX[platform]!;
    this.prevY = world.posY[platform]!;
    this.prevZ = world.posZ[platform]!;
  }

  step(): void {
    const w = this.world;
    const p = this.platform;
    const dx = w.posX[p]! - this.prevX;
    const dy = w.posY[p]! - this.prevY;
    const dz = w.posZ[p]! - this.prevZ;
    const topY = this.prevY + w.halfY[p]!;
    const px = this.prevX;
    const pz = this.prevZ;
    this.prevX = w.posX[p]!;
    this.prevY = w.posY[p]!;
    this.prevZ = w.posZ[p]!;
    if (dx === 0 && dy === 0 && dz === 0) return;
    const hx = w.halfX[p]!;
    const hz = w.halfZ[p]!;
    const count = w.count;
    for (let i = 0; i < count; i += 1) {
      if (i === p) continue;
      const base = w.posY[i]! - w.halfY[i]!;
      if (base < topY - this.tolerance || base > topY + this.tolerance) continue;
      if (Math.abs(w.posX[i]! - px) > hx + w.halfX[i]!) continue;
      if (Math.abs(w.posZ[i]! - pz) > hz + w.halfZ[i]!) continue;
      w.posX[i]! += dx;
      w.posY[i]! += dy;
      w.posZ[i]! += dz;
      w.wake(i);
    }
  }
}
