import { normalizeEditorLayers, type EditorDocument, type EditorLayersInput } from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The starter park — authored in the 3D editor (F2+E) and saved to `editor.scene.json`. Ride/stall/
 * scenery placements are `prop` markers carrying their `meta.catalogId`; the coaster's opening track
 * run is a `route` path. `setupWorld` reads this one document and instantiates each entry as a live,
 * removable buildable, so the seed park's coordinates live here once instead of in game code.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);
