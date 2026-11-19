import type { EditorSimulation } from "./simulation";
import type { MaterialAsset } from "../material/materialAsset";
import type { StaticPrefabBake } from "./staticPrefab";
import type { ParamSchema } from "../generator/paramSchema";
import type { EditorUiDocument } from "../hud/hudDocument";
import type { MinimapBakeBounds } from "@jgengine/core/map/minimapBake";
import type { TerraformSnapshot } from "../terrain/terraform";
import type { EditorGridLayer } from "./grid";
import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";
import type { IrradianceBakeSettings, IrradianceVolume } from "@jgengine/core/lighting/lightProbes";
import type { GrassStyleSettings } from "@jgengine/core/grass/grassStyle";
import type { VolumetricCloudsConfig } from "@jgengine/core/sky/volumetricClouds";
import type { PointLightingConfig } from "../game/playableGame";
export type { PointLightingConfig } from "../game/playableGame";

export type { EditorUiDocument, EditorUiPanelLayout, HudResizeAxes, HudPanelTypeDef } from "../hud/hudDocument";

/** A world-space point used across editor markers, volumes, and paths. */
export type EditorVec3 = { x: number; y: number; z: number };

export type EditorVolumeShape = "sphere" | "cylinder" | "box";

export interface EditorMarker {
  id: string;
  kind: string;
  position: EditorVec3;
  rotationY?: number;
  color?: string | undefined;
  label?: string;
  catalogId?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  meta?: Record<string, unknown>;
}

export interface EditorVolume {
  id: string;
  kind: string;
  shape: EditorVolumeShape;
  center: EditorVec3;
  radius?: number;
  height?: number;
  halfExtents?: EditorVec3;
  color?: string | undefined;
  label?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  meta?: Record<string, unknown>;
}

export interface EditorPath {
  id: string;
  kind: string;
  points: readonly EditorVec3[];
  width?: number;
  color?: string | undefined;
  label?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  meta?: Record<string, unknown>;
}

export interface EditorNote {
  id: string;
  text: string;
  position: EditorVec3;
  color?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  meta?: Record<string, unknown>;
}

export type EditorTerrain = TerraformSnapshot;

export interface EditorFragmentContent {
  materialAssets?: MaterialAsset[];
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
  staticBake?: StaticPrefabBake;
}

export interface EditorCollection {
  id: string;
  name: string;
  memberIds: string[];
  color?: string;
  locked?: boolean;
  visible?: boolean;
}

/** @capability editor-catalogs Persist and load one gameplay catalog entry's tuned params. */
export interface EditorCatalogEntry {
  id: string;
  label?: string;
  meta?: Record<string, unknown>;
}

/** @capability editor-catalogs Persist gameplay tuning rows on the scene document. */
export interface EditorCatalogData {
  id: string;
  entries: EditorCatalogEntry[];
  schema?: ParamSchema;
  label?: string;
}

/** @capability editor-catalogs Export typed gameplay catalogs for in-editor tuning. */
export interface EditorCatalogDefinition {
  id: string;
  label: string;
  schema: ParamSchema;
  entries: readonly EditorCatalogEntry[];
}

export type EditorCatalogsInput =
  | readonly EditorCatalogDefinition[]
  | (() => readonly EditorCatalogDefinition[]);

/**
 * A baked top-down minimap stored on the scene document (#1036): the PNG the editor rasterized from
 * the authored terrain (a `data:image/png;base64,…` URI) plus the world bounds it spans. Runtime
 * feeds these straight into the `Minimap`/`WorldMap` `background`/`mapBounds` props — no re-raster.
 * @capability minimap-bake persist a baked minimap PNG + bounds on the scene document
 */
export interface EditorMinimapBake {
  background: string;
  /** World-space rectangle the baked image spans. */
  bounds: MinimapBakeBounds;
}

export interface EditorBake {
  kind: "nav" | "minimap";
  id: string;
  data: unknown;
}

export type EditorSkyPreset = "day" | "dusk" | "night";

/**
 * An irradiance volume authored on the scene document: a grid of baked SH probes over a box, plus
 * the bake settings that produced them so a scene can re-bake without the editor session.
 * @capability light-probes author a baked irradiance volume on the scene document
 */
export interface EditorLightProbe extends IrradianceVolume {
  label?: string;
  bake?: IrradianceBakeSettings;
}

export interface EditorFogConfig {
  color?: string;
  near?: number;
  far?: number;
}

/**
 * Authored colour grading for the scene document's final image. The editor bakes a small
 * display-space LUT from these controls and the shell applies it after tone mapping, so a game's
 * grade is authored data like its sky, not a hardcoded pass in the game's config.
 *
 * The three band colours are display swatches (`#rrggbb`) that the pixels of that band are pulled
 * toward, by `tint`. `saturation` and `contrast` are applied before the bands. Baking at a small cube
 * size keeps the whole grade — including the LUT — a few hundred bytes of JSON.
 */
export interface EditorColorGrading {
  /** Cube edge length the runtime bakes, 2..16. Default 8 — small enough to read, smooth enough for a grade. */
  size?: number;
  shadows?: string;
  midtones?: string;
  highlights?: string;
  /** How far each band is pulled toward its swatch, 0..1. Default 0.45. */
  tint?: number;
  saturation?: number;
  contrast?: number;
  /** Clamped auto-exposure authored with the grade; absent uses the pipeline's default range. */
  autoExposure?: EditorAutoExposure;
}

/** Authored clamped auto-exposure range: how far the meter may pull a dark room or a bright street. */
export interface EditorAutoExposure {
  /** Lowest exposure multiplier the meter may reach. Default 0.5. */
  min?: number;
  /** Highest exposure multiplier the meter may reach. Default 2.5. */
  max?: number;
}

