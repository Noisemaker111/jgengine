import { describe, expect, test } from "bun:test";
import { createTacticalGrid, type Tile } from "@jgengine/core/tactics/tacticalGrid";

function tileSet(tiles: { tile: Tile }[]): string[] {
  return tiles.map((t) => `${t.tile[0]},${t.tile[1]}`).sort();
}

describe("occupancy", () => {
  test("place, move, and remove maintain a single occupant per tile", () => {
    const grid = createTacticalGrid({ width: 4, height: 4 });
    expect(grid.place("a", [1, 1])).toBe(true);
    expect(grid.place("b", [1, 1])).toBe(false);
    expect(grid.occupantAt([1, 1])).toBe("a");
    expect(grid.move("a", [2, 1])).toBe(true);
    expect(grid.occupantAt([1, 1])).toBeNull();
    expect(grid.occupantAt([2, 1])).toBe("a");
    grid.remove("a");
    expect(grid.occupantAt([2, 1])).toBeNull();
  });

  test("blocked tiles reject placement and movement", () => {
    const grid = createTacticalGrid({ width: 4, height: 4, blocked: [[2, 2]] });
    expect(grid.isBlocked([2, 2])).toBe(true);
    expect(grid.place("a", [2, 2])).toBe(false);
    grid.place("a", [2, 1]);
    expect(grid.move("a", [2, 2])).toBe(false);
  });
});

