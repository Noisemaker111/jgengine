export interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/** Normalize two drag corners (in any order) into a rectangle. */
export function screenRect(ax: number, ay: number, bx: number, by: number): ScreenRect {
  return {
    minX: Math.min(ax, bx),
    minY: Math.min(ay, by),
    maxX: Math.max(ax, bx),
    maxY: Math.max(ay, by),
  };
}

export function rectContainsPoint(rect: ScreenRect, x: number, y: number): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/** Ids of the projected candidates whose screen point falls inside the marquee. */
export function selectWithinRect(candidates: readonly ScreenPoint[], rect: ScreenRect): string[] {
  return candidates.filter((candidate) => rectContainsPoint(rect, candidate.x, candidate.y)).map((c) => c.id);
}

/** True when the drag is large enough to be a marquee rather than a click. */
export function isMarquee(rect: ScreenRect, thresholdPx = 4): boolean {
  return rect.maxX - rect.minX >= thresholdPx || rect.maxY - rect.minY >= thresholdPx;
}

export interface SelectionSet {
  add(id: string): void;
  remove(id: string): void;
  toggle(id: string): void;
  has(id: string): boolean;
  replace(ids: Iterable<string>): void;
  clear(): void;
  list(): string[];
  size(): number;
}

/** An ordered, deduplicated set of selected instance ids for RTS unit-command routing. */
export function createSelectionSet(initial?: Iterable<string>): SelectionSet {
  const ids = new Set<string>(initial);
  return {
    add: (id) => void ids.add(id),
    remove: (id) => void ids.delete(id),
    toggle: (id) => (ids.has(id) ? ids.delete(id) : ids.add(id)),
    has: (id) => ids.has(id),
    replace(next) {
      ids.clear();
      for (const id of next) ids.add(id);
    },
    clear: () => ids.clear(),
    list: () => Array.from(ids),
    size: () => ids.size,
  };
}
