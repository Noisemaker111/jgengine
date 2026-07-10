import { describe, expect, test } from "bun:test";

import { buildIceWorld, corridorCellCount } from "./build";
import { activeCellCount } from "./grid";
import { CORRIDOR_IDS } from "./grid";

describe("frostbite circuit ice world generation", () => {
  const world = buildIceWorld();

  test("hits the ~2000 ice-cell content budget", () => {
    const count = activeCellCount(world);
    expect(count).toBeGreaterThan(1800);
    expect(count).toBeLessThan(3200);
  });

  test("three corridors are each substantially represented", () => {
    for (const corridor of CORRIDOR_IDS) {
      expect(corridorCellCount(world, corridor)).toBeGreaterThan(400);
    }
  });

  test("corridors never share a cell (snow ridges keep them separated)", () => {
    const seen = new Set<string>();
    let overlaps = 0;
    for (let cz = 0; cz < world.grid.height; cz += 1) {
      for (let cx = 0; cx < world.grid.width; cx += 1) {
        const cell = world.grid.cells[cz * world.grid.width + cx];
        if (cell === null || cell === undefined) continue;
        const key = `${cx},${cz}`;
        if (seen.has(key)) overlaps += 1;
        seen.add(key);
      }
    }
    expect(overlaps).toBe(0);
  });

  test("every ice cell starts solid and uncrossed", () => {
    for (const cell of world.grid.cells) {
      if (cell === null) continue;
      expect(cell.status).toBe("solid");
      expect(cell.crossedThisLap).toBe(false);
    }
  });

  test("deterministic: two builds produce identical grids", () => {
    const a = buildIceWorld();
    const b = buildIceWorld();
    expect(a.grid.cells).toEqual(b.grid.cells);
  });
});
