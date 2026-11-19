/** A primary click on the world, recorded so the next click can be judged a double-click. @internal */
export interface SelectClickRecord {
  entity: string | null;
  at: number;
  x: number;
  y: number;
}

/** @internal */
export const SELECT_DOUBLE_CLICK_MS = 400;
/** @internal */
export const SELECT_DOUBLE_CLICK_SLOP_PX = 6;

/** @internal */
export function isSelectDoubleClick(prev: SelectClickRecord | null, next: SelectClickRecord): boolean {
  if (prev === null || next.entity === null || prev.entity !== next.entity) return false;
  if (next.at - prev.at > SELECT_DOUBLE_CLICK_MS) return false;
  return Math.hypot(next.x - prev.x, next.y - prev.y) <= SELECT_DOUBLE_CLICK_SLOP_PX;
}

/** @internal */
export interface ClickSelectInput {
  hit: string | null;
  current: readonly string[];
  /** Shift held: toggle the hit in/out (or add the same-kind set) instead of replacing. */
  additive: boolean;
  sameKind: boolean;
  kindOf?: ((entityId: string) => string | null) | undefined;
  onScreen: () => readonly string[];
}

/** @internal */
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

/** @internal */
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
