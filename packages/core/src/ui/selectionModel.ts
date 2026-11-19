export interface EntityVital {
  id: string;
  label?: string;
  current: number;
  max: number;
  tone?: string;
}

export interface EntitySummaryDef {
  id: string;
  name?: string;
  /** Type/catalog id a large selection is bucketed by; falls back to `"unit"` when omitted. */
  kind?: string;
  icon?: string;
  vitals?: readonly EntityVital[];
  tags?: readonly string[];
  /** Ownership / faction tint id, caller-owned. */
  owner?: string;
}

export interface SelectionGroup {
  kind: string;
  label: string;
  icon?: string;
  count: number;
  ids: readonly string[];
}

export interface SelectionView {
  count: number;
  primary: EntitySummaryDef | null;
  members: readonly EntitySummaryDef[];
  groups: readonly SelectionGroup[];
  focusIndex: number;
  grouped: boolean;
}

export interface SummarizeSelectionOptions {
  primaryId?: string;
  focusIndex?: number;
  groupThreshold?: number;
  /** Map a `kind` to a display label for its group (default: the kind itself). */
  labelOf?: (kind: string) => string;
}

/**
 * Summarize a selected-entity list into a {@link SelectionView}: resolve the primary focus, keep the
 * ordered members, and bucket them by `kind`. Pure and stable — deterministic group ordering and a
 * clamped focus index, so it is safe to call every render and to assert on in a test.
 */
export function summarizeSelection(
  members: readonly EntitySummaryDef[],
  options?: SummarizeSelectionOptions,
): SelectionView {
  const count = members.length;
  const threshold = options?.groupThreshold ?? 12;
  const labelOf = options?.labelOf ?? ((kind: string) => kind);
  let focusIndex = -1;
  if (options?.primaryId !== undefined) {
    focusIndex = members.findIndex((m) => m.id === options.primaryId);
  }
  if (focusIndex < 0) focusIndex = options?.focusIndex ?? 0;
  focusIndex = count === 0 ? -1 : Math.max(0, Math.min(count - 1, focusIndex));
  const primary = focusIndex < 0 ? null : (members[focusIndex] ?? null);
  return {
    count,
    primary,
    members,
    groups: groupSelection(members, labelOf),
    focusIndex,
    grouped: count > threshold,
  };
}

/** @internal Bucket members by `kind` into count-desc, label-asc ordered {@link SelectionGroup}s. */
function groupSelection(
  members: readonly EntitySummaryDef[],
  labelOf: (kind: string) => string,
): SelectionGroup[] {
  // Map iteration follows insertion order, so groups come out in first-seen order.
  const byKind = new Map<string, { icon: string | undefined; ids: string[] }>();
  for (const member of members) {
    const kind = member.kind ?? "unit";
    const bucket = byKind.get(kind) ?? { icon: member.icon, ids: [] };
    byKind.set(kind, bucket);
    bucket.ids.push(member.id);
  }
  const groups: SelectionGroup[] = [...byKind].map(([kind, bucket]) => {
    const group: SelectionGroup = { kind, label: labelOf(kind), count: bucket.ids.length, ids: bucket.ids };
    if (bucket.icon !== undefined) group.icon = bucket.icon;
    return group;
  });
  groups.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  return groups;
}

export type SelectionFocusDirection = "next" | "prev" | "first" | "last";

export function moveSelectionFocus(count: number, current: number, dir: SelectionFocusDirection): number {
  if (count <= 0) return -1;
  if (dir === "first") return 0;
  if (dir === "last") return count - 1;
  if (current < 0) return dir === "prev" ? count - 1 : 0;
  if (dir === "next") return (current + 1) % count;
  return (current - 1 + count) % count;
}

export interface SelectionWindow {
  start: number;
  end: number;
  items: readonly EntitySummaryDef[];
}

/**
 * Compute a virtualization window over a large selection: a `size`-length slice starting near
 * `scroll`, clamped so the window never runs past the end. Render only `items`, offsetting by
 * `start * itemSize`, to keep a thousand-unit selection from mounting a thousand portraits.
 */
export function selectionWindow(
  members: readonly EntitySummaryDef[],
  scroll: number,
  size: number,
): SelectionWindow {
  const count = members.length;
  const windowSize = Math.max(1, Math.floor(size));
  const maxStart = Math.max(0, count - windowSize);
  const start = Math.max(0, Math.min(maxStart, Math.floor(scroll)));
  const end = Math.min(count, start + windowSize);
  return { start, end, items: members.slice(start, end) };
}
