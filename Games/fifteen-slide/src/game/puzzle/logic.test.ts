import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

import {
  arrowMove,
  blankIndex,
  clickMove,
  countInversions,
  isPermutationOf,
  isSolvable,
  isSolved,
  shuffleByPermutation,
  shuffleByWalk,
  solvedBoard,
  solvedTiles,
  type Board,
  type SlideDir,
} from "./logic";

const SIZES = [3, 4, 5] as const;

describe("solved detection", () => {
  test("the ordered board with a trailing gap is solved", () => {
    for (const n of SIZES) expect(isSolved(solvedBoard(n))).toBe(true);
  });

  test("solvedTiles is 1..n^2-1 then the gap", () => {
    expect(solvedTiles(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(solvedTiles(4)[15]).toBe(0);
  });

  test("a gap anywhere but the last cell is not solved", () => {
    expect(isSolved({ n: 3, tiles: [1, 2, 3, 4, 5, 6, 7, 0, 8] })).toBe(false);
  });

  test("out-of-order tiles are not solved even with the gap last", () => {
    expect(isSolved({ n: 3, tiles: [2, 1, 3, 4, 5, 6, 7, 8, 0] })).toBe(false);
  });
});

describe("arrow move — a tile slides into the gap", () => {
  const solved3 = solvedBoard(3); // gap at index 8 (row 2, col 2)

  test("up pulls the tile below the gap up", () => {
    // gap at bottom row already — no tile below it
    expect(arrowMove(solved3, "up")).toBeNull();
  });

  test("down pulls the tile above the gap down", () => {
    const moved = arrowMove(solved3, "down")!;
    expect(moved.tiles).toEqual([1, 2, 3, 4, 5, 0, 7, 8, 6]);
    expect(blankIndex(moved.tiles)).toBe(5);
  });

  test("right pulls the tile left of the gap right", () => {
    const moved = arrowMove(solved3, "right")!;
    expect(moved.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(blankIndex(moved.tiles)).toBe(7);
  });

  test("left has no tile to the right of a corner gap", () => {
    expect(arrowMove(solved3, "left")).toBeNull();
  });

  test("a move and its reverse round-trips to the original board", () => {
    const down = arrowMove(solved3, "down")!;
    const back = arrowMove(down, "up")!;
    expect(back.tiles).toEqual(solved3.tiles);
  });

  test("every arrow move keeps a valid permutation", () => {
    for (const n of SIZES) {
      const scrambled: Board = { n, tiles: shuffleByWalk(n, seededRng(`arrow-${n}`), 40) };
      for (const dir of ["up", "down", "left", "right"] as SlideDir[]) {
        const moved = arrowMove(scrambled, dir);
        if (moved !== null) expect(isPermutationOf(moved.tiles, n)).toBe(true);
      }
    }
  });
});

describe("click move — whole-segment slide", () => {
  const solved3 = solvedBoard(3); // gap at row 2, col 2

  test("clicking a same-row tile slides the whole row segment toward the gap", () => {
    // click index 6 (row 2, col 0); gap col 2 -> tiles 7,8 shift right, gap lands at index 6
    const moved = clickMove(solved3, 6)!;
    expect(moved.tiles).toEqual([1, 2, 3, 4, 5, 6, 0, 7, 8]);
    expect(blankIndex(moved.tiles)).toBe(6);
  });

  test("clicking a same-column tile slides the whole column segment", () => {
    // click index 2 (row 0, col 2); gap row 2 col 2 -> tiles 3,6 shift down, gap to index 2
    const moved = clickMove(solved3, 2)!;
    expect(moved.tiles).toEqual([1, 2, 0, 4, 5, 3, 7, 8, 6]);
    expect(blankIndex(moved.tiles)).toBe(2);
  });

  test("clicking a tile adjacent to the gap moves exactly one tile", () => {
    const moved = clickMove(solved3, 7)!;
    expect(moved.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
  });

  test("clicking the gap is a no-op", () => {
    expect(clickMove(solved3, 8)).toBeNull();
  });

  test("clicking a tile off the gap's row and column is a no-op", () => {
    expect(clickMove(solved3, 0)).toBeNull(); // row 0, col 0 shares neither
  });

  test("a same-row segment click equals stepping single tiles", () => {
    const segment = clickMove(solved3, 6)!;
    const stepA = clickMove(solved3, 7)!;
    const stepB = clickMove(stepA, 6)!;
    expect(segment.tiles).toEqual(stepB.tiles);
  });
});

describe("inversions and solvability parity", () => {
  test("counts inversions ignoring the gap", () => {
    expect(countInversions([1, 2, 3, 0])).toBe(0);
    expect(countInversions([3, 2, 1, 0])).toBe(3);
    expect(countInversions([2, 1, 0, 3])).toBe(1);
  });

  test("solved boards are solvable at every size", () => {
    for (const n of SIZES) expect(isSolvable(solvedTiles(n), n)).toBe(true);
  });

  test("a single adjacent swap makes an odd board unsolvable", () => {
    // swap the 1 and 2 on a solved 3x3 -> one inversion, odd -> unsolvable
    expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0], 3)).toBe(false);
  });

  test("the classic 14/15 swap makes the 4x4 unsolvable", () => {
    const tiles = solvedTiles(4);
    tiles[13] = 15;
    tiles[14] = 14;
    expect(isSolvable(tiles, 4)).toBe(false);
  });
});

describe("shuffles are always solvable and never pre-solved", () => {
  test("random-walk shuffles across many seeds", () => {
    for (const n of SIZES) {
      for (let s = 0; s < 60; s += 1) {
        const tiles = shuffleByWalk(n, seededRng(`walk-${n}-${s}`), n * n * 12);
        expect(isPermutationOf(tiles, n)).toBe(true);
        expect(isSolvable(tiles, n)).toBe(true);
        expect(isSolved({ n, tiles })).toBe(false);
      }
    }
  });

  test("permutation shuffles across many seeds", () => {
    for (const n of SIZES) {
      for (let s = 0; s < 60; s += 1) {
        const tiles = shuffleByPermutation(n, seededRng(`perm-${n}-${s}`));
        expect(isPermutationOf(tiles, n)).toBe(true);
        expect(isSolvable(tiles, n)).toBe(true);
        expect(isSolved({ n, tiles })).toBe(false);
      }
    }
  });

  test("the same seed reproduces the same shuffle (deterministic)", () => {
    const a = shuffleByWalk(4, seededRng("share-me"), 480);
    const b = shuffleByWalk(4, seededRng("share-me"), 480);
    expect(a).toEqual(b);
    const p1 = shuffleByPermutation(5, seededRng("share-me"));
    const p2 = shuffleByPermutation(5, seededRng("share-me"));
    expect(p1).toEqual(p2);
  });

  test("different seeds generally produce different boards", () => {
    const a = shuffleByWalk(4, seededRng("seed-a"), 480);
    const b = shuffleByWalk(4, seededRng("seed-b"), 480);
    expect(a).not.toEqual(b);
  });
});
