export type MaterialObjectKind = "marker" | "volume" | "path";

export interface MaterialAssignmentRow {
  id: string;
  label: string;
  kind: string;
  objectKind: MaterialObjectKind;
  /** Present material id, or null when none is assigned. */
  materialId: string | null;
}

export interface MaterialDocumentSlice {
  markers: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
  volumes: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
  paths: readonly { id: string; kind: string; label?: string; meta?: Record<string, unknown> }[];
}

export type MaterialAssignmentFilter =
  | "all"
  | "assigned"
  | "unassigned"
  | { materialId: string };

function readMaterialId(meta: Record<string, unknown> | undefined): string | null {
  const value = meta?.["materialId"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** @internal */
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

/** @internal */
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

/** @internal */
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
