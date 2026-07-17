import type { ParamSchema } from "../scene/sceneKinds";
import type { EditorUiDocument } from "../ui/hudDocument";
import type { TerraformSnapshot } from "../world/terraform";
import type { EditorGridLayer } from "./grid";

export type { EditorUiDocument, EditorUiPanelLayout, HudResizeAxes, HudPanelTypeDef } from "../ui/hudDocument";

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
  /**
   * Catalog object id for a placed prop mesh. Prefer this over `meta.catalogId` for new content;
   * `resolveAuthoredObjects` still reads `meta.catalogId` as the migration alias.
   */
  catalogId?: string;
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

/**
 * One row in a gameplay data catalog — id + optional label + a meta bag matching the catalog's
 * `ParamSchema`. Values persist on the scene document; the schema lives in the game export.
 * @capability editor-catalogs Persist and load one gameplay catalog entry's tuned params.
 */
export interface EditorCatalogEntry {
  id: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/**
 * Persisted values for one gameplay data catalog (weapons, waves, economy, …). Schemas are not
 * stored here — they come from the game's `editorCatalogs` export and drive SchemaInspector.
 * @capability editor-catalogs Persist gameplay tuning rows on the scene document.
 */
export interface EditorCatalogData {
  id: string;
  entries: EditorCatalogEntry[];
}

/**
 * Game-exported catalog definition: a `ParamSchema` plus default entries. Schemas stay in code;
 * entry values merge into `document.catalogs` and are what the editor/RPC edits and saves.
 * @capability editor-catalogs Export typed gameplay catalogs for in-editor tuning.
 */
export interface EditorCatalogDefinition {
  id: string;
  label: string;
  schema: ParamSchema;
  entries: readonly EditorCatalogEntry[];
}

/** Accepted shape for a game's `editorCatalogs` export: definitions, or a factory. */
export type EditorCatalogsInput =
  | readonly EditorCatalogDefinition[]
  | (() => readonly EditorCatalogDefinition[]);

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
  /** Persisted gameplay catalog values; schemas come from the game's `editorCatalogs` export. */
  catalogs: EditorCatalogData[];
  /**
   * Editor-owned grid/tile layers — sparse `col,row` → value-id maps authored in the editor and
   * read by runtime + rendering through `@jgengine/core/editor/grid`. Absent until a game or the
   * editor adds a grid layer, so existing documents load unchanged.
   */
  grids?: EditorGridLayer[];
  /**
   * HUD layout owned by the scene document — panel id → anchor/offset/size/visibility.
   * Canvas mode (F2+C) and `canvas_move_panel` / `canvas_resize_panel` write here; HudPanel reads it.
   */
  ui?: EditorUiDocument;
  /**
   * Procedural **directives** — the scene-authorable face of the runtime scatter/population
   * primitives. One directive line materializes into many placements at load (via
   * `@jgengine/core/editor/directives`) instead of hundreds of explicit entries, so bulk ambient
   * content (rocks, trees, mob populations) stays one diffable row. Absent until a game authors one.
   */
  directives?: EditorDirective[];
}

/** XZ world-space bounds, `[minX, minZ]`..`[maxX, maxZ]`, for a directive that names no region. */
export interface EditorDirectiveArea {
  min: [number, number];
  max: [number, number];
}

/** Fields shared by every directive: a stable id, the region/area it fills, and a deterministic seed. */
interface EditorDirectiveBase {
  /** Stable directive id; also the prefix of every minted instance id (`<id>#<index>`). */
  id: string;
  /** Id of a document volume or scatter path whose footprint bounds the directive. */
  region?: string;
  /** Explicit XZ bounds used when no `region` is named. */
  area?: EditorDirectiveArea;
  /** Deterministic seed — the same directive + seed always materializes the same field. */
  seed?: string | number;
  /** Free-form authoring metadata. */
  meta?: Record<string, unknown>;
}

/** Scatters catalog props (rocks/trees/foliage) across a region — feeds the existing scatter system. */
export interface EditorScatterDirective extends EditorDirectiveBase {
  kind: "scatter";
  /** Catalog/asset id every placement instantiates. */
  asset: string;
  /** Items per square meter across the footprint. */
  density: number;
  /** Minimum spacing between placements (m); 0 allows clumping. */
  minSpacing?: number;
  /** Grid jitter 0..1 — 0 is a rigid lattice, 1 fully scattered. */
  jitter?: number;
  minScale?: number;
  maxScale?: number;
  /** Yaw range (radians) applied per placement. */
  minYaw?: number;
  maxYaw?: number;
}

/** One weighted species in a population directive, with a hard instance cap. */
export interface EditorPopulationSpecies {
  id: string;
  /** Relative spawn weight; defaults to 1. */
  weight?: number;
  /** Maximum instances of this species the directive materializes. */
  cap: number;
}

/** Populates a region with weighted, capped mob spawns — config for `ai/populationDirector`. */
export interface EditorPopulationDirective extends EditorDirectiveBase {
  kind: "population";
  species: EditorPopulationSpecies[];
}

/** A procedural directive on the scene document: scatter props or a mob population. */
export type EditorDirective = EditorScatterDirective | EditorPopulationDirective;

/** The distinct directive kinds a materializer expands. */
export type EditorDirectiveKind = EditorDirective["kind"];

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
