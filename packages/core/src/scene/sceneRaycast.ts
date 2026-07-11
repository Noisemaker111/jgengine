import type { EntityPosition } from "./entityStore";
import {
  colliderBounds,
  colliderWorldCenter,
  defaultEntityColliders,
  defaultObjectColliders,
  resolveColliders,
  type ColliderPurpose,
  type EntityColliderSet,
  type ResolvedCollider,
} from "./colliders";
import { intersectAabb, normalizeDirection } from "./objectQuery";
import type { SceneObject } from "./objectStore";

export type SceneRaycastTargetKind = "entity" | "object" | "terrain" | "wall";

export interface SceneRaycastHit {
  targetKind: SceneRaycastTargetKind;
  instanceId: string;
  catalogId?: string;
  colliderName: string;
  purpose: ColliderPurpose;
  damageEligible: boolean;
  blocks: boolean;
  distance: number;
  point: EntityPosition;
  normal: EntityPosition;
}

export interface SceneRaycastFilter {
  entities?: boolean;
  objects?: boolean;
  terrain?: boolean;
  walls?: boolean;
}

export interface SceneRaycastInput {
  origin: EntityPosition;
  direction: EntityPosition;
  maxDistance: number;
  excludeInstanceIds?: ReadonlySet<string> | readonly string[];
  filter?: SceneRaycastFilter;
  /** When set, only hits satisfying the predicate are kept (applied after geometry). */
  accept?: (hit: SceneRaycastHit) => boolean;
}

export interface SceneEntityQuerySource {
  list(): readonly { id: string; position: EntityPosition; rotationY: number; name?: string }[];
  collidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  inRadius?(center: EntityPosition, radius: number): readonly string[];
  get?(instanceId: string): { id: string; position: EntityPosition; rotationY: number; name?: string } | null;
}

export interface SceneObjectQuerySource {
  list(): readonly SceneObject[];
  inBox?(min: EntityPosition, max: EntityPosition): readonly SceneObject[];
  collidersOf?(instanceId: string): EntityColliderSet | null | undefined;
  halfExtentsOf?(catalogId: string): EntityPosition | null | undefined;
}

export interface TerrainRaycastSource {
  sampleHeight(x: number, z: number): number;
}

export interface WallSegment {
  id: string;
  /** Segment endpoints on the XZ plane; extruded by halfHeight along Y around yCenter. */
  a: readonly [number, number];
  b: readonly [number, number];
  yCenter?: number;
  halfHeight?: number;
  thickness?: number;
}

export interface SceneRaycastDeps {
  entities?: SceneEntityQuerySource;
  objects?: SceneObjectQuerySource;
  terrain?: TerrainRaycastSource;
  walls?: readonly WallSegment[];
}

export interface SceneRaycastApi {
  raycast(input: SceneRaycastInput): SceneRaycastHit | null;
  raycastAll(input: SceneRaycastInput): SceneRaycastHit[];
}

function excluded(exclude: SceneRaycastInput["excludeInstanceIds"], id: string): boolean {
  if (exclude === undefined) return false;
  if (typeof (exclude as ReadonlySet<string>).has === "function") {
    return (exclude as ReadonlySet<string>).has(id);
  }
  for (const value of exclude as readonly string[]) {
    if (value === id) return true;
  }
  return false;
}

function enabled(filter: SceneRaycastFilter | undefined, key: keyof SceneRaycastFilter): boolean {
  if (filter === undefined) return true;
  return filter[key] !== false;
}

