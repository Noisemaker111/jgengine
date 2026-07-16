import type { EntityPosition } from "./entityStore";
import type { SceneObject } from "./objectStore";

export interface ObjectRaycastInput {
  origin: EntityPosition;
  direction: EntityPosition;
  maxDistance: number;
  halfExtents?: EntityPosition;
  filter?: (object: SceneObject) => boolean;
}

export interface ObjectRaycastHit {
  instanceId: string;
  catalogId: string;
  distance: number;
  point: EntityPosition;
  normal: EntityPosition;
}

/** Optional broadphase for large object sets — typically `ObjectStore.inBox`. */
export interface ObjectQueryBroadphase {
  inBox(min: EntityPosition, max: EntityPosition): readonly SceneObject[];
}

export type ObjectRaycastSource = readonly SceneObject[] | ObjectQueryBroadphase;

const DEFAULT_HALF_EXTENTS: EntityPosition = [0.5, 0.5, 0.5];

function normalize(direction: EntityPosition): EntityPosition {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0) return [0, 0, 0];
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function isBroadphase(source: ObjectRaycastSource): source is ObjectQueryBroadphase {
  return !Array.isArray(source) && typeof (source as ObjectQueryBroadphase).inBox === "function";
}

function intersectAabb(
  origin: EntityPosition,
  direction: EntityPosition,
  min: EntityPosition,
  max: EntityPosition,
  maxDistance: number,
): { distance: number; normal: EntityPosition } | null {
  let tMin = 0;
  let tMax = maxDistance;
  let normalAxis = -1;
  let normalSign = 0;

  for (let axis = 0; axis < 3; axis += 1) {
    const originAxis = origin[axis]!;
    const dirAxis = direction[axis]!;
    const minAxis = min[axis]!;
    const maxAxis = max[axis]!;

    if (Math.abs(dirAxis) < 1e-12) {
      if (originAxis < minAxis || originAxis > maxAxis) return null;
      continue;
    }

    const invD = 1 / dirAxis;
    const t1 = (minAxis - originAxis) * invD;
    const t2 = (maxAxis - originAxis) * invD;
    const minIsNear = t1 <= t2;
    const tNearAxis = minIsNear ? t1 : t2;
    const tFarAxis = minIsNear ? t2 : t1;
    const nearFaceSign = minIsNear ? -1 : 1;

    if (tNearAxis > tMin) {
      tMin = tNearAxis;
      normalAxis = axis;
      normalSign = nearFaceSign;
    }
    tMax = Math.min(tMax, tFarAxis);
    if (tMin > tMax) return null;
  }

  if (tMin > maxDistance || tMin < 0) return null;

  const normal: EntityPosition =
    normalAxis === 0
      ? [normalSign, 0, 0]
      : normalAxis === 1
        ? [0, normalSign, 0]
        : normalAxis === 2
          ? [0, 0, normalSign]
          : [0, 1, 0];

  return { distance: tMin, normal };
}

function hitFor(
  object: SceneObject,
  origin: EntityPosition,
  direction: EntityPosition,
  halfExtents: EntityPosition,
  maxDistance: number,
): ObjectRaycastHit | null {
  const min: EntityPosition = [
    object.position[0] - halfExtents[0],
    object.position[1] - halfExtents[1],
    object.position[2] - halfExtents[2],
  ];
  const max: EntityPosition = [
    object.position[0] + halfExtents[0],
    object.position[1] + halfExtents[1],
    object.position[2] + halfExtents[2],
  ];
  const hit = intersectAabb(origin, direction, min, max, maxDistance);
  if (hit === null) return null;
  return {
    instanceId: object.instanceId,
    catalogId: object.catalogId,
    distance: hit.distance,
    point: [
      origin[0] + direction[0] * hit.distance,
      origin[1] + direction[1] * hit.distance,
      origin[2] + direction[2] * hit.distance,
    ],
    normal: hit.normal,
  };
}

function raySegmentBounds(
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
  halfExtents: EntityPosition,
): { min: EntityPosition; max: EntityPosition } {
  const endX = origin[0] + direction[0] * maxDistance;
  const endY = origin[1] + direction[1] * maxDistance;
  const endZ = origin[2] + direction[2] * maxDistance;
  const padX = halfExtents[0];
  const padY = halfExtents[1];
  const padZ = halfExtents[2];
  return {
    min: [
      Math.min(origin[0], endX) - padX,
      Math.min(origin[1], endY) - padY,
      Math.min(origin[2], endZ) - padZ,
    ],
    max: [
      Math.max(origin[0], endX) + padX,
      Math.max(origin[1], endY) + padY,
      Math.max(origin[2], endZ) + padZ,
    ],
  };
}

function resolveCandidates(
  source: ObjectRaycastSource,
  origin: EntityPosition,
  direction: EntityPosition,
  maxDistance: number,
  halfExtents: EntityPosition,
): readonly SceneObject[] {
  if (!isBroadphase(source)) return source;
  const bounds = raySegmentBounds(origin, direction, maxDistance, halfExtents);
  return source.inBox(bounds.min, bounds.max);
}

/** @internal */
export function raycastObjects(
  source: ObjectRaycastSource,
  input: ObjectRaycastInput,
): ObjectRaycastHit | null {
  const direction = normalize(input.direction);
  if (direction[0] === 0 && direction[1] === 0 && direction[2] === 0) return null;
  const halfExtents = input.halfExtents ?? DEFAULT_HALF_EXTENTS;
  const objects = resolveCandidates(source, input.origin, direction, input.maxDistance, halfExtents);

  let nearest: ObjectRaycastHit | null = null;
  for (const object of objects) {
    if (input.filter !== undefined && !input.filter(object)) continue;
    const hit = hitFor(object, input.origin, direction, halfExtents, input.maxDistance);
    if (hit === null) continue;
    if (nearest === null || hit.distance < nearest.distance) nearest = hit;
  }
  return nearest;
}

/** @internal */
export function raycastObjectsAll(
  source: ObjectRaycastSource,
  input: ObjectRaycastInput,
): ObjectRaycastHit[] {
  const direction = normalize(input.direction);
  if (direction[0] === 0 && direction[1] === 0 && direction[2] === 0) return [];
  const halfExtents = input.halfExtents ?? DEFAULT_HALF_EXTENTS;
  const objects = resolveCandidates(source, input.origin, direction, input.maxDistance, halfExtents);

  const hits: ObjectRaycastHit[] = [];
  for (const object of objects) {
    if (input.filter !== undefined && !input.filter(object)) continue;
    const hit = hitFor(object, input.origin, direction, halfExtents, input.maxDistance);
    if (hit !== null) hits.push(hit);
  }
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

export { intersectAabb, normalize as normalizeDirection };
