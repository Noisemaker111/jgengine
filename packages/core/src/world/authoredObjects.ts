import type { ModelAnimationConfig } from "../game/playableGame";
import type { SceneMarkerLike } from "./sceneShapes";

/** A placement's authored rig animation override — the stored `marker.meta.animation` contract (#1274). */
export type AuthoredAnimation = ModelAnimationConfig | "auto" | "none";

/**
 * One authored catalog prop resolved from an editor marker — grounded at `x`/`z` with yaw, ready
 * for `ctx.scene.object.place` or {@link placeAuthoredObjects}.
 */
export interface AuthoredObject {
  catalogId: string;
  x: number;
  z: number;
  rotationY: number;
  instanceId: string;
  /** Extra lift in meters from the marker (`catalogId` field / meta), applied on top of terrain height. */
  verticalOffset: number;
  /**
   * Per-placement rig animation override authored at `marker.meta.animation` (#1274), threaded onto the
   * placed object's `ModelConfig.animation` so the override applies in game. `undefined` when the marker
   * carries no override — behavior is exactly the catalog-resolved default.
   */
  animation?: AuthoredAnimation;
}

/** Minimal marker shape {@link resolveAuthoredObjects} reads; any `EditorMarker` satisfies it. */
export interface AuthoredObjectMarkerLike extends SceneMarkerLike {
  catalogId?: string;
  rotationY?: number;
}

/** Minimal document shape {@link resolveAuthoredObjects} walks; any `EditorDocument` satisfies it. */
export interface AuthoredObjectsDocumentLike {
  markers: readonly AuthoredObjectMarkerLike[];
}

/** Structural place target — any `ObjectStore` satisfies it. */
export interface AuthoredObjectPlaceTarget {
  place(
    catalogId: string,
    x: number,
    y: number,
    z: number,
    options?: {
      instanceId?: string;
      rotation?: number;
      animation?: AuthoredAnimation;
      onExisting?: "throw" | "replace" | "keep";
    },
  ): string;
}

/** Options for {@link placeAuthoredObjects}. */
export interface PlaceAuthoredObjectsOptions {
  /** Extra lift in meters applied to every placement after terrain height + per-object offset. */
  verticalOffset?: number;
  /** How to treat instance ids already in the store. Default `"throw"` (ObjectStore default). */
  onExisting?: "throw" | "replace" | "keep";
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | null {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Catalog id for a marker: first-class `catalogId` field, else `meta.catalogId` migration alias.
 * Returns null when the marker is not an authored catalog prop (spawn, mob, generator, …).
 * @capability authored-objects place catalog mesh props from an editor document
 */
export function markerCatalogId(marker: AuthoredObjectMarkerLike): string | null {
  if (typeof marker.catalogId === "string" && marker.catalogId.length > 0) return marker.catalogId;
  return metaString(marker.meta, "catalogId");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The authored per-placement rig animation override stored at `marker.meta.animation` (#1274), or
 * `undefined` when absent/malformed. `"auto"` / `"none"` pass through as the string modes; any other
 * object is a `ModelAnimationConfig` the shell applies verbatim (validated at author time in the
 * editor). Runtime trusts the persisted document here exactly like it trusts position and rotation.
 * @capability authored-objects per-placement animation override from marker.meta.animation
 */
export function markerAnimation(marker: AuthoredObjectMarkerLike): AuthoredAnimation | undefined {
  const value = marker.meta?.["animation"];
  if (value === "auto" || value === "none") return value;
  if (isRecord(value)) return value as unknown as ModelAnimationConfig;
  return undefined;
}

function markerVerticalOffset(marker: AuthoredObjectMarkerLike): number {
  const fromMeta =
    metaNumber(marker.meta, "verticalOffset") ??
    metaNumber(marker.meta, "offsetY") ??
    metaNumber(marker.meta, "yOffset");
  return fromMeta ?? 0;
}

/**
 * Marker kinds that are spawnable entities (materialized by `authoredEntitySpawns`), not static
 * catalog props. {@link resolveAuthoredObjects} skips them by default so a placed `mob`/`boss` is
 * spawned once as an entity and never also placed as a static mesh.
 * @capability authored-objects marker kinds resolved as entity spawns, not static props
 */
export const ENTITY_MARKER_KINDS: readonly string[] = ["mob", "boss"];

/** Options for {@link resolveAuthoredObjects}. */
export interface ResolveAuthoredObjectsOptions {
  /** Marker kinds to skip (they are handled elsewhere). Default {@link ENTITY_MARKER_KINDS}. */
  excludeKinds?: readonly string[];
}

/**
 * Every marker carrying a catalog id, as placeable props — pure, no terrain sample. Parallel to
 * {@link resolveScatter}: games and headless tests read the same list `<AuthoredObjects>` places.
 * Entity-spawn kinds (`mob`/`boss`) are skipped by default — they carry a `catalogId` for their
 * entity definition, but are spawned via `authoredEntitySpawns`, not placed as static meshes.
 * @capability authored-objects place catalog mesh props from an editor document
 */
export function resolveAuthoredObjects(
  document: AuthoredObjectsDocumentLike,
  options: ResolveAuthoredObjectsOptions = {},
): AuthoredObject[] {
  const excluded = new Set(options.excludeKinds ?? ENTITY_MARKER_KINDS);
  const out: AuthoredObject[] = [];
  for (const marker of document.markers) {
    if (excluded.has(marker.kind)) continue;
    const catalogId = markerCatalogId(marker);
    if (catalogId === null) continue;
    const animation = markerAnimation(marker);
    out.push({
      catalogId,
      x: marker.position.x,
      z: marker.position.z,
      rotationY: marker.rotationY ?? 0,
      instanceId: marker.id,
      verticalOffset: markerVerticalOffset(marker),
      ...(animation === undefined ? {} : { animation }),
    });
  }
  return out;
}

/**
 * Places resolved authored objects into an object store, grounding each on `sampleHeight(x,z)` plus
 * per-object and options vertical offsets. Returns the instance ids that were placed (or kept).
 * @capability authored-objects place catalog mesh props from an editor document
 */
export function placeAuthoredObjects(
  store: AuthoredObjectPlaceTarget,
  objects: readonly AuthoredObject[],
  sampleHeight: (x: number, z: number) => number,
  options: PlaceAuthoredObjectsOptions = {},
): string[] {
  const lift = options.verticalOffset ?? 0;
  const onExisting = options.onExisting;
  const ids: string[] = [];
  for (const object of objects) {
    const y = sampleHeight(object.x, object.z) + object.verticalOffset + lift;
    ids.push(
      store.place(object.catalogId, object.x, y, object.z, {
        instanceId: object.instanceId,
        rotation: object.rotationY,
        ...(object.animation === undefined ? {} : { animation: object.animation }),
        ...(onExisting === undefined ? {} : { onExisting }),
      }),
    );
  }
  return ids;
}

/** Convenience: resolve a document then place every authored catalog prop. */
export function placeAuthoredObjectsFromDocument(
  store: AuthoredObjectPlaceTarget,
  document: AuthoredObjectsDocumentLike,
  sampleHeight: (x: number, z: number) => number,
  options: PlaceAuthoredObjectsOptions = {},
): string[] {
  return placeAuthoredObjects(store, resolveAuthoredObjects(document), sampleHeight, options);
}
