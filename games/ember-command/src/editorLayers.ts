import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored scene for this game — spawn, props, and everything you place later (paths, zones,
 * terrain, foliage). Edit it in the editor (F2+E; Ctrl+S saves back to editor.scene.json) instead
 * of hand-editing the JSON or hardcoding coordinates in game code.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
