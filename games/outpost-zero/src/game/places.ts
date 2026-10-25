import type { EditorDocument } from "@jgengine/core/editor/index";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the base, the outposts and every guard post inside them.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export interface Spot {
  x: number;
  z: number;
}

export function baseMarker(doc: EditorDocument): Marker {
  const base = doc.markers.find((marker) => marker.kind === "home");
  if (base === undefined) throw new Error('editor.scene.json needs a marker of kind "home" (the base)');
  return base;
}

export function spawnMarker(doc: EditorDocument): Marker {
  return doc.markers.find((marker) => marker.kind === "player_spawn") ?? baseMarker(doc);
}

/** Every outpost's centre, by outpost id (`meta.outpost`). */
export function outpostSpots(doc: EditorDocument): Map<string, Spot> {
  const out = new Map<string, Spot>();
  for (const marker of doc.markers) {
    if (marker.kind !== "outpost") continue;
    out.set(String(metaOf(marker).outpost), { x: marker.position.x, z: marker.position.z });
  }
  return out;
}

/** One guard post: who stands there, for which outpost. Its marker id is the guard's entity id. */
export interface GuardPost extends Spot {
  id: string;
  outpost: string;
  enemy: string;
  rotationY: number;
}

export function guardPosts(doc: EditorDocument): GuardPost[] {
  return doc.markers
    .filter((marker) => marker.kind === "guard")
    .map((marker) => ({
      id: marker.id,
      outpost: String(metaOf(marker).outpost),
      enemy: String(metaOf(marker).enemy),
      x: marker.position.x,
      z: marker.position.z,
      rotationY: marker.rotationY ?? 0,
    }));
}
