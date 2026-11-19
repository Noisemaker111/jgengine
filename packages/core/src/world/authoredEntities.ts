import { ENTITY_MARKER_KINDS, markerCatalogId, type AuthoredObjectMarkerLike } from "./authoredObjects";

export { ENTITY_MARKER_KINDS };

export type AuthoredEntityMarkerLike = AuthoredObjectMarkerLike;

export interface AuthoredEntityDocumentLike {
  markers: readonly AuthoredEntityMarkerLike[];
}

export interface AuthoredEntitySpawn {
  /** The marker's id — a stable spawn id, so re-spawning the same marker is idempotent. */
  markerId: string;
  catalogId: string;
  /** World-space spawn position as a spawn-ready `[x, y, z]` tuple. */
  position: [number, number, number];
  /** Facing (yaw radians), 0 when the marker has none. */
  rotationY: number;
}

/** @capability authored-entities spawn authored mob/boss markers from the editor document at runtime */
export function authoredEntitySpawns(
  document: AuthoredEntityDocumentLike,
  kinds: readonly string[] = ENTITY_MARKER_KINDS,
): AuthoredEntitySpawn[] {
  const wanted = new Set(kinds);
  const spawns: AuthoredEntitySpawn[] = [];
  for (const marker of document.markers) {
    if (!wanted.has(marker.kind)) continue;
    const catalogId = markerCatalogId(marker);
    if (catalogId === null) continue;
    spawns.push({
      markerId: marker.id,
      catalogId,
      position: [marker.position.x, marker.position.y, marker.position.z],
      rotationY: marker.rotationY ?? 0,
    });
  }
  return spawns;
}
