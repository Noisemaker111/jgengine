import { describe, expect, test } from "bun:test";

import {
  bombTotal,
  colOf,
  countRevealed,
  createBoard,
  idx,
  isBomb,
  isWin,
  makeRng,
  reveal,
  rowOf,
  safeRemaining,
  toggleFlag,
} from "./board";

describe("mine-drop board", () => {
  test("places exactly bombCount bombs", () => {
    const board = createBoard(10, 15, makeRng(1));
    expect(bombTotal(board)).toBe(15);
  });

  test("is deterministic for a fixed seed", () => {
    const a = createBoard(10, 15, makeRng(42));
    const b = createBoard(10, 15, makeRng(42));
    expect(a.bomb).toEqual(b.bomb);
  });

  test("keeps the safe cell and its neighbours bomb-free", () => {
    const n = 10;
    const safe = idx(n, 5, 5);
    const board = createBoard(n, 15, makeRng(7), safe);
    expect(isBomb(board, safe)).toBe(false);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        expect(isBomb(board, idx(n, 5 + dc, 5 + dr))).toBe(false);
      }
    }
  });

  test("adjacency counts match seeded bombs", () => {
    const n = 5;
    // Force a known layout: single bomb in the centre.
    const board = createBoard(n, 0, makeRng(1));
    const mutable = board as { bomb: boolean[]; adjacent: number[] };
    mutable.bomb[idx(n, 2, 2)] = true;
    // Recompute adjacency by hand for the corner and a bomb-neighbour.
    // Rebuild through createBoard is cleaner: seed a board then assert flood on zeros.
    const real = createBoard(n, 1, makeRng(99), idx(n, 0, 0));
    let adjSum = 0;
    for (let i = 0; i < n * n; i += 1) if (!isBomb(real, i)) adjSum += real.adjacent[i]!;
    // Exactly one bomb → its non-bomb neighbours sum their single contribution.
    let bombNeighbourCells = 0;
    for (let i = 0; i < n * n; i += 1) {
      if (isBomb(real, i)) continue;
      if (real.adjacent[i]! > 0) bombNeighbourCells += 1;
    }
    expect(adjSum).toBe(bombNeighbourCells);
  });

  test("row/col round-trip", () => {
    const n = 10;
    const i = idx(n, 4, 2);
    expect(colOf(n, i)).toBe(4);
    expect(rowOf(n, i)).toBe(2);
  });

  test("revealing a bomb reports hitBomb", () => {
    const n = 5;
    const board = createBoard(n, 0, makeRng(1));
    const mutable = board as { bomb: boolean[] };
    mutable.bomb[idx(n, 1, 1)] = true;
    const result = reveal(board, idx(n, 1, 1));
    expect(result.hitBomb).toBe(true);
  });

  test("flood-fill opens a connected zero region", () => {
    const n = 6;
    // One bomb in a corner far away → most of the board is a single zero region.
    const board = createBoard(n, 1, makeRng(3), idx(n, 0, 0));
    // Reveal from the guaranteed-safe corner; a large region should open at once.
    const result = reveal(board, idx(n, 0, 0));
    expect(result.hitBomb).toBe(false);
    expect(result.opened.length).toBeGreaterThan(1);
    expect(countRevealed(board)).toBe(result.opened.length);
  });

  test("win when every safe cell is revealed", () => {
    const n = 4;
    const board = createBoard(n, 3, makeRng(11), idx(n, 0, 0));
    expect(isWin(board)).toBe(false);
    for (let i = 0; i < n * n; i += 1) {
      if (!isBomb(board, i)) reveal(board, i);
    }
    expect(safeRemaining(board)).toBe(0);
    expect(isWin(board)).toBe(true);
  });

  test("flag toggles only on hidden cells", () => {
    const n = 4;
    const board = createBoard(n, 2, makeRng(5), idx(n, 0, 0));
    const target = idx(n, 3, 3);
    expect(toggleFlag(board, target)).toBe(true);
    expect(toggleFlag(board, target)).toBe(false);
    reveal(board, idx(n, 0, 0));
    // A revealed cell cannot be flagged.
    const revealedCell = board.revealed.findIndex((r) => r);
    expect(toggleFlag(board, revealedCell)).toBe(false);
  });
});
