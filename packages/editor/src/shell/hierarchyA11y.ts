import type { OutlinerFlatRow } from "../outlinerModel";

/**
 * Stable DOM id for a hierarchy treeitem so the virtualized list can expose
 * `aria-activedescendant` while keyboard focus stays on the tree container.
 *
 * @internal
 */
export function hierarchyRowDomId(objectId: string): string {
  return `hierarchy-row-${objectId}`;
}

/**
 * Object ids that arrow-key navigation can land on (skips kind group headers).
 *
 * @internal
 */
export function selectableIds(rows: readonly OutlinerFlatRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.type === "kindItem") ids.push(row.ids[0]!);
    else if (row.type === "treeItem") ids.push(row.id);
  }
  return ids;
}

/**
 * Resolve `aria-activedescendant` for the hierarchy tree. Pure helper so tests can lock the
 * contract without mounting the virtualized panel.
 *
 * @internal
 */
export function hierarchyActiveDescendantId(
  activeId: string | null,
  navigableIds: readonly string[],
): string | undefined {
  if (activeId !== null && navigableIds.includes(activeId)) return hierarchyRowDomId(activeId);
  return undefined;
}