describe("flood-fill reachable", () => {
  test("budget bounds the reachable set on a 4-connected grid", () => {
    const grid = createTacticalGrid({ width: 5, height: 5 });
    grid.place("hero", [0, 0]);
    expect(tileSet(grid.reachable([0, 0], 1))).toEqual(["0,1", "1,0"]);
    expect(tileSet(grid.reachable([0, 0], 2))).toEqual(["0,1", "0,2", "1,0", "1,1", "2,0"]);
  });

  test("walls and other occupants block reachability", () => {
    const grid = createTacticalGrid({ width: 5, height: 5, blocked: [[1, 0]] });
    grid.place("hero", [0, 0]);
    grid.place("ally", [0, 1]);
    const reached = tileSet(grid.reachable([0, 0], 2));
    expect(reached).not.toContain("1,0");
    expect(reached).not.toContain("0,1");
  });

  test("path returns the shortest route to the goal", () => {
    const grid = createTacticalGrid({ width: 5, height: 1 });
    grid.place("hero", [0, 0]);
    expect(grid.path([0, 0], [3, 0])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
});

describe("push / knockback-to-tile", () => {
  test("push into the map edge stops the unit and records an edge collision", () => {
    const grid = createTacticalGrid({ width: 5, height: 5 });
    grid.place("a", [4, 0]);
    const result = grid.push("a", [1, 0], { distance: 1 });
    expect(result.moves).toEqual([]);
    expect(result.collisions).toEqual([{ mover: "a", into: "edge", at: [4, 0] }]);
    expect(grid.tileOf("a")).toEqual([4, 0]);
  });

  test("non-chained push into a unit stops and records the collision (Into the Breach)", () => {
    const grid = createTacticalGrid({ width: 5, height: 5 });
    grid.place("a", [0, 0]);
    grid.place("b", [1, 0]);
    const result = grid.push("a", [1, 0], { distance: 2 });
    expect(result.moves).toEqual([]);
    expect(result.collisions).toEqual([{ mover: "a", into: "b", at: [0, 0] }]);
    expect(grid.tileOf("a")).toEqual([0, 0]);
    expect(grid.tileOf("b")).toEqual([1, 0]);
  });

  test("chained push transfers momentum through the struck unit", () => {
    const grid = createTacticalGrid({ width: 6, height: 1 });
    grid.place("a", [0, 0]);
    grid.place("b", [1, 0]);
    const result = grid.push("a", [1, 0], { distance: 2, chain: true });
    expect(grid.tileOf("b")).toEqual([3, 0]);
    expect(grid.tileOf("a")).toEqual([2, 0]);
    expect(result.collisions).toEqual([{ mover: "a", into: "b", at: [0, 0] }]);
    expect(result.moves).toContainEqual({ id: "b", from: [1, 0], to: [3, 0] });
    expect(result.moves).toContainEqual({ id: "a", from: [0, 0], to: [2, 0] });
  });

  test("chained push stalls when the struck unit hits a wall", () => {
    const grid = createTacticalGrid({ width: 3, height: 1, blocked: [] });
    grid.place("a", [0, 0]);
    grid.place("b", [1, 0]);
    grid.place("c", [2, 0]);
    const result = grid.push("a", [1, 0], { distance: 1, chain: true });
    expect(grid.tileOf("a")).toEqual([0, 0]);
    expect(grid.tileOf("b")).toEqual([1, 0]);
    expect(grid.tileOf("c")).toEqual([2, 0]);
    expect(result.collisions).toContainEqual({ mover: "b", into: "c", at: [1, 0] });
    expect(result.collisions).toContainEqual({ mover: "a", into: "b", at: [0, 0] });
  });
});

describe("world mapping", () => {
  const GRID_SIZE = 8;
  const TILE_SIZE = 2.2;
  const HALF_SPAN = (GRID_SIZE - 1) / 2;
  const ORIGIN: readonly [number, number] = [-(HALF_SPAN + 0.5) * TILE_SIZE, -(HALF_SPAN + 0.5) * TILE_SIZE];

  function boardTileToWorld(tile: Tile): readonly [number, number] {
    return [(tile[0] - HALF_SPAN) * TILE_SIZE, (tile[1] - HALF_SPAN) * TILE_SIZE];
  }

  function boardWorldToTile(x: number, z: number): Tile | null {
    const c = Math.round(x / TILE_SIZE + HALF_SPAN);
    const r = Math.round(z / TILE_SIZE + HALF_SPAN);
    if (c < 0 || c >= GRID_SIZE || r < 0 || r >= GRID_SIZE) return null;
    return [c, r];
  }

  test("worldToTile and tileToWorld round-trip through a tile's center", () => {
    const grid = createTacticalGrid({ width: GRID_SIZE, height: GRID_SIZE, world: { origin: ORIGIN, tileSize: TILE_SIZE } });
    for (const tile of [[0, 0], [3, 5], [7, 7]] as Tile[]) {
      const [x, z] = grid.tileToWorld(tile);
      expect(grid.worldToTile(x, z)).toEqual(tile);
    }
  });

  test("worldToTile returns null outside the grid", () => {
    const grid = createTacticalGrid({ width: GRID_SIZE, height: GRID_SIZE, world: { origin: ORIGIN, tileSize: TILE_SIZE } });
    expect(grid.worldToTile(-1000, 0)).toBeNull();
    expect(grid.worldToTile(0, 1000)).toBeNull();
  });

  test("worldToTile/tileToWorld throw without config.world", () => {
    const grid = createTacticalGrid({ width: 4, height: 4 });
    expect(() => grid.worldToTile(0, 0)).toThrow();
    expect(() => grid.tileToWorld([0, 0])).toThrow();
  });

  test("matches grid-tactics board.ts math for an equivalent config", () => {
    const grid = createTacticalGrid({ width: GRID_SIZE, height: GRID_SIZE, world: { origin: ORIGIN, tileSize: TILE_SIZE } });
    for (const tile of [[0, 0], [1, 2], [4, 4], [7, 0], [0, 7]] as Tile[]) {
      const expected = boardTileToWorld(tile);
      const actual = grid.tileToWorld(tile);
      expect(actual[0]).toBeCloseTo(expected[0]);
      expect(actual[1]).toBeCloseTo(expected[1]);
      expect(grid.worldToTile(expected[0], expected[1])).toEqual(boardWorldToTile(expected[0], expected[1]));
    }
  });
});

describe("snapshot", () => {
  test("capture and restore round-trips occupancy and walls", () => {
    const grid = createTacticalGrid({ width: 4, height: 4 });
    grid.place("a", [1, 1]);
    grid.setBlocked([2, 2], true);
    const snap = grid.capture();
    grid.move("a", [3, 3]);
    grid.setBlocked([2, 2], false);
    grid.restore(snap);
    expect(grid.tileOf("a")).toEqual([1, 1]);
    expect(grid.isBlocked([2, 2])).toBe(true);
  });
});
