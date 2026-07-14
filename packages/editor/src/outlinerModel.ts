import { editorChildren, editorRoots, type EditorDocument } from "@jgengine/core/editor/index";

/** A distinct label under a kind, backing one or more object ids (×N dedup rows). */
export interface OutlinerRow {
  label: string;
  ids: string[];
}

/** A kind group in the "By kind" outliner view. */
export interface OutlinerGroup {
  kind: string;
  rows: OutlinerRow[];
  total: number;
}

interface OutlinerDocument {
  markers: readonly { id: string; kind: string; label?: string }[];
  volumes: readonly { id: string; kind: string; label?: string }[];
  paths: readonly { id: string; kind: string; label?: string }[];
  annotations: readonly { id: string; text: string }[];
}

/** Groups every object by kind, deduping identical labels into ×N rows.
 * @internal — outliner rendering helper. */
export function buildOutlinerGroups(document: OutlinerDocument): OutlinerGroup[] {
  const byKind = new Map<string, Map<string, OutlinerRow>>();
  const push = (kind: string, label: string, id: string) => {
    let labels = byKind.get(kind);
    if (labels === undefined) {
      labels = new Map();
      byKind.set(kind, labels);
    }
    const row = labels.get(label);
    if (row === undefined) labels.set(label, { label, ids: [id] });
    else row.ids.push(id);
  };
  for (const marker of document.markers) push(marker.kind, marker.label ?? marker.id, marker.id);
  for (const volume of document.volumes) push(volume.kind, volume.label ?? volume.id, volume.id);
  for (const path of document.paths) push(path.kind, path.label ?? path.id, path.id);
  for (const note of document.annotations) push("note", note.text.slice(0, 40) || note.id, note.id);
  return [...byKind.entries()]
    .map(([kind, labels]) => {
      const rows = [...labels.values()];
      return { kind, rows, total: rows.reduce((sum, row) => sum + row.ids.length, 0) };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** Filters groups by a case-insensitive query against kind and row labels.
 * @internal — outliner rendering helper. */
export function filterOutlinerGroups(groups: readonly OutlinerGroup[], query: string): OutlinerGroup[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...groups];
  return groups
    .map((group) => {
      const kindMatches = group.kind.toLowerCase().includes(normalized);
      const rows = kindMatches
        ? group.rows
        : group.rows.filter((row) => row.label.toLowerCase().includes(normalized));
      return { ...group, rows, total: rows.reduce((sum, row) => sum + row.ids.length, 0) };
    })
    .filter((group) => group.rows.length > 0);
}

/** One rendered outliner line — a kind header, a deduped kind row, or a hierarchy tree node. */
export type OutlinerFlatRow =
  | { type: "group"; key: string; kind: string; total: number; collapsed: boolean }
  | { type: "kindItem"; key: string; kind: string; label: string; ids: string[] }
  | { type: "treeItem"; key: string; id: string; label: string; kind: string; depth: number; hasChildren: boolean };

/** How the outliner is displayed and folded — the state a flat row list is built from. */
export interface OutlinerViewState {
  view: "kind" | "tree";
  query: string;
  collapsedKinds: Record<string, boolean>;
  collapsedNodes: Record<string, boolean>;
}

function objectLabels(document: EditorDocument): Map<string, { label: string; kind: string }> {
  const label = new Map<string, { label: string; kind: string }>();
  for (const marker of document.markers) label.set(marker.id, { label: marker.label ?? marker.id, kind: marker.kind });
  for (const volume of document.volumes) label.set(volume.id, { label: volume.label ?? volume.id, kind: volume.kind });
  for (const path of document.paths) label.set(path.id, { label: path.label ?? path.id, kind: path.kind });
  for (const note of document.annotations) label.set(note.id, { label: note.text.slice(0, 40) || note.id, kind: "note" });
  return label;
}

/**
 * Flattens either outliner view into a single uniform row list (headers + rows / nested tree nodes),
 * honoring the query and collapse state — the input a fixed-height virtual list windows over, so the
 * DOM never holds more than the visible slice regardless of scene size.
 * @internal — outliner rendering helper.
 */
export function flattenOutliner(document: EditorDocument, state: OutlinerViewState): OutlinerFlatRow[] {
  if (state.view === "tree") {
    const labels = objectLabels(document);
    const rows: OutlinerFlatRow[] = [];
    const visit = (id: string, depth: number) => {
      const info = labels.get(id) ?? { label: id, kind: "?" };
      const children = editorChildren(document, id).sort((a, b) =>
        (labels.get(a)?.label ?? a).localeCompare(labels.get(b)?.label ?? b),
      );
      rows.push({ type: "treeItem", key: id, id, label: info.label, kind: info.kind, depth, hasChildren: children.length > 0 });
      if (state.collapsedNodes[id] === true) return;
      for (const child of children) visit(child, depth + 1);
    };
    for (const root of editorRoots(document)) visit(root, 0);
    return rows;
  }

  const groups = filterOutlinerGroups(buildOutlinerGroups(document), state.query);
  const rows: OutlinerFlatRow[] = [];
  for (const group of groups) {
    const collapsed = state.collapsedKinds[group.kind] === true;
    rows.push({ type: "group", key: `g:${group.kind}`, kind: group.kind, total: group.total, collapsed });
    if (collapsed) continue;
    for (const row of group.rows) rows.push({ type: "kindItem", key: `${group.kind}:${row.label}`, kind: group.kind, label: row.label, ids: row.ids });
  }
  return rows;
}
