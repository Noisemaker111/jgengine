import {
  normalizeEditorLayers,
  type EditorDocument,
  type EditorLayersInput,
  type EditorMarker,
  type EditorVolume,
} from "@jgengine/core/editor/index";

import sceneJson from "./editor.scene.json";

/**
 * The escape route, authored in the 3D editor (F2+E) and saved to `editor.scene.json`. Every route
 * gate, debris pickup, and the exit are `prop`/`goal` markers carrying gameplay metadata; the three
 * zone bounds are `zone` box volumes. The route's coordinates live here once — gate blocking, pickup
 * collection, zone lookup, and the barricade/marker render all read this one document.
 */
export const editorLayers: EditorDocument = normalizeEditorLayers(sceneJson as unknown as EditorLayersInput);

/** Markers tagged with `meta.group` — gates, pickups, the exit — in authored order. */
export function markersInGroup(group: string): readonly EditorMarker[] {
  return editorLayers.markers.filter((marker) => marker.meta?.["group"] === group);
}

/** Volumes of a given kind (the route's `zone` bounds) in authored order. */
export function volumesOfKind(kind: string): readonly EditorVolume[] {
  return editorLayers.volumes.filter((volume) => volume.kind === kind);
}

/** The z of the authored exit-gate marker — the run's finish line. */
export function exitZ(): number {
  const exit = markersInGroup("exit")[0];
  if (exit === undefined) throw new Error("wreckway: editor.scene.json missing the exit marker");
  return exit.position.z;
}
