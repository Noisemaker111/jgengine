import type { SelectionSet } from "./selection";

/**
 * The serializable shape of a {@link SelectionBookmarks} store: each key maps to
 * its ordered, deduplicated id list. Plain data — safe to persist in a save file
 * or replicate over the wire, and the exact input {@link createSelectionBookmarks}
 * restores.
 */
export interface SelectionBookmarkSnapshot {
  bookmarks: Record<string, readonly string[]>;
}

/** Outcome of a {@link SelectionBookmarks.prune} pass — what the validity predicate removed. */
export interface SelectionPruneResult {
  /** Ids dropped from at least one bookmark because the predicate rejected them. */
  removedIds: string[];
  /** Bookmark keys deleted because pruning emptied them. */
  clearedKeys: string[];
}

/**
 * A generic, keyed store of saved id sets ("bookmarks") over stable string ids —
 * the reusable layer under RTS control groups, camera bookmarks, saved squads,
 * editor selection presets, and accessibility recall. It owns storage only:
 * binding, recall, enumeration, pruning, and serialization. It never touches the
 * active {@link SelectionSet} or the camera — replacement/merge and focus stay
 * caller hooks (see {@link recallSelectionBookmark}) so one store serves any
 * genre, input scheme, or focus policy.
 *
 * Keys are opaque strings, so numbered control groups (`"1"`…`"9"`), named
 * bookmarks (`"home"`, `"base"`), or per-owner namespaces all coexist. Each
 * bookmark preserves insertion order and dedupes, matching {@link SelectionSet}.
 */
export interface SelectionBookmarks {
  /** Replace the set under `key` with `ids` (ordered, deduped). Binding an empty set removes the key, so `has(key)` is then false and it drops out of {@link serialize}. */
  bind(key: string, ids: Iterable<string>): void;
  /** Add `ids` to the set under `key` (creating it if absent), skipping ones already present so order is stable. */
  append(key: string, ids: Iterable<string>): void;
  /** Remove `ids` from the set under `key`; if that empties the set, the key is deleted. No-op when the key is absent. */
  remove(key: string, ids: Iterable<string>): void;
  /** The ordered ids saved under `key`, or an empty array when the key is absent. The returned array is a fresh copy — mutating it never touches the store. */
  recall(key: string): string[];
  /** True when `key` holds a non-empty set. */
  has(key: string): boolean;
  /** Delete `key`; returns true when a set was removed. */
  clear(key: string): boolean;
  /** Delete every bookmark. */
  clearAll(): void;
  /** All bookmark keys in insertion order. */
  keys(): string[];
  /** Count of ids saved under `key`, or 0 when absent. */
  size(key: string): number;
  /**
   * Drop every id the `isValid` predicate rejects from all bookmarks — the seam
   * for destroyed entities, cross-scene ids, and ownership changes: the caller
   * supplies validity, the store applies it. Bookmarks emptied by pruning are
   * removed. Returns what was removed so callers can surface it.
   */
  prune(isValid: (id: string) => boolean): SelectionPruneResult;
  /** A plain-data copy of every bookmark — the exact input {@link createSelectionBookmarks} restores. */
  serialize(): SelectionBookmarkSnapshot;
}

function dedupe(ids: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Create a keyed bookmark store, optionally restored from a {@link serialize}
 * snapshot. Restoration re-dedupes and drops empty sets, so a hand-authored or
 * migrated snapshot always normalizes to the same invariants a live store holds.
 *
 * @capability selection-bookmarks keyed saved-set store (RTS control groups, camera bookmarks, saved squads) with prune + serialize
 */
export function createSelectionBookmarks(snapshot?: SelectionBookmarkSnapshot): SelectionBookmarks {
  const groups = new Map<string, string[]>();
  if (snapshot !== undefined) {
    for (const [key, ids] of Object.entries(snapshot.bookmarks)) {
      const list = dedupe(ids);
      if (list.length > 0) groups.set(key, list);
    }
  }

  return {
    bind(key, ids) {
      const list = dedupe(ids);
      if (list.length === 0) groups.delete(key);
      else groups.set(key, list);
    },
    append(key, ids) {
      const existing = groups.get(key);
      if (existing === undefined) {
        const list = dedupe(ids);
        if (list.length > 0) groups.set(key, list);
        return;
      }
      const seen = new Set(existing);
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        existing.push(id);
      }
    },
    remove(key, ids) {
      const existing = groups.get(key);
      if (existing === undefined) return;
      const drop = new Set(ids);
      const next = existing.filter((id) => !drop.has(id));
      if (next.length === 0) groups.delete(key);
      else groups.set(key, next);
    },
    recall(key) {
      const existing = groups.get(key);
      return existing === undefined ? [] : [...existing];
    },
    has: (key) => (groups.get(key)?.length ?? 0) > 0,
    clear: (key) => groups.delete(key),
    clearAll: () => groups.clear(),
    keys: () => [...groups.keys()],
    size: (key) => groups.get(key)?.length ?? 0,
    prune(isValid) {
      const removedIds = new Set<string>();
      const clearedKeys: string[] = [];
      for (const [key, list] of [...groups]) {
        const next = list.filter((id) => {
          const keep = isValid(id);
          if (!keep) removedIds.add(id);
          return keep;
        });
        if (next.length === list.length) continue;
        if (next.length === 0) {
          groups.delete(key);
          clearedKeys.push(key);
        } else {
          groups.set(key, next);
        }
      }
      return { removedIds: [...removedIds], clearedKeys };
    },
    serialize: () => ({
      bookmarks: Object.fromEntries([...groups].map(([key, list]) => [key, [...list]])),
    }),
  };
}

/** How a recalled bookmark folds into the active selection. */
export type BookmarkRecallMode = "replace" | "merge";

/** Caller hooks for {@link recallSelectionBookmark} — kept out of the store so focus and validity stay genre-owned. */
export interface RecallBookmarkOptions {
  /** `"replace"` (default) swaps the active selection for the bookmark; `"merge"` unions it in. */
  mode?: BookmarkRecallMode;
  /**
   * Validity predicate applied to the bookmark before it reaches the selection —
   * stale ids (destroyed entities, wrong scene, lost ownership) are pruned from
   * the stored bookmark in place, so recall self-heals. Omit to recall verbatim.
   */
  isValid?: (id: string) => boolean;
  /** Focus hook fired with the surviving ids (e.g. center/follow the camera). Never called when recall yields nothing. */
  onFocus?: (ids: readonly string[]) => void;
}

/**
 * Compose a bookmark recall onto an active {@link SelectionSet}: optionally prune
 * stale ids (updating the stored bookmark), fold the survivors into the selection
 * by `mode`, then fire the caller's focus hook. This is the one place the store,
 * the selection, and the camera meet — kept as an explicit helper, not a store
 * side effect, so games opt into the exact replacement/merge and focus policy
 * they want. Returns the surviving ids that were applied.
 *
 * @capability selection-bookmark-recall fold a saved set into the active selection with stale-ref pruning and a caller focus hook
 */
export function recallSelectionBookmark(
  bookmarks: SelectionBookmarks,
  key: string,
  selection: SelectionSet,
  options: RecallBookmarkOptions = {},
): string[] {
  const { mode = "replace", isValid, onFocus } = options;
  if (isValid !== undefined) bookmarks.prune(isValid);
  const ids = bookmarks.recall(key);
  if (mode === "replace") selection.replace(ids);
  else for (const id of ids) selection.add(id);
  if (ids.length > 0) onFocus?.(ids);
  return ids;
}