/**
 * Scene-document environment/lighting authoring (#1110): sky preset, optional time-of-day drive,
 * horizon/zenith tints, sun/ambient intensity, and fog. Serializable and genre-agnostic — games
 * feed it into `environment({ sky: sky(skyFromDocument(doc)) })` (or leave world.ts sky as a
 * fallback when the field is absent). Absent until the lighting workspace (or a seed layer) writes
 * it, so existing documents load unchanged.
 * @capability editor-environment persist sky/fog/lighting knobs on the scene document
 */
export interface EditorEnvironment {
  source?: EnvironmentSource;
  /** Authored clamped auto-exposure and colour grade; the shell applies it to the post chain. */
  grading?: EditorColorGrading;
  /** Authored local point lights; the runtime clamps these to its bounded light budget. */
  pointLights?: readonly PointLightingConfig[];
  /**
   * Authored irradiance volumes: baked light probes for interiors and shaded streets. The runtime
   * samples them at the camera and feeds three.js's scene light probe, so a room's ambient comes
   * from its own lights instead of the sky.
   */
  probes?: readonly EditorLightProbe[];
  preset?: EditorSkyPreset;
  /** Drive sun/sky from the world clock's day fraction instead of the fixed `preset`. */
  timeOfDay?: boolean;
  horizonColor?: string;
  zenithColor?: string;
  sunIntensity?: number;
  ambientIntensity?: number;
  /** Sun compass bearing in degrees (0 = -Z, 90 = +X); runtime `SkySunConfig.azimuth`. */
  sunAzimuth?: number;
  /** Sun height above the horizon in degrees; runtime `SkySunConfig.elevation`. */
  sunElevation?: number;
  fog?: EditorFogConfig;
  /**
   * The world's grass style: realism (0 cartoon .. 1 photoreal) and any style slider set by hand, or
   * a named preset. Every grass and ground-cover volume draws with it unless its own `style` overrides it.
   */
  grassStyle?: GrassStyleSettings;
  volumetricClouds?: VolumetricCloudsConfig;
}

export interface EditorDocument {
  materialAssets?: MaterialAsset[] | undefined;
  version: 1;
  simulation?: EditorSimulation;
  markers: EditorMarker[];
  volumes: EditorVolume[];
  paths: EditorPath[];
  annotations: EditorNote[];
  terrain?: EditorTerrain;
  terrainGenerator?: import("../landform/generator/landformDocument").EditorTerrainGenerator | undefined;
  prefabs: EditorPrefab[];
  collections: EditorCollection[];
  catalogs: EditorCatalogData[];
  grids?: EditorGridLayer[];
  ui?: EditorUiDocument | undefined;
  /**
   * Procedural **directives** — the scene-authorable face of the runtime scatter/population
   * primitives. One directive line materializes into many placements at load (via
   * `@jgengine/core/editor/directives`) instead of hundreds of explicit entries, so bulk ambient
   * content (rocks, trees, mob populations) stays one diffable row. Absent until a game authors one.
   */
  directives?: EditorDirective[];
  /**
   * Baked top-down minimap (#1036) — the editor's `bake_minimap` action rasterizes the authored
   * terrain into this PNG + bounds; runtime hands them to the `Minimap`/`WorldMap` props. Absent
   * until baked, so old docs and unbaked games load unchanged.
   */
  minimap?: EditorMinimapBake;
  bakes?: EditorBake[] | undefined;
  /**
   * Scene-document sky/fog/lighting (#1110). Absent until authored in the lighting workspace or
   * seeded via `editorLayers`, so old docs load unchanged and world.ts can keep a fallback sky.
   */
  environment?: EditorEnvironment;
}

/** XZ world-space bounds, `[minX, minZ]`..`[maxX, maxZ]`, for a directive that names no region. */
export interface EditorDirectiveArea {
  min: [number, number];
  max: [number, number];
}

/** Fields shared by every directive: a stable id, the region/area it fills, and a deterministic seed. */
interface EditorDirectiveBase {
  id: string;
  region?: string;
  area?: EditorDirectiveArea;
  /** Deterministic seed — the same directive + seed always materializes the same field. */
  seed?: string | number;
  meta?: Record<string, unknown>;
}

export interface EditorScatterDirective extends EditorDirectiveBase {
  kind: "scatter";
  asset: string;
  /** Items per square meter across the footprint. */
  density: number;
  minSpacing?: number;
  /** Grid jitter 0..1 — 0 is a rigid lattice, 1 fully scattered. */
  jitter?: number;
  minScale?: number;
  maxScale?: number;
  /** Yaw range (radians) applied per placement. */
  minYaw?: number;
  maxYaw?: number;
}

export interface EditorPopulationSpecies {
  id: string;
  /** Relative spawn weight; defaults to 1. */
  weight?: number;
  cap: number;
}

export interface EditorPopulationDirective extends EditorDirectiveBase {
  kind: "population";
  species: EditorPopulationSpecies[];
}

export type EditorDirective = EditorScatterDirective | EditorPopulationDirective;

export type EditorDirectiveKind = EditorDirective["kind"];

export type EditorLayersInput =
  | EditorDocument
  | Partial<Omit<EditorDocument, "version">>
  | (() => EditorDocument | Partial<Omit<EditorDocument, "version">>);

export interface EditorKindVisibility {
  [kind: string]: boolean;
}

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

export const WELL_KNOWN_PATH_KINDS = ["road", "corridor", "branch", "route"] as const;
