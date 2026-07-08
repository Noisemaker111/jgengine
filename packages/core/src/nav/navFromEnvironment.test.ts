import { describe, expect, test } from "bun:test";

import { building, environment } from "../world/features";
import { resolveStructureBuildings } from "../world/environmentSummary";
import { createNavGrid } from "./navGrid";
import { populateNavGridFromEnvironment } from "./navFromEnvironment";

describe("populateNavGridFromEnvironment", () => {
  test("blocks the nav cells under every generated building", () => {
    const descriptor = building({ count: 4, footprint: { w: 10, d: 10 }, spacing: 4, seed: "nav" });
    const world = environment({ structures: descriptor });
    const grid = createNavGrid({ bounds: { minX: -60, minZ: -60, maxX: 60, maxZ: 60 }, cellSize: 1 });

    const blocked = populateNavGridFromEnvironment(grid, world);

    expect(blocked).toBe(4);
    for (const generated of resolveStructureBuildings(descriptor)) {
      const cell = grid.cellAt(generated.center);
      expect(grid.isWalkable(cell.col, cell.row)).toBe(false);
    }
    expect(grid.isWalkable(grid.cols - 1, grid.rows - 1)).toBe(true);
  });

  test("an empty world blocks nothing", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, cellSize: 1 });

    const blocked = populateNavGridFromEnvironment(grid, environment());

    expect(blocked).toBe(0);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) expect(grid.isWalkable(col, row)).toBe(true);
    }
  });
});
