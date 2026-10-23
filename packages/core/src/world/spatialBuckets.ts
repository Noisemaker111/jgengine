/**
 * Uniform XZ grid over items with a rectangular footprint: insert once, then ask which items cover a
 * box. One mechanism behind the two sampling hot paths — a corridor's segments and a palette's regions
 * — so a per-vertex query tests the handful of items nearby instead of every item in the world.
 * @internal
 */

/** @internal */
export interface SpatialBuckets {
  /** Register `id` under every cell its rectangle overlaps. Ids are returned in insertion order. */
  insert(id: number, minX: number, minZ: number, maxX: number, maxZ: number): void;
  /** Ids whose rectangle overlaps the query box, ascending and deduped, written into `out`. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[];
}

/** @internal */
export function buildSpatialBuckets(cellSize: number): SpatialBuckets {
  const cell = Math.max(1e-6, cellSize);
  const columns = new Map<number, Map<number, number[]>>();
  let marks = new Int32Array(16);
  let generation = 0;
  let highest = -1;

  const mark = (id: number): void => {
    if (id <= highest) return;
    highest = id;
    if (id < marks.length) return;
    let size = marks.length;
    while (size <= id) size *= 2;
    const grown = new Int32Array(size);
    grown.set(marks);
    marks = grown;
  };

  return {
    insert(id, minX, minZ, maxX, maxZ) {
      mark(id);
      const cx0 = Math.floor(minX / cell);
      const cx1 = Math.floor(maxX / cell);
      const cz0 = Math.floor(minZ / cell);
      const cz1 = Math.floor(maxZ / cell);
      for (let cx = cx0; cx <= cx1; cx += 1) {
        let column = columns.get(cx);
        if (column === undefined) {
          column = new Map<number, number[]>();
          columns.set(cx, column);
        }
        for (let cz = cz0; cz <= cz1; cz += 1) {
          const bucket = column.get(cz);
          if (bucket === undefined) column.set(cz, [id]);
          else bucket.push(id);
        }
      }
    },
    query(minX, minZ, maxX, maxZ, out) {
      out.length = 0;
      generation += 1;
      if (generation >= 2147483647) {
        marks.fill(0);
        generation = 1;
      }
      const cx0 = Math.floor(minX / cell);
      const cx1 = Math.floor(maxX / cell);
      const cz0 = Math.floor(minZ / cell);
      const cz1 = Math.floor(maxZ / cell);
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const column = columns.get(cx);
        if (column === undefined) continue;
        for (let cz = cz0; cz <= cz1; cz += 1) {
          const bucket = column.get(cz);
          if (bucket === undefined) continue;
          for (const id of bucket) {
            if (marks[id] === generation) continue;
            marks[id] = generation;
            out.push(id);
          }
        }
      }
      out.sort((a, b) => a - b);
      return out;
    },
  };
}