function rayHitsSphere(
  origin: EntityPosition,
  direction: EntityPosition,
  center: EntityPosition,
  radius: number,
  maxDistance: number,
): { distance: number; normal: EntityPosition } | null {
  const ox = origin[0] - center[0];
  const oy = origin[1] - center[1];
  const oz = origin[2] - center[2];
  const b = ox * direction[0] + oy * direction[1] + oz * direction[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  let t = -b - sqrt;
  if (t < 0) t = -b + sqrt;
  if (t < 0 || t > maxDistance) return null;
  const px = origin[0] + direction[0] * t - center[0];
  const py = origin[1] + direction[1] * t - center[1];
  const pz = origin[2] + direction[2] * t - center[2];
  const len = Math.hypot(px, py, pz) || 1;
  return { distance: t, normal: [px / len, py / len, pz / len] };
}

function rayHitsCollider(
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
  collider: ResolvedCollider,
  position: EntityPosition,
  rotationY: number,
): { distance: number; normal: EntityPosition; point: EntityPosition } | null {
  if (collider.shape.kind === "sphere") {
    const center = colliderWorldCenter(collider, position, rotationY);
    const hit = rayHitsSphere(origin, direction, center, collider.shape.radius, maxDistance);
    if (hit === null) return null;
    return {
      distance: hit.distance,
      normal: hit.normal,
      point: [
        origin[0] + direction[0] * hit.distance,
        origin[1] + direction[1] * hit.distance,
        origin[2] + direction[2] * hit.distance,
      ],
    };
  }
  const bounds = colliderBounds(collider, position, rotationY);
  const hit = intersectAabb(origin, direction, bounds.min, bounds.max, maxDistance);
  if (hit === null) return null;
  return {
    distance: hit.distance,
    normal: hit.normal,
    point: [
      origin[0] + direction[0] * hit.distance,
      origin[1] + direction[1] * hit.distance,
      origin[2] + direction[2] * hit.distance,
    ],
  };
}

function pushColliderHits(
  hits: SceneRaycastHit[],
  targetKind: SceneRaycastTargetKind,
  instanceId: string,
  catalogId: string | undefined,
  colliders: readonly ResolvedCollider[],
  position: EntityPosition,
  rotationY: number,
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
): void {
  for (const collider of colliders) {
    const hit = rayHitsCollider(origin, direction, maxDistance, collider, position, rotationY);
    if (hit === null) continue;
    hits.push({
      targetKind,
      instanceId,
      ...(catalogId !== undefined ? { catalogId } : {}),
      colliderName: collider.name,
      purpose: collider.purpose,
      damageEligible: collider.damageEligible,
      blocks: collider.blocks,
      distance: hit.distance,
      point: hit.point,
      normal: hit.normal,
    });
  }
}

function wallAabb(wall: WallSegment): { min: EntityPosition; max: EntityPosition; center: EntityPosition } {
  const thickness = wall.thickness ?? 0.25;
  const halfHeight = wall.halfHeight ?? 1.5;
  const yCenter = wall.yCenter ?? halfHeight;
  const ax = wall.a[0];
  const az = wall.a[1];
  const bx = wall.b[0];
  const bz = wall.b[1];
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * thickness;
  const nz = (dx / len) * thickness;
  const xs = [ax + nx, ax - nx, bx + nx, bx - nx];
  const zs = [az + nz, az - nz, bz + nz, bz - nz];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    min: [minX, yCenter - halfHeight, minZ],
    max: [maxX, yCenter + halfHeight, maxZ],
    center: [(ax + bx) / 2, yCenter, (az + bz) / 2],
  };
}

function rayHitsTerrain(
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
  terrain: TerrainRaycastSource,
): SceneRaycastHit | null {
  const steps = Math.max(8, Math.ceil(maxDistance * 2));
  const step = maxDistance / steps;
  let prevAbove: boolean | null = null;
  let prevT = 0;
  for (let i = 0; i <= steps; i += 1) {
    const t = Math.min(maxDistance, i * step);
    const x = origin[0] + direction[0] * t;
    const y = origin[1] + direction[1] * t;
    const z = origin[2] + direction[2] * t;
    const ground = terrain.sampleHeight(x, z);
    const above = y >= ground;
    if (prevAbove === true && !above) {
      let lo = prevT;
      let hi = t;
      for (let refine = 0; refine < 8; refine += 1) {
        const mid = (lo + hi) / 2;
        const my = origin[1] + direction[1] * mid;
        const mg = terrain.sampleHeight(origin[0] + direction[0] * mid, origin[2] + direction[2] * mid);
        if (my >= mg) lo = mid;
        else hi = mid;
      }
      const distance = hi;
      const px = origin[0] + direction[0] * distance;
      const py = origin[1] + direction[1] * distance;
      const pz = origin[2] + direction[2] * distance;
      return {
        targetKind: "terrain",
        instanceId: "terrain",
        colliderName: "ground",
        purpose: "physical",
        damageEligible: false,
        blocks: true,
        distance,
        point: [px, py, pz],
        normal: [0, 1, 0],
      };
    }
    prevAbove = above;
    prevT = t;
  }
  return null;
}

function candidateEntityIds(
  entities: SceneEntityQuerySource,
  origin: EntityPosition,
  maxDistance: number,
): readonly { id: string; position: EntityPosition; rotationY: number; name?: string }[] {
  if (entities.inRadius !== undefined && entities.get !== undefined) {
    const ids = entities.inRadius(origin, maxDistance + 2);
    const out: { id: string; position: EntityPosition; rotationY: number; name?: string }[] = [];
    for (const id of ids) {
      const entity = entities.get(id);
      if (entity !== null && entity !== undefined) out.push(entity);
    }
    return out;
  }
  return entities.list();
}

