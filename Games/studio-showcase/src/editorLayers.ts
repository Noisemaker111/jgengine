import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored scene for this showcase — a `pole_line` power line, a `bookcase` generator marker, a
 * `water` pond volume, and a `grass_field` meadow volume. Every one is authored purely as editor
 * document data and rendered generically by `AuthoredScene`; nothing is hardcoded in game code. Open
 * F2+E to edit it live and Ctrl+S to save it back.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
