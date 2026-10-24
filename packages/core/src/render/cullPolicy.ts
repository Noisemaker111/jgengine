import type { GraphicsQuality } from "../settings/settingsModel";

/**
 * How far one quality tier submits instanced world content. Resolved from the player's tier and
 * the game's graphics profile, so a render function never carries a distance of its own.
 */
export interface InstanceCullPolicy {
  /** Metres past which an instance is not submitted. `Infinity` submits everything. */
  readonly maxDistance: number;
  /** Metres nearer than which an instance is not submitted. */
  readonly minDistance: number;
  /** Metres of slack for an instance that was submitted last check, so the boundary does not flicker. */
  readonly hysteresis: number;
}

/** Per-game distance overrides; anything omitted keeps the tier's resolved value. */
export interface InstanceCullOverride {
  readonly maxDistance?: number;
  readonly minDistance?: number;
  readonly hysteresis?: number;
}

/** Construction input for {@link resolveInstanceCullPolicy}. */
export interface InstanceCullInput {
  readonly tier: GraphicsQuality;
  /** The tier's resolved `GraphicsProfile.drawDistance`. */
  readonly drawDistance: number;
  readonly override?: InstanceCullOverride;
}

/**
 * Resolve the instance cull distance for one tier. `ultra` submits everything unless the game
 * overrides it: the top tier is the visual reference other tiers are measured against, so it stays
 * unbounded and non-ultra tiers scale from the profile's draw distance. A game override always wins.
 */
export function resolveInstanceCullPolicy(input: InstanceCullInput): InstanceCullPolicy {
  const { tier, drawDistance, override } = input;
  const tierDistance = tier === "ultra" ? Number.POSITIVE_INFINITY : drawDistance;
  return {
    maxDistance: override?.maxDistance ?? tierDistance,
    minDistance: override?.minDistance ?? 0,
    hysteresis: override?.hysteresis ?? 0,
  };
}

/** One instance's world position and enclosing radius in the batch's local space, already in world units. */
export interface InstanceExtent {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

/** Camera position the policy is evaluated from; the renderer passes its live camera. */
export interface CullCamera {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Whether one instance falls outside the policy's band. Compares squared distances, subtracts the
 * instance radius from the far threshold so a large instance is not culled by its far side, and adds
 * the hysteresis band only for instances that were submitted last check.
 */
export function instanceOutsideCullBand(
  camera: CullCamera,
  instance: InstanceExtent,
  policy: InstanceCullPolicy,
  wasSubmitted = false,
): boolean {
  const dx = instance.x - camera.x;
  const dy = instance.y - camera.y;
  const dz = instance.z - camera.z;
  const distanceSq = dx * dx + dy * dy + dz * dz;
  if (policy.minDistance > 0) {
    const nearEdge = policy.minDistance + instance.radius;
    if (distanceSq < nearEdge * nearEdge) return true;
  }
  if (policy.maxDistance !== Number.POSITIVE_INFINITY) {
    const farEdge = policy.maxDistance + instance.radius + (wasSubmitted ? policy.hysteresis : 0);
    if (distanceSq > farEdge * farEdge) return true;
  }
  return false;
}

/**
 * Compact the submitted instances of one batch into `out` and return how many survived.
 * `positions` holds `stride` floats per instance and `wasSubmitted` marks instances the renderer drew
 * last frame; `out` receives surviving instance indices in source order.
 */
export function cullInstancesInto(
  camera: CullCamera,
  positions: ArrayLike<number>,
  stride: number,
  count: number,
  radius: (index: number) => number,
  policy: InstanceCullPolicy,
  out: number[],
  wasSubmitted?: (index: number) => boolean,
): number {
  let kept = 0;
  for (let index = 0; index < count; index += 1) {
    const base = index * stride;
    const extent: InstanceExtent = {
      x: positions[base]!,
      y: positions[base + 1]!,
      z: positions[base + 2]!,
      radius: radius(index),
    };
    if (instanceOutsideCullBand(camera, extent, policy, wasSubmitted?.(index) ?? false)) continue;
    out[kept++] = index;
  }
  out.length = kept;
  return kept;
}
