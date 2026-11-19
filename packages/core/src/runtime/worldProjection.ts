import type { EntityPosition, SceneEntity } from "../scene/entityStore";
import type { SnapshotViewer, WorldSnapshot } from "./worldSnapshot";

/**
 * Host-side interest/privacy policy — how the authoritative world projects to each viewer over the
 * wire. Unset (the default) means every client receives the whole world, exactly as before. Enabling a
 * field changes only what each client *sees*, never how the host simulates: the game plays identically.
 * The core replication modules read this to attach a {@link SnapshotModule.project} without the engine
 * growing a per-feature branch.
 */
export interface ReplicationPolicy {
  /** Decimal places used for replicated positions and angles. */
  quantize?: { position?: number; angle?: number };
  privatePerUser?: boolean;
  /**
   * Area-of-interest radius in world units: an entity replicates to a viewer only when within this
   * distance of the viewer's own entity (the entity whose `id` equals the viewer's `userId`). A viewer
   * always receives its own entity. Omit for no distance culling — every entity to every viewer.
   */
  aoiRadius?: number;
  aoiAlways?: readonly string[] | (() => Iterable<string>);
}

/** @internal host projection plumbing — games set ReplicationPolicy; the runtime applies it. */
export function policyProjectsViewers(policy: ReplicationPolicy | undefined): boolean {
  if (policy === undefined) return false;
  return policy.privatePerUser === true || policy.aoiRadius !== undefined || policy.quantize !== undefined;
}

/** @internal host projection plumbing */
export function quantizeWorldForReplication(world: WorldSnapshot, policy: ReplicationPolicy | undefined): WorldSnapshot {
  if (policy?.quantize?.position === undefined && policy?.quantize?.angle === undefined) return world;
  const digits = (value: number, places: number | undefined) => places === undefined ? value : Number(value.toFixed(Math.max(0, places)));
  const entities = (world["entities"] as readonly SceneEntity[] | undefined)?.map((entity) => ({
    ...entity,
    position: entity.position.map((value) => digits(value, policy.quantize?.position)) as unknown as EntityPosition,
    rotationY: digits(entity.rotationY, policy.quantize?.angle),
    rotationX: digits(entity.rotationX, policy.quantize?.angle),
    rotationZ: digits(entity.rotationZ, policy.quantize?.angle),
  }));
  return entities === undefined ? world : { ...world, entities };
}

function distanceSquared(a: EntityPosition, b: EntityPosition): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Cull an entity list to a viewer's area of interest: keep the viewer's own entity plus every entity
 * within `radius` of it. When the viewer has no locatable entity the full list is returned (fail-open —
 * a spectator or not-yet-spawned player still sees the world rather than an empty one).
 * @internal host projection plumbing
 */
export function projectEntitiesForViewer(
  entities: readonly SceneEntity[],
  viewer: SnapshotViewer,
  radius: number,
): readonly SceneEntity[] {
  const self = entities.find((entity) => entity.id === viewer.userId);
  if (self === undefined) return entities;
  const radiusSquared = radius * radius;
  return entities.filter(
    (entity) =>
      entity.id === viewer.userId || distanceSquared(entity.position, self.position) <= radiusSquared,
  );
}

/** @internal host projection plumbing */
export function visibleEntityIds(
  entities: readonly SceneEntity[],
  viewer: SnapshotViewer,
  radius: number,
): Set<string> {
  return new Set(projectEntitiesForViewer(entities, viewer, radius).map((entity) => entity.id));
}

/** @internal host projection plumbing */
export function projectByVisibleIds<T>(byId: Record<string, T>, visible: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, value] of Object.entries(byId)) if (visible.has(id)) out[id] = value;
  return out;
}

/** @internal host projection plumbing */
export function viewerOrigin(world: WorldSnapshot, viewer: SnapshotViewer): EntityPosition | undefined {
  const entities = (world["entities"] ?? []) as readonly SceneEntity[];
  return entities.find((entity) => entity.id === viewer.userId)?.position;
}

/** @internal host projection plumbing */
export function projectObjectsForViewer<T extends { position: EntityPosition }>(
  objects: readonly T[],
  origin: EntityPosition | undefined,
  radius: number,
): readonly T[] {
  if (origin === undefined) return objects;
  const radiusSquared = radius * radius;
  return objects.filter((object) => distanceSquared(object.position, origin) <= radiusSquared);
}

/**
 * Narrow a `userId → state` record to only the viewer's own entry — the projection for private
 * per-user state (inventory, wallets) so one client never receives another player's private data.
 * @internal host projection plumbing
 */
export function projectPerUserForViewer<T>(
  byUser: Record<string, T>,
  viewer: SnapshotViewer,
): Record<string, T> {
  const own = byUser[viewer.userId];
  return own === undefined ? {} : { [viewer.userId]: own };
}
