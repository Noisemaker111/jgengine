import type { PhysicsBounds, PhysicsWorld } from "./physicsWorld";

export type ForceMode = "impulse" | "velocity" | "accelerate";

/** World-space force position, axis or acceleration vector. */
export type ForceVector = readonly [number, number, number];
const DEFAULT_FORCE_DIRECTION: ForceVector = [0, 0, -1];

/** Renderer-free localized acceleration shared by physical actors and cosmetic particles. */
export interface ForceFieldConfig {
  center: ForceVector;
  shape: { kind: "sphere"; radius: number } | { kind: "box"; halfExtents: ForceVector };
  /** Positive attracts toward the center; negative repels. Units/s². */
  strength: number;
  /** Edge-to-center falloff exponent; zero is uniform. Default 1. */
  attenuation?: number;
  /** Blend radial attraction with `direction`, from 0 to 1. */
  directionality?: number;
  /** World-space direction; default [0, 0, -1]. */
  direction?: ForceVector;
  /** Signed tangential acceleration around a world-space axis. */
  vortex?: {
    axis: ForceVector;
    strength: number;
    /** Independent signed acceleration along the normalized axis, in units/s². */
    lift?: number;
  };
  /** Affected target bits; omission affects every target. */
  mask?: number;
  /** Cap the combined acceleration magnitude. */
  maxAcceleration?: number;
}

/** Validate force authoring once before sampling in a hot loop.
 * Coordinates stay within the safe integer range; acceleration magnitudes stay within 1e12 units/s².
 * @capability force-field-validation reject invalid localized force authoring before simulation
 */
export function validateForceField(config: ForceFieldConfig): void {
  const vector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(component => typeof component === "number" && Number.isFinite(component) && Math.abs(component) <= Number.MAX_SAFE_INTEGER);
  const finite = (value: unknown, min = -1e12, max = 1e12) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  if (config === null || typeof config !== "object" || !vector(config.center) || !finite(config.strength)) throw new RangeError("Force field requires safe finite coordinates and strength in -1e12..1e12");
  if (config.shape?.kind === "sphere") {
    if (!finite(config.shape.radius, Number.MIN_VALUE)) throw new RangeError("Force sphere radius must be finite and positive");
  } else if (config.shape?.kind === "box") {
    if (!vector(config.shape.halfExtents) || !config.shape.halfExtents.every(value => value > 0)) throw new RangeError("Force box extents must be finite and positive");
  } else throw new RangeError("Force field requires sphere or box shape");
  if (config.attenuation !== undefined && !finite(config.attenuation, 0)) throw new RangeError("Force attenuation must be finite and nonnegative");
  if (config.directionality !== undefined && !finite(config.directionality, 0, 1)) throw new RangeError("Force directionality must be in 0..1");
  if (config.direction !== undefined && (!vector(config.direction) || Math.hypot(...config.direction) === 0)) throw new RangeError("Force direction must be finite and nonzero");
  if (config.vortex !== undefined && (!vector(config.vortex.axis) || Math.hypot(...config.vortex.axis) === 0 || !finite(config.vortex.strength))) throw new RangeError("Force vortex requires a finite nonzero axis and finite strength");
  if (config.vortex?.lift !== undefined && !finite(config.vortex.lift)) throw new RangeError("Force vortex lift must be finite");
  if (config.mask !== undefined && (!finite(config.mask, 0, 0xffffffff) || !Number.isInteger(config.mask))) throw new RangeError("Force mask must be an unsigned 32-bit integer");
  if (config.maxAcceleration !== undefined && !finite(config.maxAcceleration, 0)) throw new RangeError("Force acceleration cap must be finite and nonnegative");
}

/** Sample localized acceleration; `out` permits allocation-free integration.
 * @capability localized-forces sample signed attraction, directional force, vortex spin and axial lift with target masks and caps
 */
export function sampleForceField(
  config: ForceFieldConfig,
  position: ForceVector,
  targetMask = 0xffffffff,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  out[0] = out[1] = out[2] = 0;
  if (((config.mask ?? 0xffffffff) & targetMask) === 0) return out;
  const x = position[0] - config.center[0];
  const y = position[1] - config.center[1];
  const z = position[2] - config.center[2];
  const distance = Math.hypot(x, y, z);
  const extent = config.shape.kind === "sphere"
    ? distance / config.shape.radius
    : Math.max(Math.abs(x) / config.shape.halfExtents[0], Math.abs(y) / config.shape.halfExtents[1], Math.abs(z) / config.shape.halfExtents[2]);
  if (!Number.isFinite(extent) || extent >= 1) return out;
  const envelope = Math.pow(1 - extent, Math.max(0, config.attenuation ?? 1));
  const directional = Math.max(0, Math.min(1, config.directionality ?? 0));
  const direction = config.direction ?? DEFAULT_FORCE_DIRECTION;
  const directionLength = Math.hypot(...direction);
  const radialScale = distance > 1e-9 ? -config.strength * (1 - directional) / distance : 0;
  const directionScale = directionLength > 1e-9 ? config.strength * directional / directionLength : 0;
  out[0] = x * radialScale + direction[0] * directionScale;
  out[1] = y * radialScale + direction[1] * directionScale;
  out[2] = z * radialScale + direction[2] * directionScale;
  if (config.vortex !== undefined) {
    const [ax, ay, az] = config.vortex.axis;
    const axisLength = Math.hypot(ax, ay, az);
    if (axisLength > 1e-9) {
      const liftScale = (config.vortex.lift ?? 0) / axisLength;
      out[0] += ax * liftScale;
      out[1] += ay * liftScale;
      out[2] += az * liftScale;
    }
    const tx = ay * z - az * y;
    const ty = az * x - ax * z;
    const tz = ax * y - ay * x;
    const tangentLength = Math.hypot(tx, ty, tz);
    if (tangentLength > 1e-9) {
      const scale = config.vortex.strength / tangentLength;
      out[0] += tx * scale;
      out[1] += ty * scale;
      out[2] += tz * scale;
    }
  }
  const magnitude = Math.hypot(...out) * envelope;
  const cap = Math.max(0, config.maxAcceleration ?? Number.POSITIVE_INFINITY);
  const scale = magnitude > cap ? envelope * cap / magnitude : envelope;
  out[0] = out[0] === 0 ? 0 : out[0] * scale;
  out[1] = out[1] === 0 ? 0 : out[1] * scale;
  out[2] = out[2] === 0 ? 0 : out[2] * scale;
  return out;
}

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
