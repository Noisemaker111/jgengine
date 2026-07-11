import { describe, expect, test } from "bun:test";

import {
  BLAST_BOMB,
  BLAST_SHOT,
  blastPattern,
  cellAtPoint,
  createBunkerCells,
  erodeBunker,
  type BunkerCells,
} from "./bunkers";
import { BUNKER_BLOCK, BUNKER_Y } from "./constants";

function solidCount(cells: BunkerCells): number {
  let total = 0;
  for (const row of cells) for (const cell of row) if (cell) total += 1;
  return total;
}

describe("bunker construction", () => {
  test("fresh bunker carries the full shield shape", () => {
    expect(solidCount(createBunkerCells())).toBe(74);
  });

  test("two fresh bunkers are identical but independent", () => {
    const a = createBunkerCells();
    const b = createBunkerCells();
    expect(a).toEqual(b);
    erodeBunker(a, 5, 3, BLAST_SHOT);
    expect(a).not.toEqual(b);
  });
});

describe("blast patterns", () => {
  test("radius-1 diamond is five cells", () => {
    expect(blastPattern(1).length).toBe(5);
  });

  test("radius-2 diamond is thirteen cells", () => {
    expect(blastPattern(2).length).toBe(13);
  });
});

describe("erosion determinism", () => {
  test("same impact on identical bunkers yields identical results", () => {
    const a = createBunkerCells();
    const b = createBunkerCells();
    const removedA = erodeBunker(a, 5, 3, BLAST_BOMB);
    const removedB = erodeBunker(b, 5, 3, BLAST_BOMB);
    expect(removedA).toBe(removedB);
    expect(a).toEqual(b);
  });

  test("interior shot impact clears exactly its five-cell diamond", () => {
    const cells = createBunkerCells();
    const before = solidCount(cells);
    const removed = erodeBunker(cells, 5, 3, BLAST_SHOT);
    expect(removed).toBe(5);
    expect(solidCount(cells)).toBe(before - 5);
  });

  test("re-eroding already-cleared cells removes nothing", () => {
    const cells = createBunkerCells();
    erodeBunker(cells, 5, 3, BLAST_SHOT);
    expect(erodeBunker(cells, 5, 3, BLAST_SHOT)).toBe(0);
  });

  test("erosion never removes more cells than the pattern touches", () => {
    const cells = createBunkerCells();
    expect(erodeBunker(cells, 0, 0, BLAST_BOMB)).toBeLessThanOrEqual(BLAST_BOMB.length);
  });
});

describe("point-to-cell mapping", () => {
  test("maps a world point inside the bunker to a cell", () => {
    const leftX = 40;
    const cell = cellAtPoint(leftX, leftX + BUNKER_BLOCK * 3 + 1, BUNKER_Y + BUNKER_BLOCK * 2 + 1);
    expect(cell).toEqual({ col: 3, row: 2 });
  });

  test("returns null outside the bunker bounds", () => {
    expect(cellAtPoint(40, 4, BUNKER_Y)).toBeNull();
  });
});
