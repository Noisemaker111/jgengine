/**
 * Document-wide material assignment inventory for the Materials workspace.
 * Reads real `meta.materialId` stamps from placeables — no thumbnails or faked previews.
 */

/** Placeable families that carry `meta.materialId` under assign_material. */
export type MaterialObjectKind = "marker" | "volume" | "path";

/** One object row in the materials workspace browser. */
export interface MaterialAssignmentRow {
  id: string;
  label: string;
  kind: string;
  objectKind: MaterialObjectKind;
  /** Present material id, or null when none is assigned. */
  materialId: string | null;
}

/** Minimal document slice the materials inventory needs. */
export interface MaterialDocumentSlice {
  markers: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
  volumes: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
  paths: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
}

/** Filter for {@link filterMaterialAssignments}. */
export type MaterialAssignmentFilter =
  | "all"
  | "assigned"
  | "unassigned"
  | { materialId: string };

function readMaterialId(meta: Record<string, unknown> | undefined): string | null {
  const value = meta?.["materialId"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Lists every marker/volume/path with its current material assignment (or null).
 * Order is document order: markers, then volumes, then paths.
 *
 * @internal
 */
export function listMaterialAssignments(document: MaterialDocumentSlice): MaterialAssignmentRow[] {
  const rows: MaterialAssignmentRow[] = [];
  for (const marker of document.markers) {
    rows.push({
      id: marker.id,
      label: marker.label ?? marker.id,
      kind: marker.kind,
      objectKind: "marker",
      materialId: readMaterialId(marker.meta),
    });
  }
  for (const volume of document.volumes) {
    rows.push({
      id: volume.id,
      label: volume.label ?? volume.id,
      kind: volume.kind,
      objectKind: "volume",
      materialId: readMaterialId(volume.meta),
    });
  }
  for (const path of document.paths) {
    rows.push({
      id: path.id,
      label: path.label ?? path.id,
      kind: path.kind,
      objectKind: "path",
      materialId: readMaterialId(path.meta),
    });
  }
  return rows;
}

/**
 * Filters material rows by text query (id/label/kind/materialId) and optional assignment filter.
 * Case-insensitive; empty query is a no-op on text.
 *
 * @internal
 */
export function filterMaterialAssignments(
  rows: readonly MaterialAssignmentRow[],
  query: string,
  filter: MaterialAssignmentFilter = "all",
): MaterialAssignmentRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "assigned" && row.materialId === null) return false;
    if (filter === "unassigned" && row.materialId !== null) return false;
    if (typeof filter === "object" && row.materialId !== filter.materialId) return false;
    if (needle.length === 0) return true;
    return (
      row.id.toLowerCase().includes(needle) ||
      row.label.toLowerCase().includes(needle) ||
      row.kind.toLowerCase().includes(needle) ||
      (row.materialId !== null && row.materialId.toLowerCase().includes(needle))
    );
  });
}

/**
 * Aggregates how many placeables use each material id (assigned only). Sorted by count desc, then id.
 *
 * @internal
 */
export function summarizeMaterialUsage(
  rows: readonly MaterialAssignmentRow[],
): readonly { materialId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.materialId === null) continue;
    counts.set(row.materialId, (counts.get(row.materialId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([materialId, count]) => ({ materialId, count }))
    .sort((a, b) => b.count - a.count || a.materialId.localeCompare(b.materialId));
}
