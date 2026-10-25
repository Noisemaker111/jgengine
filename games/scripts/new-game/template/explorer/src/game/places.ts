import type { EditorDocument } from "@jgengine/core/editor/index";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the start, every landmark and the shrine its relic or goal stands on.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export interface LandmarkPlace {
  id: string;
  x: number;
  z: number;
  /** Metres from the centre that count as having reached it. */
  radius: number;
}

/** Every `landmark` marker, keyed by the landmark id in its `meta.landmark`. */
export function landmarkPlaces(doc: EditorDocument): LandmarkPlace[] {
  return doc.markers
    .filter((marker) => marker.kind === "landmark")
    .map((marker) => ({ id: String(metaOf(marker).landmark), x: marker.position.x, z: marker.position.z, radius: Number(metaOf(marker).radius ?? 10) }));
}

/** The shrine a landmark's relic (or the goal) sits on: a `shrine` marker naming its landmark. */
export function shrineOf(doc: EditorDocument, landmark: string): { x: number; z: number } | null {
  const marker = doc.markers.find((entry) => entry.kind === "shrine" && metaOf(entry).landmark === landmark);
  return marker === undefined ? null : { x: marker.position.x, z: marker.position.z };
}

export function spawnMarker(doc: EditorDocument): { x: number; z: number; rotationY: number } {
  const spawn = doc.markers.find((marker) => marker.kind === "player_spawn");
  if (spawn === undefined) throw new Error("editor.scene.json needs a marker of kind \"player_spawn\"");
  return { x: spawn.position.x, z: spawn.position.z, rotationY: spawn.rotationY ?? 0 };
}
