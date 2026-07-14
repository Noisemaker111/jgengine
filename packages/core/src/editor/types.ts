import type { TerraformSnapshot } from "../world/terraform";

/** A world-space point used across editor markers, volumes, and paths. */
export type EditorVec3 = { x: number; y: number; z: number };

/** Collision shape a volume is rendered and tested as. */
export type EditorVolumeShape = "sphere" | "cylinder" | "box";

/** A placeable point object in the scene — spawn, mob, chest, POI, etc. */
export interface EditorMarker {
  id: string;
  kind: string;
  position: EditorVec3;
  rotationY?: number;
  color?: string;
  label?: string;
  /** Id of the object this one is parented under; moving the parent moves this with it. */
  parentId?: string;
  meta?: Record<string, unknown>;
}

/** A spatial region — zone, aggro range, capture area — placed in the scene. */
export interface EditorVolume {
  id: string;
  kind: string;
  shape: EditorVolumeShape;
  center: EditorVec3;
  radius?: number;
  height?: number;
  halfExtents?: EditorVec3;
  color?: string;
  label?: string;
  /** Id of the object this one is parented under; moving the parent moves this with it. */
  parentId?: string;
  meta?: Record<string, unknown>;
}

/** A polyline of points — road, corridor, patrol route — placed in the scene. */
export interface EditorPath {
  id: string;
  kind: string;
  points: readonly EditorVec3[];
  width?: number;
  color?: string;
  label?: string;
  /** Id of the object this one is parented under; moving the parent moves this with it. */
  parentId?: string;
  meta?: Record<string, unknown>;
}

/** A free-text annotation pinned to a world position for designers. */
export interface EditorNote {
  id: string;
  text: string;
  position: EditorVec3;
  color?: string;
  /** Id of the object this one is parented under; moving the parent moves this with it. */
  parentId?: string;
  meta?: Record<string, unknown>;
}

/**
 * A sculpted heightfield authored in the editor: the {@link TerraformSnapshot} of offset deltas
 * over the game's base ground. Serializes with the scene; a game rebuilds the field with
 * `editableTerrainFromSnapshot`.
 */
export type EditorTerrain = TerraformSnapshot;

/** The four placeable-object collections a prefab fragment or clipboard fragment carries. */
export interface EditorFragmentContent {
  markers: readonly EditorMarker[];
  volumes: readonly EditorVolume[];
  paths: readonly EditorPath[];
  annotations: readonly EditorNote[];
}

/**
 * A serializable, reusable stamp of authored objects — markers/volumes/paths/notes centered on
 * their own centroid so the same prefab inserts consistently anywhere, in this scene or another
 * game's. `insertPrefab` tags every inserted object's `meta.prefabId`/`meta.prefabInstanceId`;
 * `detachPrefabInstance` strips those tags to break the link without touching the content.
 */
export interface EditorPrefab {
  id: string;
  name: string;
  fragment: EditorFragmentContent;
}

/**
 * A named, persisted list of object ids — a selection bookmark (restore, add-to) that can also
 * double as a production group: `locked` blocks `translate`/`setTransform`/`remove`/`removeMany`
 * on its members, `color`/`visible` are UI-only hints for the collections panel.
 */
export interface EditorCollection {
  id: string;
  name: string;
  memberIds: string[];
  color?: string;
  locked?: boolean;
  visible?: boolean;
}

/** The full authored scene: every marker, volume, path, note, and sculpted terrain for a game. */
export interface EditorDocument {
  version: 1;
  markers: EditorMarker[];
  volumes: EditorVolume[];
  paths: EditorPath[];
  annotations: EditorNote[];
  /** Optional sculpted heightfield overlay; absent until terrain is created in the editor. */
  terrain?: EditorTerrain;
  /** Reusable object stamps authored with "make prefab", inserted anywhere with "insert prefab". */
  prefabs: EditorPrefab[];
  /** Named selection sets / production groups — restore, add-to, lock, color, visibility. */
  collections: EditorCollection[];
}

/** Accepted shape for a game's `editorLayers` export: a document, partial data, or a factory. */
export type EditorLayersInput =
  | EditorDocument
  | Partial<Omit<EditorDocument, "version">>
  | (() => EditorDocument | Partial<Omit<EditorDocument, "version">>);

/** Per-kind show/hide flags for the editor's layer panel. */
export interface EditorKindVisibility {
  [kind: string]: boolean;
}

/** Standard marker kinds recognized with default colors and behavior. */
export const WELL_KNOWN_MARKER_KINDS = [
  "player_spawn",
  "mob",
  "boss",
  "vendor",
  "chest",
  "travel",
  "npc",
  "poi",
  "prop",
  "goal",
  "branch",
] as const;

/** Standard volume kinds recognized with default colors and behavior. */
export const WELL_KNOWN_VOLUME_KINDS = [
  "zone",
  "flatten",
  "cluster",
  "aggro",
  "leash",
  "discover",
  "capture",
  "prompt",
  "poi",
  "respawn_skip",
] as const;

/** Standard path kinds recognized with default colors and behavior. */
export const WELL_KNOWN_PATH_KINDS = ["road", "corridor", "branch", "route"] as const;
