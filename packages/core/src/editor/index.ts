/** The full authored scene: every marker, volume, path, and note for a game. */
export type { EditorDocument } from "./types";
/** Per-kind show/hide flags for the editor's layer panel. */
export type { EditorKindVisibility } from "./types";
/** Accepted shape for a game's `editorLayers` export: a document, partial data, or a factory. */
export type { EditorLayersInput } from "./types";
/** A placeable point object in the scene — spawn, mob, chest, POI, etc. */
export type { EditorMarker } from "./types";
/** A free-text annotation pinned to a world position for designers. */
export type { EditorNote } from "./types";
/** A polyline of points — road, corridor, patrol route — placed in the scene. */
export type { EditorPath } from "./types";
/** A world-space point used across editor markers, volumes, and paths. */
export type { EditorVec3 } from "./types";
/** A spatial region — zone, aggro range, capture area — placed in the scene. */
export type { EditorVolume } from "./types";
/** Collision shape a volume is rendered and tested as. */
export type { EditorVolumeShape } from "./types";
export {
  WELL_KNOWN_MARKER_KINDS,
  WELL_KNOWN_PATH_KINDS,
  WELL_KNOWN_VOLUME_KINDS,
} from "./types";
export {
  applyEditorDocumentOverlay,
  cloneEditorDocument,
  createEmptyEditorDocument,
  editorDocumentBounds,
  exportEditorDocumentJson,
  findEditorMarker,
  findEditorNote,
  findEditorPath,
  findEditorVolume,
  importEditorDocumentJson,
  listEditorKinds,
  mergeEditorDocuments,
  normalizeEditorLayers,
} from "./document";
/** Creates an editor session with undo/redo history seeded from an initial document. */
export { createEditorSession } from "./commands";
/** Compact snapshot of a session state — counts, selection, and the selected object. */
export { summarizeEditorSession } from "./commands";
/** A single editor mutation — select, move, add, remove, undo/redo — dispatched to a session. */
export type { EditorCommand } from "./commands";
/** Per-dispatch options; `coalesce` merges consecutive same-key edits into one undo step. */
export type { EditorDispatchOptions } from "./commands";
/** Stateful, undoable handle for driving scene edits from UI or an MCP agent. */
export type { EditorSession } from "./commands";
/** The document plus current selection at a point in editor history. */
export type { EditorSessionState } from "./commands";
