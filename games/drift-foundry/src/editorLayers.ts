import { normalizeEditorLayers, type EditorLayersInput } from "@jgengine/core/editor/index";
import sceneJson from "./editor.scene.json";

export const editorLayers = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
