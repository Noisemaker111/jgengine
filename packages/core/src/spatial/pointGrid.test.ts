import { describe, expect, test } from "bun:test";
import { createPointGrid } from "@jgengine/core/spatial/pointGrid";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Indices whose XZ distance to (x, z) is at most r, in index order. */
function bruteForce(positions: Float64Array, items: number[], x: number, z: number, r: number): number[] {
  return items.filter((i) => Math.hypot(positions[i * 3]! - x, positions[i * 3 + 2]! - z) <= r).sort((a, b) => a - b);
}

describe("point grid", () => {
  test.each([
    ["a dense field", 2, 40, 4],
    ["a sparse field with far outliers", 1, 1000, 4],
    ["negative coordinates and a tiny cell budget", 0.5, 30, 0.01],
  ])("queries find every point within the radius over %s", (_label, cellSize, extent, maxCellsPerPoint) => {
    const next = random(7);
    const count = 400;
    const positions = new Float64Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (next() - 0.5) * extent;
      positions[i * 3 + 1] = next();
      positions[i * 3 + 2] = (next() - 0.5) * extent;
    }
    positions[0] = 1e6;
    const grid = createPointGrid({ cellSize, maxCellsPerPoint });
    const items = Array.from({ length: count }, (_, i) => i).filter((i) => i % 3 !== 1);
    const out = new Int32Array(count);
    for (const indexed of [false, true]) {
      if (indexed) grid.rebuild(positions, Int32Array.from(items), items.length);
      else grid.rebuild(positions, count);
      const members = indexed ? items : Array.from({ length: count }, (_, i) => i);
      expect(grid.size()).toBe(members.length);
      for (let q = 0; q < 200; q += 1) {
        const x = (next() - 0.5) * extent, z = (next() - 0.5) * extent, r = next() * cellSize * 1.5;
        const found = grid.query(x, z, r, out);
        const hits = [...out.subarray(0, found)].filter((i) => Math.hypot(positions[i * 3]! - x, positions[i * 3 + 2]! - z) <= r).sort((a, b) => a - b);
        expect(hits).toEqual(bruteForce(positions, members, x, z, r));
      }
    }
  });

  test("candidates come out by z row, then x, then input order, and stop when the output is full", () => {
    const positions = new Float64Array([
      1.5, 0, 0.5, // 0: cell (1, 0)
      0.5, 0, 0.5, // 1: cell (0, 0)
      0.5, 0, 1.5, // 2: cell (0, 1)
      0.2, 0, 0.2, // 3: cell (0, 0)
    ]);
    const grid = createPointGrid({ cellSize: 1 });
    grid.rebuild(positions, 4);
    const out = new Int32Array(4);
    expect([...out.subarray(0, grid.query(1, 1, 1, out))]).toEqual([1, 3, 0, 2]);
    const small = new Int32Array(2);
    expect(grid.query(1, 1, 1, small)).toBe(2);
    grid.rebuild(positions, 0);
    expect(grid.query(0, 0, 10, out)).toBe(0);
  });
});
