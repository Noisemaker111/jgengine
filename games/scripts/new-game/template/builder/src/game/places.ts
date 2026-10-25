import type { EditorDocument } from "@jgengine/core/editor/index";
import type { WorldGridDecl } from "@jgengine/core/worldModel/worldModel";

/**
 * Where things are comes from the authored scene (`editor.scene.json`, edited with F2+E), never from
 * coordinates in code: the seat the realm starts from and the build grid around it.
 */
type Marker = EditorDocument["markers"][number];

const metaOf = (marker: Marker) => (marker.meta ?? {}) as Record<string, unknown>;

export function seatMarker(doc: EditorDocument): Marker {
  const seat = doc.markers.find((marker) => marker.kind === "seat");
  if (seat === undefined) throw new Error("editor.scene.json needs a marker of kind \"seat\"");
  return seat;
}

/** The build grid is centred on the seat; its size is the seat marker's `meta.grid` (cells) and `meta.cell` (metres). */
export function realmGrid(doc: EditorDocument): WorldGridDecl {
  const seat = seatMarker(doc);
  const cells = Number(metaOf(seat).grid ?? 30);
  const cell = Number(metaOf(seat).cell ?? 2);
  return { cols: cells, rows: cells, cell, origin: [seat.position.x - (cells * cell) / 2, seat.position.z - (cells * cell) / 2] };
}

/** The cell a footprint of `size` would start at so it is centred on a world point, or null outside the grid. */
export function cellFor(grid: WorldGridDecl, x: number, z: number, size: readonly [number, number]): [number, number] | null {
  const cell = grid.cell ?? 1;
  const [ox, oz] = grid.origin ?? [0, 0];
  const col = Math.round((x - ox) / cell - size[0] / 2);
  const row = Math.round((z - oz) / cell - size[1] / 2);
  return col < 0 || row < 0 || col + size[0] > grid.cols || row + size[1] > grid.rows ? null : [col, row];
}

/** The seat's own footprint cell: the middle of the grid. */
export function seatCell(grid: WorldGridDecl, size: readonly [number, number]): [number, number] {
  return [Math.floor((grid.cols - size[0]) / 2), Math.floor((grid.rows - size[1]) / 2)];
}
