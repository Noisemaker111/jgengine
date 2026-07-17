/**
 * Headless view model for a multi-entity selection — the data layer behind an RTS selection panel, a
 * party frame, or a squad summary. It turns a caller-owned list of selected entity summaries into a
 * primary detail focus, an ordered member strip, and same-kind buckets for large selections, with
 * focus/hover and virtualization helpers. No rendering opinion: the React renderers in
 * `@jgengine/react/selectionHud` consume this and a game supplies the entity data from wherever it
 * lives (a `createSelectionSet`, a roster, a marquee query).
 */

/** One vital bar on an entity summary (health/shield/energy): current/max plus optional label and tone. */
export interface EntityVital {
  id: string;
  label?: string;
  current: number;
  max: number;
  /** Colour-ramp hint the renderer maps to a palette (e.g. `"health" | "shield"`); caller-owned. */
  tone?: string;
}

/**
 * A caller-provided summary of one selectable entity — the DATA input. `kind` is the grouping key
 * used to bucket a large selection (unit type, catalog id); `icon` is a portrait id the renderer
 * resolves. Only `id` is required.
 */
export interface EntitySummaryDef {
  id: string;
  name?: string;
  /** Type/catalog id a large selection is bucketed by; falls back to `"unit"` when omitted. */
  kind?: string;
  /** Portrait id / glyph the caller maps to art. */
  icon?: string;
  vitals?: readonly EntityVital[];
  tags?: readonly string[];
  /** Ownership / faction tint id, caller-owned. */
  owner?: string;
}

/** A bucket of same-`kind` entities in a large selection — the RTS "12 Marines" control chip. */
export interface SelectionGroup {
  kind: string;
  label: string;
  icon?: string;
  count: number;
  ids: readonly string[];
}

/**
 * A resolved multi-selection view model. `primary` is the focused entity's full detail; `members` is
 * the stable-order strip; `groups` buckets members by kind (count-desc, then label) for the
 * portrait-overflow case; `grouped` is the hint that the selection is large enough to prefer groups
 * over per-member portraits.
 */
export interface SelectionView {
  count: number;
  primary: EntitySummaryDef | null;
  members: readonly EntitySummaryDef[];
  groups: readonly SelectionGroup[];
  focusIndex: number;
  grouped: boolean;
}

/** Options for {@link summarizeSelection}. */
export interface SummarizeSelectionOptions {
  /** Id of the entity to treat as primary/focused. Wins over `focusIndex`; ignored when not present. */
  primaryId?: string;
  /** Index of the primary/focused member when `primaryId` is absent (default 0). */
  focusIndex?: number;
  /** Member count above which `grouped` flips true (default 12). */
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
  const order: string[] = [];
  const byKind = new Map<string, { icon?: string; ids: string[] }>();
  for (const member of members) {
    const kind = member.kind ?? "unit";
    let bucket = byKind.get(kind);
    if (bucket === undefined) {
      bucket = { icon: member.icon, ids: [] };
      byKind.set(kind, bucket);
      order.push(kind);
    }
    bucket.ids.push(member.id);
  }
  const groups: SelectionGroup[] = order.map((kind) => {
    const bucket = byKind.get(kind)!;
    const group: SelectionGroup = { kind, label: labelOf(kind), count: bucket.ids.length, ids: bucket.ids };
    if (bucket.icon !== undefined) group.icon = bucket.icon;
    return group;
  });
  groups.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  return groups;
}

/** A 1-D focus move within the selection member strip. */
export type SelectionFocusDirection = "next" | "prev" | "first" | "last";

/**
 * Pure next-focus math for the selection strip: step the focus index by one member (wrapping), or
 * jump to an end. `-1` (no focus) steps to the first/last member. Returns `-1` for an empty selection.
 */
export function moveSelectionFocus(count: number, current: number, dir: SelectionFocusDirection): number {
  if (count <= 0) return -1;
  if (dir === "first") return 0;
  if (dir === "last") return count - 1;
  if (current < 0) return dir === "prev" ? count - 1 : 0;
  if (dir === "next") return (current + 1) % count;
  return (current - 1 + count) % count;
}

/** A contiguous slice of members for virtualizing a large selection strip. */
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
