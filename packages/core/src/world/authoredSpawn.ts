import type { SceneMarkerLike } from "./sceneShapes";
import { readSpawnOverride } from "./spawnOverride";

export interface AuthoredSpawnMarkerLike extends SceneMarkerLike {
  rotationY?: number;
}

export interface AuthoredSpawnDocumentLike {
  markers: readonly AuthoredSpawnMarkerLike[];
}

export const PLAYER_SPAWN_KIND = "player_spawn";

/**
 * Every marker of `kind`, in document order — the generic query behind gameplay that references
 * authored markers by kind instead of copying coordinates into code.
 * @capability authored-spawn read spawn points and markers from the editor document
 */
export function markersOfKind<TMarker extends AuthoredSpawnMarkerLike>(
  document: { markers: readonly TMarker[] },
  kind: string,
): TMarker[] {
  return document.markers.filter((marker) => marker.kind === kind);
}

export interface AuthoredSpawnOptions {
  kind?: string;
  id?: string;
}

/**
 * True when a query targets the *default player spawn* (default kind, no explicit id) — the only
 * resolution an installed {@link readSpawnOverride} may replace. Marker queries for other kinds or
 * a named id always read the authored document, so a capture-time override cannot perturb them.
 */
function targetsDefaultPlayerSpawn(options: AuthoredSpawnOptions): boolean {
  return options.id === undefined && (options.kind === undefined || options.kind === PLAYER_SPAWN_KIND);
}

/**
 * Position of the authored spawn marker as a spawn-ready `[x, y, z]` tuple, or null when the
 * document has none. Reads the first `player_spawn` marker by default, so dragging the marker in
 * the editor moves where players spawn — no coordinates copied into game code.
 * @capability authored-spawn read spawn points and markers from the editor document
 */
export function authoredSpawnPosition(
  document: AuthoredSpawnDocumentLike,
  options: AuthoredSpawnOptions = {},
): [number, number, number] | null {
  if (targetsDefaultPlayerSpawn(options)) {
    const override = readSpawnOverride();
    if (override !== null) return [override.x, override.y, override.z];
  }
  const kind = options.kind ?? PLAYER_SPAWN_KIND;
  const marker =
    options.id === undefined
      ? document.markers.find((entry) => entry.kind === kind)
      : document.markers.find((entry) => entry.id === options.id && entry.kind === kind);
  if (marker === undefined) return null;
  return [marker.position.x, marker.position.y, marker.position.z];
}

/**
 * Facing (yaw radians) of the authored spawn marker, or 0 when the document has none — pair with
 * {@link authoredSpawnPosition} to spawn players where and how the editor placed them.
 * @capability authored-spawn read spawn points and markers from the editor document
 */
export function authoredSpawnRotation(
  document: AuthoredSpawnDocumentLike,
  options: AuthoredSpawnOptions = {},
): number {
  if (targetsDefaultPlayerSpawn(options)) {
    const override = readSpawnOverride();
    if (override?.rotationY !== undefined) return override.rotationY;
  }
  const kind = options.kind ?? PLAYER_SPAWN_KIND;
  const marker =
    options.id === undefined
      ? document.markers.find((entry) => entry.kind === kind)
      : document.markers.find((entry) => entry.id === options.id && entry.kind === kind);
  return marker?.rotationY ?? 0;
}
