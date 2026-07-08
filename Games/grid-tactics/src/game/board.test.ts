import { describe, expect, test } from "bun:test";

import { GRID_SIZE, createBattleGrid, manhattan, tileToWorld, tilesWithinRange, worldToTile } from "./board";

describe("board coordinate math", () => {
  test("tileToWorld centers the grid on the world origin", () => {
    const center = tileToWorld([Math.floor((GRID_SIZE - 1) / 2), Math.floor((GRID_SIZE - 1) / 2)]);
    expect(Math.abs(center[0])).toBeLessThan(2.2);
    expect(Math.abs(center[2])).toBeLessThan(2.2);
  });

  test("worldToTile is the inverse of tileToWorld for every cell", () => {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      for (let r = 0; r < GRID_SIZE; r += 1) {
        const [x, , z] = tileToWorld([c, r]);
        expect(worldToTile(x, z)).toEqual([c, r]);
      }
    }
  });

  test("worldToTile rejects points far outside the board", () => {
    expect(worldToTile(500, 500)).toBeNull();
  });
});

describe("manhattan + range", () => {
  test("manhattan distance is symmetric and additive along axes", () => {
    expect(manhattan([0, 0], [3, 4])).toBe(7);
    expect(manhattan([2, 2], [2, 2])).toBe(0);
  });

  test("tilesWithinRange excludes the center and respects the radius", () => {
    const tiles = tilesWithinRange([3, 3], 1);
    expect(tiles).not.toContainEqual([3, 3]);
    expect(tiles).toContainEqual([2, 3]);
    expect(tiles).toContainEqual([4, 3]);
    expect(tiles).not.toContainEqual([1, 3]);
  });
});

describe("createBattleGrid", () => {
  test("blocked tiles are not enterable and reachable respects the move budget", () => {
    const grid = createBattleGrid([[1, 0]]);
    expect(grid.isBlocked([1, 0])).toBe(true);
    grid.place("scout", [0, 0]);
    const reach = grid.reachable([0, 0], 2);
    expect(reach.find((t) => t.tile[0] === 1 && t.tile[1] === 0)).toBeUndefined();
    expect(reach.some((t) => t.tile[0] === 0 && t.tile[1] === 1)).toBe(true);
  });
});
