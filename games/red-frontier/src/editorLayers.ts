import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored scene: spawn, home, gather nodes, herds, lairs, scenery and the ground's shape.
 * Edit it in the editor (F2+E; Ctrl+S saves back to editor.scene.json), never as coordinates in code.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
