/**
 * Who to tell when particular ids enter or leave the visible set. A batch of placed props draws only
 * its visible members, so it gathers them again when one of them changes: with every batch asking
 * "did the visible set change?", a walking camera that shifted a few ids at the edge of the view sent
 * every batch in the world through all its members each frame. Here a batch watches its own ids and
 * is marked only when one of them changed.
 * @internal
 */
export interface VisibilityChanges {
  /** Call `mark` whenever one of `ids` enters or leaves the visible set; returns the unwatch. */
  watch(ids: readonly string[], mark: () => void): () => void;
  /** Tell the watchers of each changed id. */
  notify(changed: readonly string[]): void;
  /** Tell every watcher: the whole predicate was replaced. */
  notifyAll(): void;
}

/** @internal */
export function createVisibilityChanges(): VisibilityChanges {
  const byId = new Map<string, (() => void)[]>();
  const everyone = new Set<() => void>();
  return {
    watch(ids, mark) {
      everyone.add(mark);
      for (const id of ids) {
        const marks = byId.get(id);
        if (marks === undefined) byId.set(id, [mark]);
        else marks.push(mark);
      }
      return () => {
        everyone.delete(mark);
        for (const id of ids) {
          const marks = byId.get(id);
          if (marks === undefined) continue;
          const at = marks.indexOf(mark);
          if (at >= 0) marks.splice(at, 1);
          if (marks.length === 0) byId.delete(id);
        }
      };
    },
    notify(changed) {
      for (const id of changed) {
        const marks = byId.get(id);
        if (marks === undefined) continue;
        for (const mark of marks) mark();
      }
    },
    notifyAll() {
      for (const mark of everyone) mark();
    },
  };
}
