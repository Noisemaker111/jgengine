/** A primary click on the world, recorded so the next click can be judged a double-click. @internal */
export interface SelectClickRecord {
  entity: string | null;
  at: number;
  x: number;
  y: number;
}

/** Max gap and travel between two clicks on the same entity that count as a double-click. @internal */
export const SELECT_DOUBLE_CLICK_MS = 400;
/** @internal */
export const SELECT_DOUBLE_CLICK_SLOP_PX = 6;

/** True when `next` lands on the same entity as `prev` within the double-click window and slop. @internal */
export function isSelectDoubleClick(prev: SelectClickRecord | null, next: SelectClickRecord): boolean {
  if (prev === null || next.entity === null || prev.entity !== next.entity) return false;
  if (next.at - prev.at > SELECT_DOUBLE_CLICK_MS) return false;
  return Math.hypot(next.x - prev.x, next.y - prev.y) <= SELECT_DOUBLE_CLICK_SLOP_PX;
}

/** A resolved click-select gesture: the clicked selectable entity (or null for ground) plus its modifiers. @internal */
export interface ClickSelectInput {
  /** Selectable entity under the cursor, or null. */
  hit: string | null;
  current: readonly string[];
  /** Shift held: toggle the hit in/out (or add the same-kind set) instead of replacing. */
  additive: boolean;
  /** Double-click or Ctrl+click: select every on-screen selectable entity of the hit's kind. */
  sameKind: boolean;
  kindOf?: (entityId: string) => string | null;
  /** Selectable entities currently on screen, in a stable order; only read for a same-kind select. */
  onScreen: () => readonly string[];
}

/**
 * The selection after a click: plain click replaces with the hit (ground clears), Shift toggles the hit
 * (ground keeps the selection), double-click/Ctrl selects the hit's on-screen kind (Shift adds it).
 * Without `kindOf`, or when the hit has no kind, a same-kind click acts as a plain or Shift click.
 * @internal
 */
export function resolveClickSelection(input: ClickSelectInput): string[] {
  const { hit, current, additive } = input;
  if (hit === null) return additive ? [...current] : [];
  const kind = input.sameKind ? input.kindOf?.(hit) ?? null : null;
  if (kind !== null) {
    const same = input.onScreen().filter((id) => id === hit || input.kindOf!(id) === kind);
    if (!same.includes(hit)) same.unshift(hit);
    return additive ? union(current, same) : same;
  }
  if (!additive) return [hit];
  return current.includes(hit) ? current.filter((id) => id !== hit) : [...current, hit];
}

/** The selection after a marquee: replaces, or with Shift adds the boxed ids to the current selection. @internal */
export function resolveMarqueeSelection(boxed: readonly string[], current: readonly string[], additive: boolean): string[] {
  return additive ? union(current, boxed) : [...boxed];
}

function union(a: readonly string[], b: readonly string[]): string[] {
  const out = [...a];
  const seen = new Set(a);
  for (const id of b) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
