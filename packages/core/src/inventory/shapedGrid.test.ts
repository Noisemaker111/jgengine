import { describe, expect, test } from "bun:test";

import {
  canPlace,
  cellFromPoint,
  cellOccupant,
  createShapedGrid,
  findShapedPlacement,
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

describe("discrete shaped-grid inputs", () => {
  test("dimensions reject nonfinite and fractional boards", () => {
    for (const invalid of [NaN, Infinity, 1.5, 0, -1]) {
      expect(() => createShapedGrid(invalid, 3)).toThrow();
      expect(() => createShapedGrid(3, invalid)).toThrow();
    }
  });

  test("empty, fractional, and nonfinite footprints and origins cannot place", () => {
    const grid = createShapedGrid(4, 3);
    for (const footprint of [[], [[0.5, 0]], [[NaN, 0]], [[0, Infinity]]] as Footprint[]) {
      expect(canPlace(grid, footprint, [0, 0], 0)).toBe("invalid-footprint");
    }
    for (const origin of [[0.5, 0], [NaN, 0], [0, Infinity]] as Cell[]) {
      expect(canPlace(grid, single, origin, 0)).toBe("invalid-origin");
    }
  });

  test("caller-decoded boards cannot bypass dimension validation", () => {
    const grid = createShapedGrid(4, 3);
    for (const invalid of [NaN, Infinity, 1.5, 0, -1]) {
      expect(() => canPlace({ ...grid, width: invalid }, single, [0, 0], 0)).toThrow();
      expect(() => findShapedPlacement({ ...grid, height: invalid }, single)).toThrow();
    }
  });
});

describe("ordered bounded placement search", () => {
  const rifle: Footprint = [[0, 0], [1, 0], [2, 0]];

  test("Deepward tries unrotated row-major positions before rotating", () => {
    const grid = createShapedGrid(4, 3);
    const ink = placeShaped(grid, { id: "ink", value: "ink", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]] }, [0, 0]);
    if (ink.status !== "ok") throw new Error("setup");
    expect(findShapedPlacement(ink.grid, rifle, { rotations: [0, 1] })).toEqual({ status: "found", origin: [0, 2], rotation: 0, checks: 9 });
    const narrow = createShapedGrid(2, 3);
    expect(findShapedPlacement(narrow, rifle, { rotations: [0, 1] })).toEqual({ status: "found", origin: [0, 0], rotation: 1, checks: 7 });
    expect(findShapedPlacement(narrow, rifle, { rotations: [0] }).status).toBe("no-space");
  });

  test("policy can prefer rotation and a moved item ignores its own cells", () => {
    const grid = createShapedGrid(4, 3);
    const packed = placeShaped(grid, { id: "rifle", value: "rifle", footprint: rifle }, [0, 0]);
    if (packed.status !== "ok") throw new Error("setup");
    expect(findShapedPlacement(packed.grid, rifle, { rotations: [1, 0], ignoreId: "rifle" })).toEqual({ status: "found", origin: [0, 0], rotation: 1, checks: 1 });
    expect(packed.grid.placements[0]!.origin).toEqual([0, 0]);
  });

  test("an irregular shape packs into a hole that its bounding rectangle cannot fill", () => {
    const placed = placeShaped(createShapedGrid(2, 2), { id: "peg", value: 1, footprint: single }, [1, 0]);
    if (placed.status !== "ok") throw new Error("setup");
    expect(findShapedPlacement(placed.grid, ell)).toEqual({ status: "found", origin: [0, 0], rotation: 0, checks: 1 });
    expect(findShapedPlacement(placed.grid, [[0, 0], [1, 0], [0, 1], [1, 1]]).status).toBe("no-space");
  });

  test("exhaustion is distinct from completing a no-fit search", () => {
    const grid = createShapedGrid(2, 3);
    expect(findShapedPlacement(grid, rifle, { rotations: [0, 1], maxChecks: 6 })).toEqual({ status: "budget-exceeded", checks: 6 });
    expect(findShapedPlacement(grid, rifle, { rotations: [0], maxChecks: 6 })).toEqual({ status: "no-space", checks: 6 });
    expect(findShapedPlacement(createShapedGrid(100_000, 100_000), rifle, { maxChecks: 0 })).toEqual({ status: "budget-exceeded", checks: 0 });
    expect(() => findShapedPlacement(grid, rifle, { maxChecks: Infinity })).toThrow();
  });

  test("invalid search policy and footprint fail before enumerating positions", () => {
    const grid = createShapedGrid(3, 3);
    expect(() => findShapedPlacement(grid, [], {})).toThrow();
    expect(() => findShapedPlacement(grid, rifle, { rotations: [0.5 as 0] })).toThrow();
    expect(findShapedPlacement(grid, rifle, { rotations: [] })).toEqual({ status: "no-space", checks: 0 });
  });
});
