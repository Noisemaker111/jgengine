import {
  collectDescendants,
  type EditorDocument,
} from "@jgengine/core/editor/index";

/** One option in the Parent-to… picker / inspector parent field. @internal */
export interface ParentCandidate {
  id: string;
  label: string;
}

/**
 * Placeable objects that may become parents of every id in `childIds` without creating a cycle:
 * excludes the children themselves and all of their descendants.
 * @internal
 */
export function listParentCandidates(
  document: EditorDocument,
  childIds: readonly string[],
): ParentCandidate[] {
  if (childIds.length === 0) return [];
  const banned = collectDescendants(document, childIds);
  for (const id of childIds) banned.add(id);

  const labelOf = (node: { id: string; label?: string }) => node.label ?? node.id;
  const candidates: ParentCandidate[] = [
    ...document.markers.map((m) => ({ id: m.id, label: labelOf(m) })),
    ...document.volumes.map((v) => ({ id: v.id, label: labelOf(v) })),
    ...document.paths.map((p) => ({ id: p.id, label: labelOf(p) })),
    ...document.annotations.map((n) => ({
      id: n.id,
      label: n.text.slice(0, 30) || n.id,
    })),
  ].filter((entry) => !banned.has(entry.id));

  candidates.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return candidates;
}
