import type { EditorDocument } from "@jgengine/core/editor/index";
import type { WorldGridDecl } from "@jgengine/core/worldModel/worldModel";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the headquarters and its build grid, the nodes colonists gather from, and the
 * camps raids come out of.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export function hqMarker(doc: EditorDocument): Marker {
  const hq = doc.markers.find((marker) => marker.kind === "hq");
  if (hq === undefined) throw new Error('editor.scene.json needs a marker of kind "hq"');
  return hq;
}

/** The build grid is centred on the headquarters; its size is the marker's `meta.grid` (cells) and `meta.cell` (metres). */
export function colonyGrid(doc: EditorDocument): WorldGridDecl {
  const hq = hqMarker(doc);
  const cells = Number(metaOf(hq).grid ?? 30);
  const cell = Number(metaOf(hq).cell ?? 2);
  return { cols: cells, rows: cells, cell, origin: [hq.position.x - (cells * cell) / 2, hq.position.z - (cells * cell) / 2] };
}

/** The cell a footprint of `size` would start at so it is centred on a world point, or null outside the grid. */
export function cellFor(grid: WorldGridDecl, x: number, z: number, size: readonly [number, number]): [number, number] | null {
  const cell = grid.cell ?? 1;
  const [ox, oz] = grid.origin ?? [0, 0];
  const col = Math.round((x - ox) / cell - size[0] / 2);
  const row = Math.round((z - oz) / cell - size[1] / 2);
  return col < 0 || row < 0 || col + size[0] > grid.cols || row + size[1] > grid.rows ? null : [col, row];
}

/** The headquarters' own footprint cell: the middle of the grid. */
export function hqCell(grid: WorldGridDecl, size: readonly [number, number]): [number, number] {
  return [Math.floor((grid.cols - size[0]) / 2), Math.floor((grid.rows - size[1]) / 2)];
}

/** Every gathering spot: a `node` marker naming its node word in `meta.node`. */
export function nodeMarkers(doc: EditorDocument): { id: string; node: string; x: number; z: number }[] {
  return doc.markers
    .filter((marker) => marker.kind === "node")
    .map((marker) => ({ id: marker.id, node: String(metaOf(marker).node ?? ""), x: marker.position.x, z: marker.position.z }));
}

/** Where raids come from. */
export function raidCamps(doc: EditorDocument): { x: number; z: number }[] {
  const camps = doc.markers.filter((marker) => marker.kind === "raid").map((marker) => ({ x: marker.position.x, z: marker.position.z }));
  if (camps.length === 0) throw new Error('editor.scene.json needs at least one marker of kind "raid"');
  return camps;
}

/** Starter layout for the capture state: `plan` markers naming a structure in `meta.structure`. */
export function planMarkers(doc: EditorDocument): { structure: string; x: number; z: number }[] {
  return doc.markers.filter((marker) => marker.kind === "plan").map((marker) => ({ structure: String(metaOf(marker).structure ?? ""), x: marker.position.x, z: marker.position.z }));
}
