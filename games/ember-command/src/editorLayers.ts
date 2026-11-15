import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import { sceneSet, type MapId } from "./maps";

/**
 * The live lawn's authored scene — nests, food, landmarks, hazards, scatter and terrain. Each lawn is
 * its own document in the scene set (`maps.ts`); edit one in the editor (F2+E) or with the editor
 * CLI's `--scene <file>` instead of hand-editing the JSON or hardcoding coordinates in game code.
 *
 * A live binding: `bindScene` rebinds it when the set switches lawns, and every module importing it
 * sees the new yard.
 */
function layersFor(id: MapId): EditorDocument {
  return normalizeEditorLayers(sceneSet.entry(id).document as unknown as EditorDocument);
}

export let editorLayers: EditorDocument = layersFor(sceneSet.active());

/** Rebind the scene document to another lawn (the scene set switched). */
export function bindScene(id: MapId): void {
  editorLayers = layersFor(id);
}
