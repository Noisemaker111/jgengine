import { normalizeEditorLayers, type EditorLayersInput } from "@jgengine/core/editor/index";
import sceneJson from "./editor.scene.json";

/** Opening haul surfaces, authored through the editor's soil studio. */
export const editorLayers = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
