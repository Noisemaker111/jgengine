import { describe, expect, test } from "bun:test";
import { buildNavAdjacency } from "./navMesh";
import { composeNavTiles, createNavTiles, navTileFromGrid, type NavTileRequest } from "./navTiles";

/** A world 0..64 x 0..32 with a wall at x 40..44 for z < 24 and a costly road band at z 8..12. */
function areaAt(blocked: { x0: number; x1: number; z1: number } | null) {
  return (x: number, z: number): number | null => {
    if (blocked !== null && x >= blocked.x0 && x < blocked.x1 && z < blocked.z1) return null;
    return z >= 8 && z < 12 ? 1 : 0;
  };
}

function builder(rule: (x: number, z: number) => number | null, built: string[]) {
  return (tile: NavTileRequest) => {
    built.push(tile.id);
    return navTileFromGrid({ bounds: tile.bounds, cellSize: 2, areaAt: rule });
  };
}

describe("navTileFromGrid", () => {
  test("merges runs of one area into rectangles that share edges", () => {
    const tile = navTileFromGrid({ bounds: { min: [0, 0], max: [8, 8] }, cellSize: 2, areaAt: (x, z) => (x < 2 && z < 2 ? null : z < 4 ? 1 : 0) });
    expect(tile.polys.length).toBeLessThanOrEqual(3);
    expect(new Set(tile.areas)).toEqual(new Set([0, 1]));
    const adjacency = buildNavAdjacency(tile);
    expect(adjacency.every((entry) => entry.neighbors.length > 0)).toBe(true);
  });
});

describe("createNavTiles", () => {
  test("routes across a tile border as if the tiles were one mesh", () => {
    const built: string[] = [];
    const tiles = createNavTiles({ tileSize: 32, build: builder(areaAt(null), built) });
    tiles.load(["0,0", "1,0"]);
    const path = tiles.runtime.plan([2, 0, 20], [62, 0, 20]);
    expect(path?.partial).toBeUndefined();
    expect(path?.points).toEqual([[2, 0, 20], [62, 0, 20]]);
    expect(tiles.stats().tiles).toBe(2);
  });

  test("stitches borders where the two tiles split their edges differently", () => {
    const left = navTileFromGrid({ bounds: { min: [0, 0], max: [8, 8] }, cellSize: 2, areaAt: () => 0 });
    const right = navTileFromGrid({ bounds: { min: [8, 0], max: [16, 8] }, cellSize: 2, areaAt: (_x, z) => (z < 2 ? 1 : z < 6 ? 0 : 2) });
    const mesh = composeNavTiles([left, right], 8);
    const adjacency = buildNavAdjacency(mesh);
    expect(adjacency[0]?.neighbors.length).toBe(right.polys.length);
  });

  test("routes around a wall and prices the road band by area cost", () => {
    const built: string[] = [];
    const tiles = createNavTiles({ tileSize: 32, build: builder(areaAt({ x0: 40, x1: 44, z1: 24 }), built), areaCosts: { 1: 50 } });
    tiles.load(["0,0", "1,0"]);
    const path = tiles.runtime.plan([36, 0, 4], [48, 0, 4]);
    expect(path?.partial).toBeUndefined();
    expect(Math.max(...(path?.points ?? []).map((point) => point[2]))).toBeGreaterThanOrEqual(24);
  });

  test("rebuilds only the tiles a changed region touches, keeping the others' polygons", () => {
    const built: string[] = [];
    let wall: { x0: number; x1: number; z1: number } | null = null;
    const tiles = createNavTiles({ tileSize: 32, build: (tile) => builder(areaAt(wall), built)(tile) });
    tiles.load(["0,0", "1,0"]);
    expect(built).toEqual(["0,0", "1,0"]);
    const before = tiles.runtime.findPolygon([10, 0, 20]);
    wall = { x0: 40, x1: 44, z1: 24 };
    expect(tiles.invalidate({ min: [40, 0], max: [44, 24] })).toEqual(["1,0"]);
    expect(built).toEqual(["0,0", "1,0", "1,0"]);
    expect(tiles.runtime.findPolygon([10, 0, 20])).toBe(before);
    expect(tiles.runtime.raycast([36, 0, 4], [48, 0, 4])).toBe(false);
  });

  test("an unloaded tile keeps its build in the store and is not rebuilt on return", () => {
    const built: string[] = [];
    const tiles = createNavTiles({ tileSize: 32, build: builder(areaAt(null), built) });
    tiles.load(["0,0", "1,0"]);
    tiles.unload(["1,0"]);
    expect(tiles.runtime.plan([2, 0, 20], [62, 0, 20])?.points.at(-1)?.[0]).toBe(32);
    tiles.load(["1,0"]);
    expect(built).toEqual(["0,0", "1,0"]);
    expect(tiles.runtime.plan([2, 0, 20], [62, 0, 20])?.points.at(-1)).toEqual([62, 0, 20]);
  });

  test("streams tiles around focus points within the per-update budget", () => {
    const built: string[] = [];
    const tiles = createNavTiles({
      tileSize: 32,
      build: builder(() => 0, built),
      streaming: { area: { min: [0, 0], max: [256, 32] }, loadRadius: 40, keepRadius: 70, loadsPerUpdate: 1 },
    });
    expect(tiles.follow({ x: 16, z: 16 }).load).toEqual(["0,0"]);
    expect(tiles.follow({ x: 16, z: 16 }).load).toEqual(["1,0"]);
    expect(tiles.follow({ x: 16, z: 16 }).load).toEqual([]);
    tiles.follow({ x: 240, z: 16 });
    tiles.follow({ x: 240, z: 16 });
    expect(tiles.loaded()).toEqual(["6,0", "7,0"]);
  });

  test("restores the routed tiles from a JSON snapshot", () => {
    const tiles = createNavTiles({ tileSize: 32, build: builder(() => 0, []), areaCosts: { 1: 3 } });
    tiles.load(["0,0", "1,0"]);
    const saved = JSON.parse(JSON.stringify(tiles.snapshot()));
    const copy = createNavTiles({ tileSize: 32, build: builder(() => 0, []) });
    copy.restore(saved);
    expect(copy.loaded()).toEqual(["0,0", "1,0"]);
    expect(copy.snapshot().runtime.areaCosts).toEqual({ 1: 3 });
    expect(copy.runtime.plan([2, 0, 20], [62, 0, 20])?.partial).toBeUndefined();
  });
});
