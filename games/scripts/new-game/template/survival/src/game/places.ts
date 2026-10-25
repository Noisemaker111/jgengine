import type { EditorDocument } from "@jgengine/core/editor/index";
import type { WorldGridDecl } from "@jgengine/core/worldModel/worldModel";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the home marker, the camp grid around it, the gather nodes, the herds and the
 * places waves come from.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export function homeMarker(doc: EditorDocument): Marker {
  const home = doc.markers.find((marker) => marker.kind === "home");
  if (home === undefined) throw new Error("editor.scene.json needs a marker of kind \"home\"");
  return home;
}

/** The build grid is centred on home; its size is the home marker's `meta.grid` (cells) and `meta.cell` (metres). */
export function campGrid(doc: EditorDocument): WorldGridDecl {
  const home = homeMarker(doc);
  const cells = Number(metaOf(home).grid ?? 14);
  const cell = Number(metaOf(home).cell ?? 2);
  return { cols: cells, rows: cells, cell, origin: [home.position.x - (cells * cell) / 2, home.position.z - (cells * cell) / 2] };
}

export function nodeMarkers(doc: EditorDocument): { id: string; node: string; x: number; z: number }[] {
  return doc.markers
    .filter((marker) => typeof metaOf(marker).node === "string")
    .map((marker) => ({ id: marker.id, node: String(metaOf(marker).node), x: marker.position.x, z: marker.position.z }));
}

export function herdMarkers(doc: EditorDocument): { id: string; ally: string; x: number; z: number }[] {
  return doc.markers
    .filter((marker) => typeof metaOf(marker).ally === "string")
    .map((marker) => ({ id: marker.id, ally: String(metaOf(marker).ally), x: marker.position.x, z: marker.position.z }));
}

/** Where waves come from: every `lair` marker. */
export function lairs(doc: EditorDocument): { x: number; z: number }[] {
  return doc.markers.filter((marker) => marker.kind === "lair").map((marker) => ({ x: marker.position.x, z: marker.position.z }));
}

/** The grid cell a world point falls in, or null outside the camp. */
export function cellAt(grid: WorldGridDecl, x: number, z: number): [number, number] | null {
  const cell = grid.cell ?? 1;
  const [ox, oz] = grid.origin ?? [0, 0];
  const col = Math.floor((x - ox) / cell);
  const row = Math.floor((z - oz) / cell);
  return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ? null : [col, row];
}
