import { describe, expect, test } from "bun:test";

import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  clearLines,
  collides,
  createBoard,
  dropDistance,
  gravityInterval,
  levelForLines,
  lineScore,
  merge,
  type Cell,
} from "./logic";
import { createTetrisStore } from "./store";

function fillRow(cells: Cell[], width: number, y: number, gap = -1): void {
  for (let x = 0; x < width; x += 1) cells[y * width + x] = x === gap ? null : "I";
}

describe("board geometry", () => {
  test("board has the classic 10x20 shape", () => {
    const board = createBoard();
    expect(board.width).toBe(BOARD_WIDTH);
    expect(board.height).toBe(BOARD_HEIGHT);
    expect(board.cells.length).toBe(200);
    expect(board.cells.every((cell) => cell === null)).toBe(true);
  });

  test("collides detects walls, floor, and stacked cells", () => {
    const board = createBoard();
    expect(collides(board, { type: "O", rotation: 0, x: 3, y: 0 })).toBe(false);
    expect(collides(board, { type: "O", rotation: 0, x: -2, y: 0 })).toBe(true);
    expect(collides(board, { type: "O", rotation: 0, x: 3, y: BOARD_HEIGHT })).toBe(true);
    const stacked = merge(board, { type: "O", rotation: 0, x: 3, y: 18 });
    expect(collides(stacked, { type: "O", rotation: 0, x: 3, y: 18 })).toBe(true);
  });

  test("dropDistance lands a piece on the floor", () => {
    const board = createBoard();
    const distance = dropDistance(board, { type: "O", rotation: 0, x: 3, y: 0 });
    expect(distance).toBe(BOARD_HEIGHT - 2);
  });
});

describe("line clears", () => {
  test("a full row is cleared and rows above collapse", () => {
    const board = createBoard();
    const cells = board.cells.slice();
    fillRow(cells, board.width, BOARD_HEIGHT - 1);
    const result = clearLines({ ...board, cells });
    expect(result.cleared).toBe(1);
    expect(result.board.cells.every((cell) => cell === null)).toBe(true);
  });

  test("a row with a gap is not cleared", () => {
    const board = createBoard();
    const cells = board.cells.slice();
    fillRow(cells, board.width, BOARD_HEIGHT - 1, 4);
    const result = clearLines({ ...board, cells });
    expect(result.cleared).toBe(0);
  });

  test("four simultaneous rows clear as a tetris", () => {
    const board = createBoard();
    const cells = board.cells.slice();
    for (let y = BOARD_HEIGHT - 4; y < BOARD_HEIGHT; y += 1) fillRow(cells, board.width, y);
    const result = clearLines({ ...board, cells });
    expect(result.cleared).toBe(4);
  });
});

describe("scoring and gravity", () => {
  test("classic line score scales with cleared count and level", () => {
    expect(lineScore(1, 0)).toBe(40);
    expect(lineScore(2, 0)).toBe(100);
    expect(lineScore(3, 0)).toBe(300);
    expect(lineScore(4, 0)).toBe(1200);
    expect(lineScore(4, 1)).toBe(2400);
    expect(lineScore(0, 5)).toBe(0);
  });

  test("level advances every ten lines", () => {
    expect(levelForLines(0)).toBe(0);
    expect(levelForLines(9)).toBe(0);
    expect(levelForLines(10)).toBe(1);
    expect(levelForLines(25)).toBe(2);
  });

  test("gravity accelerates with level and is floored", () => {
    expect(gravityInterval(0)).toBeGreaterThan(gravityInterval(3));
    expect(gravityInterval(100)).toBeGreaterThanOrEqual(0.05);
  });
});

describe("store", () => {
  test("boots into a playable state with a queue and active piece", () => {
    const store = createTetrisStore("seed-a");
    const state = store.getState();
    expect(state.status).toBe("playing");
    expect(state.active).not.toBeNull();
    expect(state.next.length).toBe(5);
  });

  test("hard drop awards points and settles a new piece at the top", () => {
    const store = createTetrisStore("seed-b");
    const before = store.getState();
    store.hardDrop();
    const after = store.getState();
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.active).not.toBeNull();
    expect(after.active?.y).toBe(0);
  });

  test("gravity moves the active piece downward over time", () => {
    const store = createTetrisStore("seed-c");
    const startY = store.getState().active?.y ?? -1;
    store.tick(1.0);
    const nextY = store.getState().active?.y ?? -1;
    expect(nextY).toBeGreaterThan(startY);
  });

  test("hold swaps the active piece and locks until the next lock", () => {
    const store = createTetrisStore("seed-d");
    const first = store.getState().active?.type;
    store.swapHold();
    expect(store.getState().hold).toBe(first ?? null);
    expect(store.getState().canHold).toBe(false);
  });
});
