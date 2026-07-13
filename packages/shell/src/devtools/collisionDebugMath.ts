import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import {
  colliderWorldCenter,
  defaultEntityColliders,
  defaultObjectColliders,
  resolveColliders,
  type ColliderPurpose,
  type EntityColliderSet,
  type ResolvedCollider,
} from "@jgengine/core/scene/colliders";
import {
  firstImpact,
  hitsUntilBlocked,
  type SceneRaycastApi,
  type SceneRaycastHit,
} from "@jgengine/core/scene/sceneRaycast";
import { convergeShot, resolveShot, type ShotOriginPolicy } from "@jgengine/core/combat/shotOrigin";
import type { Aim } from "@jgengine/core/scene/spatial";
import type { CollisionDebugLayers } from "./collisionDebug";
import { aimProbeNeeded, colliderScanNeeded } from "./collisionDebug";

export type AimEndpointKind = "damage" | "solid" | "miss";

export interface DebugShapeEntry {
  key: string;
  targetKind: "entity" | "object";
  instanceId: string;
  catalogId?: string;
  name: string;
  purpose: ColliderPurpose;
  damageEligible: boolean;
  blocks: boolean;
  position: EntityPosition;
  rotationY: number;
  shape:
    | { kind: "sphere"; radius: number; center: EntityPosition }
    | { kind: "aabb"; halfExtents: EntityPosition; center: EntityPosition };
  label: string;
  style: "hitbox" | "body";
}

export interface AimLaserDebug {
  origin: EntityPosition;
  direction: EntityPosition;
  end: EntityPosition;
  maxDistance: number;
  kind: AimEndpointKind;
  nearest: SceneRaycastHit | null;
  firstImpact: SceneRaycastHit | null;
  /** Counts scene raycast calls performed (0 when skipped). */
  queryCount: number;
}

export interface CollectDebugShapesInput {
  layers: CollisionDebugLayers;
  entities: readonly {
    id: string;
    position: EntityPosition;
    rotationY: number;
    name?: string;
  }[];
  objects?: readonly {
    instanceId: string;
    catalogId: string;
    position: EntityPosition;
    rotationY: number;
  }[];
  entityCollidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  objectCollidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  objectHalfExtentsOf?(catalogId: string): EntityPosition | null | undefined;
  /** Mutated when a scene scan runs — tests assert 0 when hidden. */
  counters?: { scans: number; shapes: number };
}

export function classifyAimEndpoint(
  hit: Pick<SceneRaycastHit, "damageEligible"> | null | undefined,
): AimEndpointKind {
  if (hit === null || hit === undefined) return "miss";
  return hit.damageEligible ? "damage" : "solid";
}

export function pointAlongRay(
  origin: EntityPosition,
  direction: EntityPosition,
  distance: number,
): EntityPosition {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
}

export function shapeWorldCenter(
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): EntityPosition {
  return colliderWorldCenter(collider, position, rotationY);
}

function styleFor(purpose: ColliderPurpose): "hitbox" | "body" {
  return purpose === "damage" ? "hitbox" : "body";
}

function labelFor(collider: ResolvedCollider): string {
  return `${collider.purpose}:${collider.name}`;
}

function pushResolved(
  out: DebugShapeEntry[],
  targetKind: "entity" | "object",
  instanceId: string,
  catalogId: string | undefined,
  position: EntityPosition,
  rotationY: number,
  set: EntityColliderSet,
  layers: CollisionDebugLayers,
): void {
  for (const collider of resolveColliders(set)) {
    const style = styleFor(collider.purpose);
    if (style === "hitbox" && !layers.hitboxes) continue;
    if (style === "body" && !layers.bodies) continue;
    const center = shapeWorldCenter(collider, position, rotationY);
    const shape =
      collider.shape.kind === "sphere"
        ? { kind: "sphere" as const, radius: collider.shape.radius, center }
        : {
            kind: "aabb" as const,
            halfExtents: collider.shape.halfExtents,
            center,
          };
    out.push({
      key: `${targetKind}:${instanceId}:${collider.purpose}:${collider.name}`,
      targetKind,
      instanceId,
      ...(catalogId !== undefined ? { catalogId } : {}),
      name: collider.name,
      purpose: collider.purpose,
      damageEligible: collider.damageEligible,
      blocks: collider.blocks,
      position,
      rotationY,
      shape,
      label: labelFor(collider),
      style,
    });
  }
}

