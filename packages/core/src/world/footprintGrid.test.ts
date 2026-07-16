import { describe, expect, test } from "bun:test";
import {
  boundaryNeighbors,
  connectedTo,
  createFootprintGrid,
  footprintObstacles,
  hasValidAdjacency,
} from "@jgengine/core/world/footprintGrid";
import { validatePlacement } from "@jgengine/core/world/placement";

describe("footprint grid", () => {
  test("cellsFor covers a footprint centered on origin, honoring quarter turns", () => {
    const grid = createFootprintGrid({ cellSize: 1 });
    const cells = grid.cellsFor([0, 0], { w: 2, d: 1 });
    expect(cells).toHaveLength(2);
    const turned = grid.cellsFor([0, 0], { w: 2, d: 1 }, 1);
    expect(turned).toHaveLength(2);
    expect(new Set(turned.map((c) => c.row)).size).toBe(2);
  });

  test("reserve claims every cell atomically and rejects overlap", () => {
    const grid = createFootprintGrid();
    const cells = grid.cellsFor([0, 0], { w: 2, d: 2 });
    expect(grid.reserve("bldg-1", "house", cells)).toBe(true);
    expect(grid.isFree(cells)).toBe(false);
    expect(grid.occupantAt(cells[0]!)).toBe("bldg-1");
    expect(grid.kindAt(cells[0]!)).toBe("house");

    const overlapping = grid.cellsFor([1, 1], { w: 2, d: 2 });
    expect(grid.reserve("bldg-2", "house", overlapping)).toBe(false);
    expect(grid.reservationOf("bldg-2")).toBeNull();
  });

  test("reserve rejects a second reservation under the same id", () => {
    const grid = createFootprintGrid();
    const cells = grid.cellsFor([0, 0], { w: 1, d: 1 });
    expect(grid.reserve("a", "road", cells)).toBe(true);
    expect(grid.reserve("a", "road", grid.cellsFor([5, 5], { w: 1, d: 1 }))).toBe(false);
  });

  test("release frees cells for reuse", () => {
    const grid = createFootprintGrid();
    const cells = grid.cellsFor([0, 0], { w: 1, d: 1 });
    grid.reserve("a", "road", cells);
    expect(grid.release("a")).toBe(true);
    expect(grid.isFree(cells)).toBe(true);
    expect(grid.release("a")).toBe(false);
  });

  test("clear drops every reservation", () => {
    const grid = createFootprintGrid();
    grid.reserve("a", "road", grid.cellsFor([0, 0], { w: 1, d: 1 }));
    grid.clear();
    expect(grid.list()).toEqual([]);
  });

  test("footprintObstacles bridges reservations into validatePlacement's obstacle rules", () => {
    const grid = createFootprintGrid({ cellSize: 2 });
    grid.reserve("bldg-1", "house", grid.cellsFor([0, 0], { w: 2, d: 2 }));
    const obstacles = footprintObstacles(grid);
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]!.id).toBe("bldg-1");

    const result = validatePlacement({ center: [0, 0], footprint: { w: 2, d: 2 } }, { obstacles });
    expect(result.status).toBe("rejected");
    const clear = validatePlacement({ center: [20, 20], footprint: { w: 2, d: 2 } }, { obstacles });
    expect(clear.status).toBe("ok");
  });
});

describe("connective-piece adjacency", () => {
  test("boundaryNeighbors returns only occupied, out-of-footprint cells", () => {
    const grid = createFootprintGrid();
    grid.reserve("road-1", "road", [{ col: 1, row: 0 }]);
    grid.reserve("house-1", "house", [{ col: -1, row: 0 }]);
    const neighbors = boundaryNeighbors(grid, [{ col: 0, row: 0 }]);
    expect(neighbors).toHaveLength(2);
    expect(neighbors.map((n) => n.kind).sort()).toEqual(["house", "road"]);
  });

  test("hasValidAdjacency passes with no neighbors unless a connection is required", () => {
    const grid = createFootprintGrid();
    const cells = [{ col: 0, row: 0 }];
    expect(hasValidAdjacency(grid, cells, () => true)).toBe(true);
    expect(hasValidAdjacency(grid, cells, () => true, true)).toBe(false);
  });

  test("hasValidAdjacency requires every touching neighbor to be accepted", () => {
    const grid = createFootprintGrid();
    grid.reserve("road-1", "road", [{ col: 1, row: 0 }]);
    grid.reserve("house-1", "house", [{ col: -1, row: 0 }]);
    const cells = [{ col: 0, row: 0 }];
    expect(hasValidAdjacency(grid, cells, (kind) => kind === "road")).toBe(false);
    expect(hasValidAdjacency(grid, cells, (kind) => kind === "road" || kind === "house")).toBe(true);
  });

  test("hasValidAdjacency with requireConnection needs at least one accepted neighbor", () => {
    const grid = createFootprintGrid();
    grid.reserve("road-1", "road", [{ col: 1, row: 0 }]);
    const cells = [{ col: 0, row: 0 }];
    expect(hasValidAdjacency(grid, cells, (kind) => kind === "road", true)).toBe(true);
    expect(hasValidAdjacency(grid, cells, (kind) => kind === "pipe", true)).toBe(false);
  });

  test("connectedTo is true when any neighbor connects, ignoring incompatible ones", () => {
    const grid = createFootprintGrid();
    const cells = [{ col: 0, row: 0 }];
    expect(connectedTo(grid, cells, (kind) => kind === "track")).toBe(false);
    grid.reserve("wall-1", "wall", [{ col: 1, row: 0 }]);
    expect(connectedTo(grid, cells, (kind) => kind === "track")).toBe(false);
    expect(connectedTo(grid, cells)).toBe(true);
    grid.reserve("track-1", "track", [{ col: -1, row: 0 }]);
    expect(connectedTo(grid, cells, (kind) => kind === "track")).toBe(true);
  });
});
