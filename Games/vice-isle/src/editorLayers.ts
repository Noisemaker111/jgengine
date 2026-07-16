import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The authored city scene — district footprints, the street grid, the race loop, and every gameplay
 * POI live in `editor.scene.json`, editable in the 3D editor (F2+E, Ctrl+S). Game code derives every
 * coordinate from this one document (see `game/world/districts.ts`); nothing is hardcoded twice.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