/**
 * Collects world-space collider wireframe entries for enabled layers.
 * Returns [] and performs no entity/object iteration when both hitbox/body layers are off.
 */
export function collectDebugShapes(input: CollectDebugShapesInput): DebugShapeEntry[] {
  if (!colliderScanNeeded(input.layers)) return [];
  input.counters !== undefined && (input.counters.scans += 1);
  const out: DebugShapeEntry[] = [];
  for (const entity of input.entities) {
    const set = input.entityCollidersOf?.(entity.id) ?? defaultEntityColliders();
    pushResolved(out, "entity", entity.id, entity.name, entity.position, entity.rotationY, set, input.layers);
  }
  if (input.objects !== undefined) {
    for (const object of input.objects) {
      const half = input.objectHalfExtentsOf?.(object.catalogId) ?? undefined;
      const set =
        input.objectCollidersOf?.(object.instanceId) ??
        defaultObjectColliders(half === null || half === undefined ? undefined : half);
      pushResolved(
        out,
        "object",
        object.instanceId,
        object.catalogId,
        object.position,
        object.rotationY,
        set,
        input.layers,
      );
    }
  }
  if (input.counters !== undefined) input.counters.shapes += out.length;
  return out;
}

export interface ComputeAimLaserInput {
  layers: CollisionDebugLayers;
  sceneRaycast: SceneRaycastApi;
  positionOf(instanceId: string): EntityPosition | undefined;
  rotationYOf?(instanceId: string): number | undefined;
  collidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  from: string;
  aim: Aim;
  originPolicy?: ShotOriginPolicy;
  maxDistance: number;
  counters?: { queries: number };
}

/**
 * Builds the authoritative aim-laser segment using resolveShot + scene raycast
 * (same seam as projectile prediction/settlement). Zero queries when aimLaser is off.
 */
export function computeAimLaser(input: ComputeAimLaserInput): AimLaserDebug | null {
  if (!aimProbeNeeded(input.layers)) {
    return null;
  }
  const shotDeps = {
    positionOf: input.positionOf,
    rotationYOf: input.rotationYOf,
    collidersOf: input.collidersOf,
  };
  const policy = input.originPolicy ?? { kind: "converge" };
  const resolved =
    policy.kind === "converge"
      ? convergeShot(shotDeps, input.from, input.aim, input.maxDistance, (origin, direction) => {
          input.counters !== undefined && (input.counters.queries += 1);
          const sightHits = input.sceneRaycast.raycastAll({
            origin,
            direction,
            maxDistance: input.maxDistance,
            excludeInstanceIds: [input.from],
          });
          return hitsUntilBlocked(sightHits)[0]?.point ?? null;
        }, policy.muzzle)
      : resolveShot(shotDeps, input.from, input.aim, policy);
  if (resolved === null) return null;
  input.counters !== undefined && (input.counters.queries += 1);
  const all = input.sceneRaycast.raycastAll({
    origin: resolved.origin,
    direction: resolved.direction,
    maxDistance: input.maxDistance,
    excludeInstanceIds: [input.from],
  });
  const until = hitsUntilBlocked(all);
  const nearest = until[0] ?? null;
  const impact = firstImpact(until);
  const end =
    nearest !== null ? nearest.point : pointAlongRay(resolved.origin, resolved.direction, input.maxDistance);
  return {
    origin: resolved.origin,
    direction: resolved.direction,
    end,
    maxDistance: input.maxDistance,
    kind: classifyAimEndpoint(nearest),
    nearest,
    firstImpact: impact,
    queryCount: 1,
  };
}

export function muzzleMarkerFromOrigin(origin: EntityPosition): {
  center: EntityPosition;
  radius: number;
  color: string;
} {
  return { center: origin, radius: 0.08, color: "#ef4444" };
}

export const HITBOX_WIRE_COLOR = "#f472b6";
export const BODY_WIRE_COLOR = "#38bdf8";
export const PROJECTILE_PATH_COLOR = "#fde68a";
export const AIM_LASER_COLOR = "#a3e635";
export const AIM_DAMAGE_COLOR = "#f87171";
export const AIM_SOLID_COLOR = "#fbbf24";
export const AIM_MISS_COLOR = "#94a3b8";
