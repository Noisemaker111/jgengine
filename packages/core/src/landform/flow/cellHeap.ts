// @skill jgengine-world
/**
 * A binary min-heap of grid cells keyed by height, ties broken by cell index so every engine pops
 * the same order. Typed arrays, sized once per grid, no allocation while it runs.
 * @internal
 */
export interface CellHeap {
  push(cell: number, key: number): void;
  /** The lowest cell, or -1 when empty. Its key is in {@link CellHeap.lastKey}. */
  pop(): number;
  readonly size: number;
  readonly lastKey: number;
  clear(): void;
}

/** A heap holding at most `capacity` entries at once. @internal */
export function createCellHeap(capacity: number): CellHeap {
  // stateless: a scratch heap each caller empties before use; it carries nothing between calls.
  // stateless: a scratch heap each caller empties before use; it carries nothing between calls.
  const keys = new Float64Array(capacity);
  const ids = new Int32Array(capacity);
  let size = 0;
  let lastKey = 0;
  const below = (a: number, b: number): boolean => {
    const ka = keys[a] ?? 0;
    const kb = keys[b] ?? 0;
    return ka < kb || (ka === kb && (ids[a] ?? 0) < (ids[b] ?? 0));
  };
  const swap = (a: number, b: number): void => {
    const k = keys[a] ?? 0;
    keys[a] = keys[b] ?? 0;
    keys[b] = k;
    const id = ids[a] ?? 0;
    ids[a] = ids[b] ?? 0;
    ids[b] = id;
  };
  return {
    push(cell, key) {
      if (size >= capacity) throw new Error("landform cell heap overflow");
      let at = size;
      keys[at] = key;
      ids[at] = cell;
      size += 1;
      while (at > 0) {
        const parent = (at - 1) >> 1;
        if (!below(at, parent)) break;
        swap(at, parent);
        at = parent;
      }
    },
    pop() {
      if (size === 0) return -1;
      const cell = ids[0] ?? -1;
      lastKey = keys[0] ?? 0;
      size -= 1;
      if (size > 0) {
        keys[0] = keys[size] ?? 0;
        ids[0] = ids[size] ?? 0;
        let at = 0;
        for (;;) {
          const left = at * 2 + 1;
          if (left >= size) break;
          const right = left + 1;
          const child = right < size && below(right, left) ? right : left;
          if (!below(child, at)) break;
          swap(child, at);
          at = child;
        }
      }
      return cell;
    },
    get size() {
      return size;
    },
    get lastKey() {
      return lastKey;
    },
    clear() {
      size = 0;
    },
  };
}
