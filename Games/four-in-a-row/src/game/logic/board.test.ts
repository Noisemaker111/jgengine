import { describe, expect, test } from "bun:test";

import {
  COLS,
  ROWS,
  boardFromMoves,
  createBoard,
  drop,
  findWinner,
  index,
  type Cell,
  type Move,
  type Player,
  winningLineFrom,
} from "./board";

function emptyCells(): Cell[] {
  return new Array<Cell>(COLS * ROWS).fill(0);
}

function put(cells: Cell[], col: number, row: number, player: Player): void {
  cells[index(col, row)] = player;
}

function lineSet(cols: [number, number][]): Set<number> {
  return new Set(cols.map(([c, r]) => index(c, r)));
}

function play(cols: number[], first: Player = 1) {
  return boardFromMoves(
    cols.map((col) => ({ col, row: 0, player: 1 as Player }) as Move),
    first,
  );
}

describe("board — drop & stack", () => {
  test("a disc falls to the lowest empty row and stacks upward", () => {
    let board = createBoard(1);
    board = drop(board, 3)!;
    expect(board.moves[0]).toEqual({ col: 3, row: 0, player: 1 });
    expect(board.heights[3]).toBe(1);
    board = drop(board, 3)!;
    expect(board.moves[1]).toEqual({ col: 3, row: 1, player: 2 });
    expect(board.heights[3]).toBe(2);
    expect(board.cells[index(3, 0)]).toBe(1);
    expect(board.cells[index(3, 1)]).toBe(2);
  });

  test("current player alternates after each drop", () => {
    let board = createBoard(1);
    expect(board.current).toBe(1);
    board = drop(board, 0)!;
    expect(board.current).toBe(2);
    board = drop(board, 1)!;
    expect(board.current).toBe(1);
  });

  test("a full column and out-of-range columns reject the drop", () => {
    let board = createBoard(1);
    for (let i = 0; i < ROWS; i += 1) board = drop(board, 2)!;
    expect(board.heights[2]).toBe(ROWS);
    expect(drop(board, 2)).toBeNull();
    expect(drop(board, -1)).toBeNull();
    expect(drop(board, COLS)).toBeNull();
  });
});

describe("board — win detection in all four directions and at edges", () => {
  test("horizontal along the bottom edge row", () => {
    const cells = emptyCells();
    for (let c = 0; c < 4; c += 1) put(cells, c, 0, 1);
    const win = findWinner(cells);
    expect(win?.player).toBe(1);
    expect(new Set(win?.line)).toEqual(lineSet([[0, 0], [1, 0], [2, 0], [3, 0]]));
  });

  test("horizontal along the top edge row", () => {
    const cells = emptyCells();
    for (let c = 3; c < 7; c += 1) put(cells, c, ROWS - 1, 2);
    expect(findWinner(cells)?.player).toBe(2);
  });

  test("vertical on the left and right edge columns", () => {
    const left = emptyCells();
    for (let r = 0; r < 4; r += 1) put(left, 0, r, 1);
    expect(findWinner(left)?.player).toBe(1);

    const right = emptyCells();
    for (let r = 2; r < 6; r += 1) put(right, COLS - 1, r, 2);
    const win = findWinner(right);
    expect(win?.player).toBe(2);
    expect(new Set(win?.line)).toEqual(lineSet([[6, 2], [6, 3], [6, 4], [6, 5]]));
  });

  test("diagonal ↗ from the corner", () => {
    const cells = emptyCells();
    for (let k = 0; k < 4; k += 1) put(cells, k, k, 1);
    expect(winningLineFrom(cells, 0, 0, 1)).not.toBeNull();
    expect(findWinner(cells)?.player).toBe(1);
  });

  test("diagonal ↘ ending at the corner", () => {
    const cells = emptyCells();
    put(cells, 0, 3, 2);
    put(cells, 1, 2, 2);
    put(cells, 2, 1, 2);
    put(cells, 3, 0, 2);
    const win = findWinner(cells);
    expect(win?.player).toBe(2);
    expect(new Set(win?.line)).toEqual(lineSet([[0, 3], [1, 2], [2, 1], [3, 0]]));
  });

  test("three in a row is not a win", () => {
    const cells = emptyCells();
    for (let c = 0; c < 3; c += 1) put(cells, c, 0, 1);
    expect(findWinner(cells)).toBeNull();
  });
});

describe("board — drop integration & terminal state", () => {
  test("an alternating game resolves a horizontal win and then rejects further drops", () => {
    // p1 builds row 0 across cols 0..3; p2 stacks on top.
    const board = play([0, 0, 1, 1, 2, 2, 3]);
    expect(board.status).toBe("won");
    expect(board.winner).toBe(1);
    expect(new Set(board.winningLine)).toEqual(lineSet([[0, 0], [1, 0], [2, 0], [3, 0]]));
    expect(drop(board, 4)).toBeNull(); // game is over
  });

  test("a vertical stack wins on the fourth disc", () => {
    const board = play([5, 0, 5, 1, 5, 2, 5]);
    expect(board.status).toBe("won");
    expect(board.winner).toBe(1);
    expect(new Set(board.winningLine)).toEqual(lineSet([[5, 0], [5, 1], [5, 2], [5, 3]]));
  });
});

describe("board — draw detection", () => {
  test("a full board with no four in a row is a draw", () => {
    // Verified fill order that saturates all 42 cells without ever making four.
    const order = [3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 0, 1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6];
    const board = play(order);
    expect(board.moves.length).toBe(COLS * ROWS);
    expect(board.status).toBe("draw");
    expect(board.winner).toBeNull();
    expect(findWinner(board.cells)).toBeNull();
    expect(board.heights.every((h) => h === ROWS)).toBe(true);
  });
});
