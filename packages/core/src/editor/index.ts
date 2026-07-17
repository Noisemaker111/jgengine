/** The full authored scene: every marker, volume, path, and note for a game. */
export type { EditorDocument } from "./types";
/** A sculpted heightfield overlay stored on a document ΓÇö the terraform snapshot of offset deltas. */
export type { EditorTerrain } from "./types";
/** Per-kind show/hide flags for the editor's layer panel. */
export type { EditorKindVisibility } from "./types";
/** The four placeable-object collections a prefab fragment or clipboard fragment carries. */
export type { EditorFragmentContent } from "./types";
/** A serializable, reusable stamp of authored objects ΓÇö "make prefab" / "insert prefab" / detach. */
export type { EditorPrefab } from "./types";
/** A named, persisted list of object ids ΓÇö selection bookmark and/or locked production group. */
export type { EditorCollection } from "./types";
/** One row in a gameplay data catalog — id + optional label + meta matching the catalog schema. */
export type { EditorCatalogEntry } from "./types";
/** Persisted values for one gameplay data catalog on the scene document. */
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
/** Accepted shape for a game's `editorCatalogs` export: definitions, or a factory. */
export type { EditorCatalogsInput } from "./types";
/** Accepted shape for a game's `editorLayers` export: a document, partial data, or a factory. */
export type { EditorLayersInput } from "./types";
/** A placeable point object in the scene ΓÇö spawn, mob, chest, POI, etc. */
export type { EditorMarker } from "./types";
/** A free-text annotation pinned to a world position for designers. */
export type { EditorNote } from "./types";
/** A polyline of points ΓÇö road, corridor, patrol route ΓÇö placed in the scene. */
export type { EditorPath } from "./types";
/** A world-space point used across editor markers, volumes, and paths. */
export type { EditorVec3 } from "./types";
/** A spatial region ΓÇö zone, aggro range, capture area ΓÇö placed in the scene. */
export type { EditorVolume } from "./types";
/** Collision shape a volume is rendered and tested as. */
export type { EditorVolumeShape } from "./types";
/** HUD layout section on the scene document — panel id → anchor/offset/size/visibility. */
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
  importEditorDocumentJson,
  isEditorObjectLocked,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
  seedEditorCatalogs,
  wouldCreateCycle,
} from "./document";
/** One field-level failure surfaced while decoding an untrusted editor document. */
export type { EditorDocumentDiagnostic } from "./document";
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
/** A sharded world manifest (`world.json`): grid + shard list + streaming config. */
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
/** Result of {@link decodeEditorDocument}: a typed document, or every diagnostic collected while decoding it. */
export type { DecodeEditorDocumentResult } from "./document";
/** Creates an editor session with undo/redo history seeded from an initial document. */
export { createEditorSession } from "./commands";
/** Compact snapshot of a session state ΓÇö counts, selection, and the selected object. */
export { summarizeEditorSession } from "./commands";
/** A single editor mutation ΓÇö select, move, add, remove, undo/redo ΓÇö dispatched to a session. */
export type { EditorCommand } from "./commands";
/** Per-dispatch options; `coalesce` merges consecutive same-key edits into one undo step. */
export type { EditorDispatchOptions } from "./commands";
/** Stateful, undoable handle for driving scene edits from UI or an MCP agent. */
export type { EditorSession } from "./commands";
/** The document plus current selection at a point in editor history. */
export type { EditorSessionState } from "./commands";
export {
  applyDocumentPatch,
  applyRuntimeStateDelta,
  createDocumentLiveSync,
  getDocumentLiveSync,
  installDocumentLiveSync,
  runtimeEntityWriteBackCommand,
  subscribeDocumentLiveSyncInstall,
} from "./liveSync";
/** Versioned document mutation on the editorΓåöruntime live-sync stream. */
export type { DocumentPatch, ApplyDocumentPatchResult } from "./liveSync";
/** Two-way live-sync bus: document patches out, runtime state deltas back. */
export type { DocumentLiveSync, DocumentLiveEvent } from "./liveSync";
/** Ephemeral runtime entity/tunable state streamed on the reverse channel. */
export type { RuntimeEntityState, RuntimeStateDelta, RuntimeStateSnapshot } from "./liveSync";
export {
  consumeRuntimePlayStep,
  createRuntimePlayControl,
  getRuntimeInspectorValue,
  planRuntimeInspectorSet,
  runtimeEntityMetaWriteBackCommand,
  summarizeRuntimeInspector,
} from "./runtimeInspector";
/** Play-mode sim gate and reverse-channel inspector summary/get/set pure helpers. */
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
  inGridBounds,
  migrateGridLayer,
  paintGridCells,
  parseGridCellKey,
  resizeGridLayer,
  setGridCell,
  worldToGridCell,
} from "./grid";
/** How a grid layer's columns and rows map onto world axes (`"xz"` top-down, `"xy"` side view). */
export type { EditorGridAxes } from "./grid";
/** A sparse, editor-owned tile grid serialized on the scene document. */
export type { EditorGridLayer } from "./grid";
/** One selectable value in a grid layer's palette — value id, glyph, color, and typed payload. */
export type { EditorGridPaletteEntry } from "./grid";
/** One resolved cell of a grid layer — its column, row, and value id. */
export type { EditorGridCell } from "./grid";
/** A single paint/erase edit: set cell `col,row` to `value` (empty value erases). */
export type { EditorGridCellEdit } from "./grid";
/** Fields accepted when constructing a grid layer via `createGridLayer`. */
export type { CreateGridLayerInit } from "./grid";
export {
  exportAsciiGrid,
  exportCsvGrid,
  importAsciiGrid,
  importCsvGrid,
} from "./gridAdapters";
/** Options for importing an ASCII/glyph map into a grid layer. */
export type { AsciiGridImportOptions } from "./gridAdapters";
/** Options for rendering a grid layer back out as an ASCII/glyph map. */
export type { AsciiGridExportOptions } from "./gridAdapters";
/** Options for importing a CSV grid (one value id per cell) into a grid layer. */
export type { CsvGridImportOptions } from "./gridAdapters";
/** Options for exporting a grid layer as CSV. */
export type { CsvGridExportOptions } from "./gridAdapters";
