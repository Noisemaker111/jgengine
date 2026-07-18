import {
  findEditorMarker,
  findEditorNote,
  findEditorPath,
  findEditorVolume,
  type EditorSession,
} from "@jgengine/core/editor/index";

/** Renames a placeable object by writing its label (notes use `text`). Returns false if unknown. @internal */
export function renameEditorObject(session: EditorSession, id: string, nextLabel: string): boolean {
  const label = nextLabel.trim();
  if (label.length === 0) return false;
  const doc = session.getState().document;
  if (findEditorMarker(doc, id) !== undefined) {
    session.dispatch({ type: "setMarker", id, patch: { label } });
    return true;
  }
  if (findEditorVolume(doc, id) !== undefined) {
    session.dispatch({ type: "setVolume", id, patch: { label } });
    return true;
  }
  if (findEditorPath(doc, id) !== undefined) {
    session.dispatch({ type: "setPath", id, patch: { label } });
    return true;
  }
  if (findEditorNote(doc, id) !== undefined) {
    session.dispatch({ type: "setNote", id, patch: { text: label } });
    return true;
  }
  return false;
}
