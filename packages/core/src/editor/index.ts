// @skill jgengine-editor
export type { EditorDocument } from "./types";
export type { EditorTerrain } from "./types";
export type { EditorMinimapBake } from "./types";
export type { EditorEnvironment, EditorFogConfig, EditorLightProbe, EditorSkyPreset, PointLightingConfig } from "./types";
/** Authored per-game colour grade: band tints, saturation/contrast and the clamped exposure range. */
export type { EditorAutoExposure, EditorColorGrading } from "./types";
/** Declarative HDRI, cube, or gradient environment source used by the shell. */
export type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";
export type { EditorKindVisibility } from "./types";
export type { EditorFragmentContent } from "./types";
export type { EditorPrefab } from "./types";
export type { EditorCollection } from "./types";
export type { EditorCatalogEntry } from "./types";
export type { EditorCatalogData } from "./types";
/**
 * Game-exported catalog definition: ParamSchema + default entries for in-editor tuning.
 * @example
 * ```ts
 * import type { EditorCatalogDefinition } from "@jgengine/core/editor/index";
 * export const editorCatalogs: EditorCatalogDefinition[] = [{
 *   id: "towers", label: "Towers",
 *   schema: { fields: [{ key: "damage", type: "number", default: 8, min: 1, max: 100 }] },
 *   entries: [{ id: "tower_archer", label: "Archer", meta: { damage: 8 } }],
 * }];
 * ```
 */
