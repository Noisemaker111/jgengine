import type { ModelDims } from "./assetCatalog";
import { prepareCollisionMesh, type CollisionMeshData, type PreparedCollisionMesh } from "./collisionMesh";
import type { EntityPosition } from "./entityStore";

export type ColliderPurpose = "physical" | "damage";

/**
 * Collision geometry in entity-local space. `sphere` and `aabb` are analytic; `mesh` carries a
 * prepared triangle mesh so opted-in concave models raycast their real surface while bounds and
 * broadphase keep reading the conservative `halfExtents`.
 * @capability mesh-hitboxes shots pass through holes in concave models — opted-in catalog assets raycast their actual triangles instead of the fitted box.
 */
export type ColliderShape =
  | { kind: "sphere"; radius: number; offset?: EntityPosition }
  | { kind: "aabb"; halfExtents: EntityPosition; offset?: EntityPosition }
  | {
      kind: "mesh";
      /** Prepared triangle mesh in model space — engine-derived from an opted-in catalog asset, never hand-authored. */
      mesh: PreparedCollisionMesh;
      /** Uniform model→entity-local scale (same composition as the fitted box). */
      meshScale: number;
      /** Entity-local translation applied after `meshScale`. */
      meshTranslate: EntityPosition;
      /** Conservative entity-local AABB of the placed mesh — bounds/broadphase read this exactly like an `aabb`. */
      halfExtents: EntityPosition;
      offset?: EntityPosition;
    };

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

/** @internal */
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

/** Humanoid damage box uniformly scaled to match a visually scaled mesh, kept grounded (offset stays half its height). At scale 1 this equals `defaultEntityColliders()`.
 * @internal
 */
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

/** @internal */
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

/** Blocking physical body derived from an object's rendered scale: a grounded box spanning the visual (base at y=0, matching the shell's fallback mesh).
 * @internal
 */
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

/**
 * The render-config subset collider fitting reads — structurally satisfied by a resolved `ModelConfig`,
 * so the shell can hand its render config straight to the fitting math without a conversion step.
 */
export interface ModelBodySource {
  /** Measured model-space bounds from the asset index; fitting requires `dims` with `maxY`. */
  dims?: ModelDims;
  /** Uniform render scale. Default `1`. */
  scale?: number;
  /** Normalize-to-height in world units — fitting composes it exactly like the renderer (`targetHeight / measured height`, multiplied by `scale`). */
  targetHeight?: number;
  /** Vertical render offset added to the placement Y. Default `0`. */
  y?: number;
  /** Placement registration. `"center"` (default) centers the footprint and grounds `minY` on the placement point; `"origin"` renders at the raw model origin. */
  anchor?: "center" | "origin";
  /** Opt-in triangle collision mesh extracted at asset reindex; when present, fitting emits a mesh-accurate shape (rays pass through holes in concave models) instead of the fitted box. */
  collisionMesh?: CollisionMeshData;
}

interface FittedBox {
  halfExtents: EntityPosition;
  offset: EntityPosition;
  /** Composed model→entity-local scale (render scale × normalize) — the mesh shape's `meshScale`. */
  scale: number;
  /** Entity-local translation mapping model space onto the fitted placement — the mesh shape's `meshTranslate`. */
  meshTranslate: EntityPosition;
}

/**
 * The entity-local AABB the rendered model actually occupies, from measured dims + render config — the
 * same scale/normalize/anchor math the shell uses to place the mesh, so box equals visual by
 * construction. `null` when the model is unmeasured (`dims`/`maxY` absent) or degenerate.
 */
function fittedModelBox(model: ModelBodySource): FittedBox | null {
  const dims = model.dims;
  if (dims === undefined || dims.maxY === undefined) return null;
  const { w, d } = dims.footprint;
  const height = dims.maxY - dims.minY;
  if (!(w > 0) || !(d > 0) || !(height > 0)) return null;
  if (!Number.isFinite(w) || !Number.isFinite(d) || !Number.isFinite(height)) return null;
  const normalize = model.targetHeight !== undefined && model.targetHeight > 0 ? model.targetHeight / height : 1;
  const scale = (model.scale ?? 1) * normalize;
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const baseY = model.y ?? 0;
  // The renderer centers/grounds whenever it normalizes to targetHeight or anchors "center" (the
  // default); only a raw-origin model without targetHeight keeps its authored pivot.
  const centered = model.targetHeight !== undefined || (model.anchor ?? "center") === "center";
  const halfExtents: EntityPosition = [(w / 2) * scale, (height / 2) * scale, (d / 2) * scale];
  const offset: EntityPosition = centered
    ? [0, baseY + (height / 2) * scale, 0]
    : [dims.center.x * scale, baseY + (dims.minY + height / 2) * scale, dims.center.z * scale];
  // Maps the model point (center.x, minY, center.z) to the entity-local (0, baseY, 0) the box grounds
  // on when centered; a raw-origin model keeps its authored pivot and only takes the render offset.
  const meshTranslate: EntityPosition = centered
    ? [-dims.center.x * scale, baseY - dims.minY * scale, -dims.center.z * scale]
    : [0, baseY, 0];
  return { halfExtents, offset, scale, meshTranslate };
}

/** The fitted collider shape for a rendered model: a mesh-accurate triangle shape when the model
 * opts in with a decodable `collisionMesh`, otherwise the conservative fitted box. `null` when the
 * model is unmeasured or degenerate.
 */
function fittedBodyShape(model: ModelBodySource): ColliderShape | null {
  const box = fittedModelBox(model);
  if (box === null) return null;
  const mesh = model.collisionMesh !== undefined ? prepareCollisionMesh(model.collisionMesh) : null;
  if (mesh !== null) {
    return {
      kind: "mesh",
      mesh,
      meshScale: box.scale,
      meshTranslate: box.meshTranslate,
      halfExtents: box.halfExtents,
      offset: box.offset,
    };
  }
  return { kind: "aabb", halfExtents: box.halfExtents, offset: box.offset };
}

/** Damage hitbox fitted to the rendered model's measured bounds — the model-aware replacement for the
 * fixed humanoid default. `null` when the model is unmeasured, keeping the caller's existing fallback.
 * @internal
 */
export function fittedEntityColliders(model: ModelBodySource): EntityColliderSet | null {
  const shape = fittedBodyShape(model);
  if (shape === null) return null;
  return {
    hitboxes: [
      {
        name: "body",
        purpose: "damage",
        shape,
        damageEligible: true,
        blocks: false,
      },
    ],
  };
}

/** Blocking physical body fitted to the rendered model's measured bounds — the model-aware replacement
 * for the unit-cube-times-scale guess. `null` when the model is unmeasured.
 * @internal
 */
export function fittedObjectColliders(model: ModelBodySource): EntityColliderSet | null {
  const shape = fittedBodyShape(model);
  if (shape === null) return null;
  return {
    body: {
      name: "body",
      purpose: "physical",
      shape,
      damageEligible: false,
      blocks: true,
    },
  };
}

/** @internal */
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

/** @internal */
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

/** @internal */
export function colliderWorldCenter(
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): EntityPosition {
  return worldOffset(collider.shape.offset, position, rotationY);
}

/** @internal */
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
