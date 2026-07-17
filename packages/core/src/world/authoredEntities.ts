import { markerCatalogId, type AuthoredObjectMarkerLike } from "./authoredObjects";

/** Marker kinds {@link authoredEntitySpawns} treats as spawnable entities by default. */
export const ENTITY_MARKER_KINDS: readonly string[] = ["mob", "boss"];

/** The minimal marker shape entity spawns read; any `EditorMarker` satisfies it. */
export type AuthoredEntityMarkerLike = AuthoredObjectMarkerLike;

/** The minimal document shape {@link authoredEntitySpawns} walks; any `EditorDocument` satisfies it. */
export interface AuthoredEntityDocumentLike {
  markers: readonly AuthoredEntityMarkerLike[];
}

/** One resolved entity to spawn from the authored scene — its marker id, catalog id, and pose. */
export interface AuthoredEntitySpawn {
  /** The marker's id — a stable spawn id, so re-spawning the same marker is idempotent. */
  markerId: string;
  /** The entity catalog id to spawn (join key into `content.entityById`). */
  catalogId: string;
  /** World-space spawn position as a spawn-ready `[x, y, z]` tuple. */
  position: [number, number, number];
  /** Facing (yaw radians), 0 when the marker has none. */
  rotationY: number;
}

/**
 * Every authored entity marker (`mob`/`boss` by default) that carries a `catalogId`, as a spawn plan
 * the runtime feeds to `ctx.scene.entity.spawn(catalogId, { id, position })`. Reads the same document
 * the editor authors, so placing a mob and setting its catalog id in the editor is all it takes to
 * spawn it — no coordinates or spawn tables copied into game code. Markers without a catalog id are
 * skipped (they are placement-only, e.g. a boss arena marker a game handles specially).
 * @capability authored-entities spawn authored mob/boss markers from the editor document at runtime
 */
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
