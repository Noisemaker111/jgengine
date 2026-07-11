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

export function defaultEntityColliders(): EntityColliderSet {
  return {
    hitboxes: [
      {
        name: "body",
        purpose: "damage",
        shape: { kind: "sphere", radius: DEFAULT_ENTITY_HIT_RADIUS },
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
