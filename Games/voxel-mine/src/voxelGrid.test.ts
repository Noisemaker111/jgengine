import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { content } from "./content";
import { game } from "./game";
import { createVoxelGrid, type Vec3, type VoxelGrid } from "./voxelGrid";

function freshGrid(): VoxelGrid {
  const ctx = createGameContext({
    definition: game,
    content,
    player: { userId: "tester", isNew: true },
  });
  return createVoxelGrid(ctx);
}

describe("voxel grid raycast", () => {
  test("looking straight down hits the block below and reports the top face", () => {
    const grid = freshGrid();
    grid.set("block_grass", 0, 0, 0);
    const hit = grid.raycast([0, 5, 0], [0, -1, 0], 10);
    expect(hit).not.toBeNull();
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.normal).toEqual([0, 1, 0]);
  });

  test("horizontal ray reports the facing side normal for placement", () => {
    const grid = freshGrid();
    grid.set("block_stone", 0, 0, 0);
    const hit = grid.raycast([-3, 0.5, 0], [1, 0, 0], 10);
    expect(hit!.cell).toEqual([0, 0, 0]);
    expect(hit!.normal).toEqual([-1, 0, 0]);
    const placeAt: Vec3 = [
      hit!.cell[0] + hit!.normal[0],
      hit!.cell[1] + hit!.normal[1],
      hit!.cell[2] + hit!.normal[2],
    ];
    expect(placeAt).toEqual([-1, 0, 0]);
    expect(grid.has(placeAt[0], placeAt[1], placeAt[2])).toBe(false);
  });

  test("returns null when nothing is within reach", () => {
    const grid = freshGrid();
    grid.set("block_stone", 0, 0, 0);
    expect(grid.raycast([0, 5, 0], [0, 1, 0], 10)).toBeNull();
    expect(grid.raycast([0, 5, 0], [0, -1, 0], 2)).toBeNull();
  });

  test("a ray already inside a solid cell returns that cell with a zero normal", () => {
    const grid = freshGrid();
    grid.set("block_sand", 3, 3, 3);
    const hit = grid.raycast([3, 3.5, 3], [0, -1, 0], 4);
    expect(hit!.cell).toEqual([3, 3, 3]);
    expect(hit!.normal).toEqual([0, 0, 0]);
  });

  test("set refuses occupied cells and remove clears both index and scene", () => {
    const grid = freshGrid();
    expect(grid.set("block_grass", 1, 0, 1)).toBe(true);
    expect(grid.set("block_stone", 1, 0, 1)).toBe(false);
    expect(grid.count()).toBe(1);
    expect(grid.remove(1, 0, 1)).toBe(true);
    expect(grid.has(1, 0, 1)).toBe(false);
    expect(grid.remove(1, 0, 1)).toBe(false);
    expect(grid.count()).toBe(0);
  });
});
