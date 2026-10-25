/** Pixel geometry of the army roster. Must match the crest markup in Hud.tsx `ArmyRow`. */
export const ROSTER_METRICS = { crest: 36, gap: 4, arrow: 32 } as const;

export interface RosterMetrics {
  /** Width of one crest button (px). */
  crest: number;
  /** Gap between neighbouring items in the row (px). */
  gap: number;
  /** Width of one paging arrow button (px). */
  arrow: number;
}

export interface RosterFit {
  /** Crests shown per page. Equals the whole roster when it fits without paging. */
  pageSize: number;
  /** True when the roster does not fit and the row needs paging arrows. */
  paged: boolean;
}

/**
 * How many whole crests fit in a row `width` px wide.
 * If every crest fits, no arrows are needed. Otherwise both arrows and their gaps take space
 * and the row pages by the number of crests that remain (never fewer than one).
 */
export function rosterFit(count: number, width: number, m: RosterMetrics = ROSTER_METRICS): RosterFit {
  if (count <= 0) return { pageSize: 0, paged: false };
  const step = m.crest + m.gap;
  const fitAll = Math.floor((width + m.gap) / step);
  if (count <= fitAll) return { pageSize: count, paged: false };
  const inner = width - 2 * m.arrow - 2 * m.gap;
  return { pageSize: Math.max(1, Math.floor((inner + m.gap) / step)), paged: true };
}

export interface RosterPage {
  /** Zero-based page actually shown (requested page clamped into range). */
  page: number;
  pageCount: number;
  /** Slice bounds into the roster: `units.slice(start, end)`. */
  start: number;
  end: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Which slice of a roster of `count` units is shown on `requested` page at `pageSize` per page. */
export function rosterPage(count: number, pageSize: number, requested: number): RosterPage {
  const size = Math.max(1, Math.floor(pageSize));
  const total = Math.max(0, Math.floor(count));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const wanted = Number.isFinite(requested) ? Math.floor(requested) : 0;
  const page = Math.min(Math.max(0, wanted), pageCount - 1);
  const start = Math.min(page * size, total);
  const end = Math.min(start + size, total);
  return { page, pageCount, start, end, hasPrev: page > 0, hasNext: page < pageCount - 1 };
}
