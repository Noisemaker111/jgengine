import { normalizeEditorLayers, type EditorDocument } from "@jgengine/core/editor/index";

export const editorLayers = (): EditorDocument => normalizeEditorLayers({
  markers: [{ id: "entry", kind: "player_spawn", position: { x: 2, y: 0, z: -3 } }],
  simulation: { weather: { ambient: { mode: "rain", intensity: 0.6 }, wind: { direction: [1, 0], speed: 3 } } },
});
