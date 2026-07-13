import type { EntityPosition } from "./entityStore";

export type ColliderPurpose = "physical" | "damage";

export type ColliderShape =
  | { kind: "sphere"; radius: number; offset?: EntityPosition }
  | { kind: "aabb"; halfExtents: EntityPosition; offset?: EntityPosition };

export interface ColliderDef {
  name: string;
  purpose: ColliderPurpose;
  shape: ColliderShape;
  /** Defaults true for `purpose: "damage"`, false for `purpose: "physical"`. */
  damageEligible?: boolean;
  /** Defaults true — a blocking collider stops a ray at first impact. */
  blocks?: boolean;
}

export interface EntityColliderSet {
  /** Single physical collision body (push / obstruction). */
  body?: ColliderDef;
  /** Named damage hitboxes (zero or more). */
  hitboxes?: readonly ColliderDef[];
}

export interface ResolvedCollider {
  name: string;
  purpose: ColliderPurpose;
  shape: ColliderShape;
  damageEligible: boolean;
  blocks: boolean;
}

export const DEFAULT_ENTITY_HIT_RADIUS = 0.5;
export const DEFAULT_OBJECT_HALF_EXTENTS: EntityPosition = [0.5, 0.5, 0.5];
/** Matches the shell's fallback actor capsule (~0.7m wide, feet at y=0 to head at ~1.8m). */
export const DEFAULT_ENTITY_BODY_HALF_EXTENTS: EntityPosition = [0.35, 0.9, 0.35];
/** Entity-local center of the default body hitbox (half its height above the feet). */
export const DEFAULT_ENTITY_BODY_OFFSET: EntityPosition = [0, 0.9, 0];

export function defaultEntityColliders(): EntityColliderSet {
  return {
    hitboxes: [
      {
        name: "body",
        purpose: "damage",
        shape: {
          kind: "aabb",
          halfExtents: DEFAULT_ENTITY_BODY_HALF_EXTENTS,
          offset: DEFAULT_ENTITY_BODY_OFFSET,
        },
        damageEligible: true,
        blocks: false,
      },
    ],
  };
}

/** Humanoid damage box uniformly scaled to match a visually scaled mesh, kept grounded (offset stays half its height). At scale 1 this equals `defaultEntityColliders()`. */
export function scaledEntityColliders(scale: number): EntityColliderSet {
  return {
    hitboxes: [
      {
        name: "body",
        purpose: "damage",
        shape: {
          kind: "aabb",
          halfExtents: [
            DEFAULT_ENTITY_BODY_HALF_EXTENTS[0] * scale,
            DEFAULT_ENTITY_BODY_HALF_EXTENTS[1] * scale,
            DEFAULT_ENTITY_BODY_HALF_EXTENTS[2] * scale,
          ],
          offset: [
            DEFAULT_ENTITY_BODY_OFFSET[0] * scale,
            DEFAULT_ENTITY_BODY_OFFSET[1] * scale,
            DEFAULT_ENTITY_BODY_OFFSET[2] * scale,
          ],
        },
        damageEligible: true,
        blocks: false,
      },
    ],
  };
}

export function defaultObjectColliders(halfExtents: EntityPosition = DEFAULT_OBJECT_HALF_EXTENTS): EntityColliderSet {
  return {
    body: {
      name: "body",
      purpose: "physical",
      shape: { kind: "aabb", halfExtents },
      damageEligible: false,
      blocks: true,
    },
  };
}

/** Blocking physical body derived from an object's rendered scale: a grounded box spanning the visual (base at y=0, matching the shell's fallback mesh). */
export function scaledObjectColliders(scale: readonly [number, number, number]): EntityColliderSet {
  return {
    body: {
      name: "body",
      purpose: "physical",
      shape: {
        kind: "aabb",
        halfExtents: [scale[0] / 2, scale[1] / 2, scale[2] / 2],
        offset: [0, scale[1] / 2, 0],
      },
      damageEligible: false,
      blocks: true,
    },
  };
}

export function resolveColliders(set: EntityColliderSet | null | undefined): ResolvedCollider[] {
  if (set === null || set === undefined) return [];
  const out: ResolvedCollider[] = [];
  if (set.body !== undefined) out.push(resolveOne(set.body));
  if (set.hitboxes !== undefined) {
    for (const hitbox of set.hitboxes) out.push(resolveOne(hitbox));
  }
  return out;
}

function resolveOne(def: ColliderDef): ResolvedCollider {
  const damageEligible = def.damageEligible ?? def.purpose === "damage";
  const blocks = def.blocks ?? def.purpose === "physical";
  return {
    name: def.name,
    purpose: def.purpose,
    shape: def.shape,
    damageEligible,
    blocks,
  };
}

export function worldOffset(
  local: EntityPosition | undefined,
  position: EntityPosition,
  rotationY: number,
): EntityPosition {
  if (local === undefined) return position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const lx = local[0];
  const ly = local[1];
  const lz = local[2];
  return [position[0] + lx * cos + lz * sin, position[1] + ly, position[2] - lx * sin + lz * cos];
}

export function colliderWorldCenter(
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): EntityPosition {
  return worldOffset(collider.shape.offset, position, rotationY);
}

export function colliderBounds(
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): { min: EntityPosition; max: EntityPosition } {
  const center = colliderWorldCenter(collider, position, rotationY);
  if (collider.shape.kind === "sphere") {
    const r = collider.shape.radius;
    return {
      min: [center[0] - r, center[1] - r, center[2] - r],
      max: [center[0] + r, center[1] + r, center[2] + r],
    };
  }
  const h = collider.shape.halfExtents;
  return {
    min: [center[0] - h[0], center[1] - h[1], center[2] - h[2]],
    max: [center[0] + h[0], center[1] + h[1], center[2] + h[2]],
  };
}
