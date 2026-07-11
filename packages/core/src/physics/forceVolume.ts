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
    const high = world.highWater;
    for (let i = 0; i < high; i += 1) {
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

/** One tick's force math for a body outside `PhysicsWorld` — apply the returned velocity in any custom integrator. */
export function applyVolumeForce(
  velocity: readonly [number, number, number],
  force: readonly [number, number, number],
  mode: ForceMode,
  dt: number,
): readonly [number, number, number] {
  if (mode === "velocity") return force;
  if (mode === "accelerate") {
    return [velocity[0] + force[0] * dt, velocity[1] + force[1] * dt, velocity[2] + force[2] * dt];
  }
  return [velocity[0] + force[0], velocity[1] + force[1], velocity[2] + force[2]];
}

export interface VolumeTriggerConfig {
  bounds: PhysicsBounds;
}

export interface VolumeTriggerStep<TId> {
  /** Ids inside this tick that were outside last tick — the boost-pad edge. */
  entered: readonly TId[];
  /** Every id inside this tick. */
  inside: readonly TId[];
  /** Ids inside last tick that left. */
  exited: readonly TId[];
}

/**
 * The enter-once membership tracking from `ForceVolume`, freed from `PhysicsWorld`'s body indices
 * (#286.8): feed any integrator's `{ id, position }` list each tick and act on the edges — apply
 * `applyVolumeForce` on `entered` for a boost pad, on `inside` for a fan.
 */
export interface VolumeTrigger<TId> {
  readonly bounds: PhysicsBounds;
  step(bodies: Iterable<{ id: TId; position: readonly [number, number, number] }>): VolumeTriggerStep<TId>;
  reset(): void;
}

export function createVolumeTrigger<TId = string>(config: VolumeTriggerConfig): VolumeTrigger<TId> {
  let members = new Set<TId>();

  return {
    bounds: config.bounds,
    step(bodies) {
      const entered: TId[] = [];
      const insideNow: TId[] = [];
      const next = new Set<TId>();
      for (const body of bodies) {
        if (!inside(config.bounds, body.position[0], body.position[1], body.position[2])) continue;
        next.add(body.id);
        insideNow.push(body.id);
        if (!members.has(body.id)) entered.push(body.id);
      }
      const exited: TId[] = [];
      for (const id of members) {
        if (!next.has(id)) exited.push(id);
      }
      members = next;
      return { entered, inside: insideNow, exited };
    },
    reset() {
      members = new Set();
    },
  };
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
    const high = w.highWater;
    for (let i = 0; i < high; i += 1) {
      if (i === p || !w.isAlive(i)) continue;
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
