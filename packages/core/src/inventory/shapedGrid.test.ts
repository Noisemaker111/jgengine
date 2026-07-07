import { describe, expect, test } from "bun:test";

import {
  canPlace,
  cellFromPoint,
  cellOccupant,
  createShapedGrid,
  gridAdjacencyQuery,
  moveShaped,
  normalizeFootprint,
  occupiedCells,
  placeShaped,
  removeShaped,
  rotateFootprint,
  type Cell,
  type Footprint,
} from "@jgengine/core/inventory/shapedGrid";

const ell: Footprint = [
  [0, 0],
  [0, 1],
  [1, 1],
];
const single: Footprint = [[0, 0]];

function keys(cells: readonly Cell[]): string[] {
  return cells.map(([c, r]) => `${c},${r}`).sort();
}

describe("footprint geometry", () => {
  test("normalize shifts to origin and dedups", () => {
    expect(keys(normalizeFootprint([[2, 3], [2, 4], [2, 3]]))).toEqual(["0,0", "0,1"]);
  });

  test("rotate 4 times returns to the original shape", () => {
    const r4 = rotateFootprint(rotateFootprint(rotateFootprint(rotateFootprint(ell, 1), 1), 1), 1);
    expect(keys(r4)).toEqual(keys(normalizeFootprint(ell)));
  });

  test("rotate changes the occupied cells", () => {
    expect(keys(rotateFootprint(ell, 1))).not.toEqual(keys(normalizeFootprint(ell)));
  });

  test("occupiedCells offsets by origin", () => {
    expect(keys(occupiedCells(single, [3, 4], 0))).toEqual(["3,4"]);
  });
});

describe("polyomino placement and overlap", () => {
  test("places within bounds", () => {
    const grid = createShapedGrid<string>(4, 4);
    const result = placeShaped(grid, { id: "L", value: "L", footprint: ell }, [0, 0], 0);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(cellOccupant(result.grid, [0, 1])).toBe("L");
    expect(cellOccupant(result.grid, [1, 0])).toBeNull();
  });

  test("rejects out-of-bounds", () => {
    const grid = createShapedGrid<string>(2, 2);
    const result = placeShaped(grid, { id: "L", value: "L", footprint: ell }, [1, 1], 0);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("out-of-bounds");
  });

  test("rejects overlapping placements", () => {
    let grid = createShapedGrid<string>(4, 4);
    const first = placeShaped(grid, { id: "a", value: "a", footprint: ell }, [0, 0], 0);
    if (first.status !== "ok") throw new Error("setup");
    grid = first.grid;
    const second = placeShaped(grid, { id: "b", value: "b", footprint: single }, [0, 1], 0);
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") expect(second.reason).toBe("overlap");
  });

  test("rotation lets an otherwise-overlapping item fit", () => {
    expect(canPlace(createShapedGrid<string>(3, 3), ell, [0, 0], 0)).toBeNull();
    expect(canPlace(createShapedGrid<string>(1, 3), ell, [0, 0], 0)).toBe("out-of-bounds");
    expect(canPlace(createShapedGrid<string>(3, 1), ell, [0, 0], 1)).not.toBeNull();
  });

  test("move re-places ignoring the item's own cells", () => {
    let grid = createShapedGrid<string>(5, 5);
    const placed = placeShaped(grid, { id: "a", value: "a", footprint: ell }, [0, 0], 0);
    if (placed.status !== "ok") throw new Error("setup");
    grid = placed.grid;
    const moved = moveShaped(grid, "a", [1, 0], 0);
    expect(moved.status).toBe("ok");
    if (moved.status !== "ok") return;
    expect(cellOccupant(moved.grid, [0, 0])).toBeNull();
    expect(cellOccupant(moved.grid, [1, 0])).toBe("a");
  });

  test("remove clears occupancy", () => {
    let grid = createShapedGrid<string>(4, 4);
    const placed = placeShaped(grid, { id: "a", value: "a", footprint: single }, [2, 2], 0);
    if (placed.status !== "ok") throw new Error("setup");
    grid = placed.grid;
    const removed = removeShaped(grid, "a");
    expect(removed.status).toBe("ok");
    if (removed.status !== "ok") return;
    expect(cellOccupant(removed.grid, [2, 2])).toBeNull();
    expect(removeShaped(removed.grid, "a").status).toBe("rejected");
  });
});

describe("gridAdjacencyQuery", () => {
  function packed() {
    let grid = createShapedGrid<string>(6, 6);
    for (const [id, origin] of [
      ["a", [0, 0]],
      ["b", [1, 0]],
      ["c", [3, 3]],
    ] as const) {
      const r = placeShaped(grid, { id, value: id, footprint: single }, origin as Cell, 0);
      if (r.status !== "ok") throw new Error("setup");
      grid = r.grid;
    }
    return grid;
  }

  test("orthogonal neighbors only by default", () => {
    const query = gridAdjacencyQuery(packed());
    expect([...query.neighborsOf("a")]).toEqual(["b"]);
    expect(query.touching("a", "b")).toBe(true);
    expect(query.touching("a", "c")).toBe(false);
  });

  test("diagonal option widens the neighbor set", () => {
    let grid = createShapedGrid<string>(4, 4);
    for (const [id, origin] of [
      ["a", [0, 0]],
      ["d", [1, 1]],
    ] as const) {
      const r = placeShaped(grid, { id, value: id, footprint: single }, origin as Cell, 0);
      if (r.status !== "ok") throw new Error("setup");
      grid = r.grid;
    }
    expect([...gridAdjacencyQuery(grid).neighborsOf("a")]).toEqual([]);
    expect([...gridAdjacencyQuery(grid, { diagonal: true }).neighborsOf("a")]).toEqual(["d"]);
  });

  test("adjacentCells returns in-bounds ring around a footprint", () => {
    const query = gridAdjacencyQuery(createShapedGrid<string>(3, 3));
    const ring = query.adjacentCells([[0, 0]]);
    expect(keys(ring)).toEqual(["0,1", "1,0"]);
  });
});

describe("cellFromPoint", () => {
  test("maps pixel point to grid cell", () => {
    expect(cellFromPoint({ x: 25, y: 70 }, 20)).toEqual([1, 3]);
    expect(cellFromPoint({ x: 105, y: 5 }, 20, { x: 100, y: 0 })).toEqual([0, 0]);
  });
});