export type { EditorCatalogDefinition } from "./types";
export type { EditorCatalogsInput } from "./types";
export { ENTITY_CATALOG_ID, entityDefinitionSchema, entityEntryFromCatalog, resolveCatalogDefinitions } from "./entityCatalog";
export type { EntityCatalogDocumentLike } from "./entityCatalog";
export type { EditorLayersInput } from "./types";
export type { EditorMarker } from "./types";
export type { EditorNote } from "./types";
export type { EditorPath } from "./types";
/** A world-space point used across editor markers, volumes, and paths. */
export type { EditorVec3 } from "./types";
export type { EditorVolume } from "./types";
export type { EditorVolumeShape } from "./types";
export type { EditorUiDocument, EditorUiPanelLayout, HudPanelTypeDef, HudResizeAxes } from "./types";
export {
  WELL_KNOWN_MARKER_KINDS,
  WELL_KNOWN_PATH_KINDS,
  WELL_KNOWN_VOLUME_KINDS,
} from "./types";
export {
  applyEditorDocumentOverlay,
  cloneEditorDocument,
  collectDescendants,
  createEmptyEditorDocument,
  createPrefabFragment,
  decodeEditorDocument,
  editorChildren,
  editorDocumentBounds,
  editorDocumentExtras,
  editorDocumentSize,
  editorMarkerPosition,
  editorMarkerXZ,
  editorParentOf,
  editorRoots,
  exportEditorDocumentJson,
  extractEditorFragment,
  findEditorCatalog,
  findEditorCatalogEntry,
  findEditorCollection,
  findEditorMarker,
  findEditorNote,
  findEditorPath,
  findEditorPrefab,
  findEditorVolume,
  authoredEditorDocument,
  importEditorDocumentJson,
  isEditorObjectCollectionLocked,
  isEditorObjectHidden,
  isEditorObjectLocked,
  isEditorObjectSelfLocked,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
  requireEditorMarker,
  seedEditorCatalogs,
  withDerivedEditorLayers,
  wouldCreateCycle,
} from "./document";
export type { EditorDocumentDiagnostic } from "./document";
/** Code-built layers a game shows in the editor but never saves into its scene. */
export type { DerivedEditorLayers } from "./document";
export {
  WORLD_BASE_SHARD_ID,
  WORLD_MANIFEST_KIND,
  decodeWorldManifest,
  exportWorldManifestJson,
  loadWorldDocument,
  selectWorldShards,
  shardMatchesQuery,
  singleShardWorldManifest,
  splitEditorDocumentIntoShards,
} from "./world";
export type {
  DecodeWorldManifestResult,
  SplitWorldOptions,
  SplitWorldResult,
  WorldGrid,
  WorldManifest,
  WorldManifestShard,
  WorldQuery,
  WorldShardBounds,
  WorldShardResidency,
  WorldShardResolver,
  WorldStreamingConfig,
} from "./world";
export type { DecodeEditorDocumentResult } from "./document";
export {
  authoredLightsFromDocument,
  bakeLightProbe,
  colorGradeFromDocument,
  environmentContentFromDocument,
  lightProbesFromDocument,
  lightingFromDocument,
  lutCubeFromGrading,
  skyConfigFromEnvironment,
  skyFromDocument,
  terrainBoundsFromDocument,
} from "./environment";
export type { EnvironmentContent, EnvironmentContentOptions } from "./environment";
export type { DocumentColorGrade } from "./environment";
export { bakeMinimapFromDocument, documentBakeZones } from "./minimap";
export type { DocumentBakeOptions } from "./minimap";
export type {
  EditorDirective,
  EditorDirectiveArea,
  EditorDirectiveKind,
  EditorPopulationDirective,
  EditorPopulationSpecies,
  EditorScatterDirective,
} from "./types";
export {
  applyDirectiveOverlay,
  materializeDirective,
  materializeDirectives,
  materializePopulationDirective,
  materializeScatterDirective,
  resolveDirectiveFootprint,
} from "./directives";
/** The deterministic bake of scene directives into per-instance placements + sparse overlays. */
export type {
  DirectiveFootprint,
  DirectiveInstancePatch,
  EditorDirectiveOverlay,
  MaterializedInstance,
} from "./directives";
export { createEditorSession } from "./commands";
export { summarizeEditorSession } from "./commands";
export type { EditorCommand } from "./commands";
export type { EditorDispatchOptions } from "./commands";
export type { EditorSession } from "./commands";
export type { EditorSessionState } from "./commands";
/** Atomic command-batch outcome; a failure identifies the zero-based command index. */
export type { EditorTransactionResult } from "./commands";
export {
  applyDocumentPatch,
  applyRuntimeStateDelta,
  createDocumentLiveSync,
  getDocumentLiveSync,
  installDocumentLiveSync,
  runtimeEntityWriteBackCommand,
  subscribeDocumentLiveSyncInstall,
} from "./liveSync";
export type { DocumentPatch, ApplyDocumentPatchResult } from "./liveSync";
export type { DocumentLiveSync, DocumentLiveEvent } from "./liveSync";
export type { RuntimeEntityState, RuntimeStateDelta, RuntimeStateSnapshot } from "./liveSync";
export {
  createRuntimePlayControl,
  getRuntimeInspectorValue,
  planRuntimeInspectorSet,
  runtimeEntityMetaWriteBackCommand,
  summarizeRuntimeInspector,
} from "./runtimeInspector";
export type {
  RuntimeInspectorGetResult,
  RuntimeInspectorSetPlan,
  RuntimeInspectorSummary,
  RuntimePlayControl,
} from "./runtimeInspector";
export {
  CURRENT_GRID_SCHEMA_VERSION,
  cloneGridLayer,
  createGridLayer,
  eraseGridCell,
  eyedropGridCell,
  fillGridRect,
  findGridPaletteEntry,
  floodFillGrid,
  forEachGridCell,
  getGridCell,
  getGridCellAtWorld,
  gridCellCount,
  gridCellEntries,
  gridCellKey,
  gridCellToWorld,
  gridCellsOfValue,
  gridEmptyValue,
  gridGlyphMap,
  inLayerBounds,
  migrateGridLayer,
  paintGridCells,
  parseGridCellKey,
  resizeGridLayer,
  setGridCell,
  worldToGridCell,
} from "./grid";
export type { EditorGridAxes } from "./grid";
export type { EditorGridLayer } from "./grid";
export type { EditorGridPaletteEntry } from "./grid";
export type { EditorGridCell } from "./grid";
export type { EditorGridCellEdit } from "./grid";
export type { CreateGridLayerInit } from "./grid";
export {
  exportAsciiGrid,
  exportCsvGrid,
  importAsciiGrid,
  importCsvGrid,
} from "./gridAdapters";
export type { AsciiGridImportOptions } from "./gridAdapters";
export type { AsciiGridExportOptions } from "./gridAdapters";
export type { CsvGridImportOptions } from "./gridAdapters";
export type { CsvGridExportOptions } from "./gridAdapters";

