import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/** LLMville's authored scene: the Commons and its furniture (the endless datacenter is runtime-owned, see scene-ownership.json). */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