function candidateObjects(
  objects: SceneObjectQuerySource,
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
): readonly SceneObject[] {
  if (objects.inBox !== undefined) {
    const end: EntityPosition = [
      origin[0] + direction[0] * maxDistance,
      origin[1] + direction[1] * maxDistance,
      origin[2] + direction[2] * maxDistance,
    ];
    const pad = 2;
    const min: EntityPosition = [
      Math.min(origin[0], end[0]) - pad,
      Math.min(origin[1], end[1]) - pad,
      Math.min(origin[2], end[2]) - pad,
    ];
    const max: EntityPosition = [
      Math.max(origin[0], end[0]) + pad,
      Math.max(origin[1], end[1]) + pad,
      Math.max(origin[2], end[2]) + pad,
    ];
    return objects.inBox(min, max);
  }
  return objects.list();
}

function gatherHits(deps: SceneRaycastDeps, input: SceneRaycastInput): SceneRaycastHit[] {
  const direction = normalizeDirection(input.direction);
  if (direction[0] === 0 && direction[1] === 0 && direction[2] === 0) return [];
  const hits: SceneRaycastHit[] = [];
  const { origin, maxDistance } = input;

  if (enabled(input.filter, "entities") && deps.entities !== undefined) {
    for (const entity of candidateEntityIds(deps.entities, origin, maxDistance)) {
      if (excluded(input.excludeInstanceIds, entity.id)) continue;
      const set = deps.entities.collidersOf?.(entity.id) ?? defaultEntityColliders();
      const colliders = resolveColliders(set);
      pushColliderHits(
        hits,
        "entity",
        entity.id,
        entity.name,
        colliders.length > 0 ? colliders : resolveColliders(defaultEntityColliders()),
        entity.position,
        entity.rotationY,
        origin,
        direction,
        maxDistance,
      );
    }
  }

  if (enabled(input.filter, "objects") && deps.objects !== undefined) {
    for (const object of candidateObjects(deps.objects, origin, direction, maxDistance)) {
      if (excluded(input.excludeInstanceIds, object.instanceId)) continue;
      const half = deps.objects.halfExtentsOf?.(object.catalogId) ?? undefined;
      const set =
        deps.objects.collidersOf?.(object.instanceId) ??
        defaultObjectColliders(half === null || half === undefined ? undefined : half);
      const colliders = resolveColliders(set);
      pushColliderHits(
        hits,
        "object",
        object.instanceId,
        object.catalogId,
        colliders,
        object.position,
        object.rotationY,
        origin,
        direction,
        maxDistance,
      );
    }
  }

  if (enabled(input.filter, "walls") && deps.walls !== undefined) {
    for (const wall of deps.walls) {
      if (excluded(input.excludeInstanceIds, wall.id)) continue;
      const box = wallAabb(wall);
      const hit = intersectAabb(origin, direction, box.min, box.max, maxDistance);
      if (hit === null) continue;
      hits.push({
        targetKind: "wall",
        instanceId: wall.id,
        colliderName: "wall",
        purpose: "physical",
        damageEligible: false,
        blocks: true,
        distance: hit.distance,
        point: [
          origin[0] + direction[0] * hit.distance,
          origin[1] + direction[1] * hit.distance,
          origin[2] + direction[2] * hit.distance,
        ],
        normal: hit.normal,
      });
    }
  }

  if (enabled(input.filter, "terrain") && deps.terrain !== undefined) {
    const terrainHit = rayHitsTerrain(origin, direction, maxDistance, deps.terrain);
    if (terrainHit !== null) hits.push(terrainHit);
  }

  hits.sort((a, b) => a.distance - b.distance || a.instanceId.localeCompare(b.instanceId) || a.colliderName.localeCompare(b.colliderName));
  if (input.accept !== undefined) return hits.filter(input.accept);
  return hits;
}

/** First impact: nearest hit that blocks, or nearest hit if none block. */
export function firstImpact(hits: readonly SceneRaycastHit[]): SceneRaycastHit | null {
  for (const hit of hits) {
    if (hit.blocks) return hit;
  }
  return hits[0] ?? null;
}

/** Hits up to and including the first blocking collider (damage hitboxes before a wall stay). */
export function hitsUntilBlocked(hits: readonly SceneRaycastHit[]): SceneRaycastHit[] {
  const out: SceneRaycastHit[] = [];
  for (const hit of hits) {
    out.push(hit);
    if (hit.blocks) break;
  }
  return out;
}

export function createSceneRaycast(deps: SceneRaycastDeps): SceneRaycastApi {
  return {
    raycast(input) {
      const hits = gatherHits(deps, input);
      return firstImpact(hits);
    },
    raycastAll(input) {
      return gatherHits(deps, input);
    },
  };
}
