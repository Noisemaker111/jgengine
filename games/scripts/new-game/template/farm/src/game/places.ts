import type { EditorDocument } from "@jgengine/core/editor/index";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the cottage, the plots in their rows, the stall, the village market, the
 * fishing spots on the shore, and where villagers and animals wander.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export interface Spot {
  id: string;
  x: number;
  z: number;
  rotationY: number;
}

const spotOf = (marker: Marker): Spot => ({ id: marker.id, x: marker.position.x, z: marker.position.z, rotationY: marker.rotationY ?? 0 });

function one(doc: EditorDocument, kind: string): Spot {
  const marker = doc.markers.find((entry) => entry.kind === kind);
  if (marker === undefined) throw new Error(`editor.scene.json needs a marker of kind "${kind}"`);
  return spotOf(marker);
}

export const homeSpot = (doc: EditorDocument) => one(doc, "home");
export const stallSpot = (doc: EditorDocument) => one(doc, "stall");
export const marketSpot = (doc: EditorDocument) => one(doc, "market");
export const spawnSpot = (doc: EditorDocument) => one(doc, "player_spawn");

/** Every plot, in the order they open: `meta.plot` is its number from 1. */
export function plotSpots(doc: EditorDocument): (Spot & { index: number })[] {
  return doc.markers
    .filter((marker) => marker.kind === "plot")
    .map((marker) => ({ ...spotOf(marker), index: Number(metaOf(marker).plot ?? 0) }))
    .sort((a, b) => a.index - b.index);
}

export const fishingSpots = (doc: EditorDocument): Spot[] => doc.markers.filter((marker) => marker.kind === "fishing").map(spotOf);

/** Villagers stand at a `villager` marker naming them in `meta.villager`. */
export function villagerSpots(doc: EditorDocument): (Spot & { villager: string })[] {
  return doc.markers.filter((marker) => marker.kind === "villager").map((marker) => ({ ...spotOf(marker), villager: String(metaOf(marker).villager) }));
}

/** Animals graze at `herd` markers; `meta.animal` is the index into `idea.animals`. */
export function herdSpots(doc: EditorDocument): (Spot & { animal: number })[] {
  return doc.markers.filter((marker) => marker.kind === "herd").map((marker) => ({ ...spotOf(marker), animal: Number(metaOf(marker).animal ?? 0) }));
}

/** Signposts: E at one walks you down the road to the `sign` marker's `meta.to` place (a fishing spot, the market, the farm). */
export function signSpots(doc: EditorDocument): (Spot & { to: string; label: string })[] {
  return doc.markers.filter((marker) => marker.kind === "sign").map((marker) => ({ ...spotOf(marker), to: String(metaOf(marker).to), label: marker.label ?? "Signpost" }));
}

/** Where a road ends: a marker by id, standing as it faces. */
export function placeById(doc: EditorDocument, id: string): Spot | null {
  const marker = doc.markers.find((entry) => entry.id === id);
  return marker === undefined ? null : spotOf(marker);
}
