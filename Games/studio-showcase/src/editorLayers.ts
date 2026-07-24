import { normalizeEditorLayers, type EditorDocument } from "@jgengine/shell/gameKit";

import { registerExampleStudios } from "@jgengine-examples/studios";

import sceneJson from "./editor.scene.json";

// Register the example studio adopters (bookcase) from the dev runner / game only — they live in
// examples/studios and touch no engine package. The engine environment kinds (water, grass_field,
// soil, pole_line) register themselves inside the shell's authored-scene renderer. This one call
// lights up the whole seam.
registerExampleStudios();

/**
 * The authored scene for this showcase — a `pole_line` power line, a `bookcase` generator marker, a
 * `water` pond volume, and a `grass_field` meadow volume. Every one is authored purely as editor
 * document data and rendered generically by the shell's authored-scene renderer (auto-mounted via
 * `defineGame({ editorLayers })`); nothing is hardcoded in game code. Open F2+E to edit it live and
 * Ctrl+S to save it back.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorDocument);
