import { describe, expect, test } from "bun:test";

import {
  conflictCells,
  createBoard,
  errorCells,
  eraseCell,
  hintCell,
  isGiven,
  placeDigit,
  toggleNote,
  type Board,
} from "./board";
import { hasNote, indexOf, rowOf } from "./grid";

function emptyCellsInRow(board: Board, row: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < 9; c += 1) {
    const i = indexOf(row, c);
    if (board.values[i] === 0) out.push(i);
  }
  return out;
}

function firstEmpty(board: Board): number {
  return board.values.findIndex((v) => v === 0);
}

describe("sudoku board — conflict detection", () => {
  test("a freshly generated board (givens only) has no conflicts", () => {
    const board = createBoard("easy", "no-conflict");
    expect(conflictCells(board).size).toBe(0);
  });

  test("two identical digits in the same row flag both cells", () => {
    const board = createBoard("easy", "row-conflict");
    const empties = emptyCellsInRow(board, rowOf(firstEmpty(board)));
    const [a, b] = [empties[0], empties[1]];
    let next = placeDigit(board, a, 5);
    next = placeDigit(next, b, 5);
    const bad = conflictCells(next);
    expect(bad.has(a)).toBe(true);
    expect(bad.has(b)).toBe(true);
  });

  test("errorCells flags a value that disagrees with the solution", () => {
    const board = createBoard("easy", "errors");
    const i = firstEmpty(board);
    const wrong = board.solution[i] === 9 ? 1 : board.solution[i] + 1;
    const bad = placeDigit(board, i, wrong);
    expect(errorCells(bad).has(i)).toBe(true);
    const right = placeDigit(board, i, board.solution[i]);
    expect(errorCells(right).has(i)).toBe(false);
  });
});

describe("sudoku board — placement, notes, erase", () => {
  test("given cells are immutable", () => {
    const board = createBoard("easy", "immutable");
    const given = board.values.findIndex((v, i) => isGiven(board, i));
    const after = placeDigit(board, given, 1);
    expect(after).toBe(board);
  });

  test("re-placing the same digit clears the cell", () => {
    const board = createBoard("easy", "toggle");
    const i = firstEmpty(board);
    const placed = placeDigit(board, i, 3);
    expect(placed.values[i]).toBe(3);
    const cleared = placeDigit(placed, i, 3);
    expect(cleared.values[i]).toBe(0);
  });

  test("placing a digit auto-removes that note from peers", () => {
    const board = createBoard("easy", "auto-notes");
    const i = firstEmpty(board);
    // A peer that shares row i's row and is itself empty.
    const peer = emptyCellsInRow(board, rowOf(i)).find((p) => p !== i);
    expect(peer).not.toBeUndefined();
    const noted = toggleNote(board, peer as number, 7);
    expect(hasNote(noted.notes[peer as number], 7)).toBe(true);
    const placed = placeDigit(noted, i, 7);
    expect(hasNote(placed.notes[peer as number], 7)).toBe(false);
  });

  test("toggleNote adds then removes a candidate, and never notes a given", () => {
    const board = createBoard("easy", "notes");
    const i = firstEmpty(board);
    let next = toggleNote(board, i, 4);
    expect(hasNote(next.notes[i], 4)).toBe(true);
    next = toggleNote(next, i, 4);
    expect(hasNote(next.notes[i], 4)).toBe(false);
    const given = board.values.findIndex((_, idx) => isGiven(board, idx));
    expect(toggleNote(board, given, 4)).toBe(board);
  });

  test("erase clears value and notes of a user cell", () => {
    const board = createBoard("easy", "erase");
    const i = firstEmpty(board);
    const placed = placeDigit(board, i, 2);
    const erased = eraseCell(placed, i);
    expect(erased.values[i]).toBe(0);
    expect(erased.notes[i]).toBe(0);
  });
});

describe("sudoku board — win and timer", () => {
  test("timer stays stopped until the first input", () => {
    const board = createBoard("easy", "timer");
    expect(board.started).toBe(false);
    const i = firstEmpty(board);
    expect(placeDigit(board, i, 1).started).toBe(true);
  });

  test("filling every cell to the solution wins", () => {
    let board = createBoard("easy", "win");
    for (let i = 0; i < 81; i += 1) {
      if (!isGiven(board, i)) board = placeDigit(board, i, board.solution[i]);
    }
    expect(board.status).toBe("won");
    expect(conflictCells(board).size).toBe(0);
  });

  test("hint reveals the correct value and counts up", () => {
    const board = createBoard("easy", "hint");
    const i = firstEmpty(board);
    const hinted = hintCell(board, i);
    expect(hinted.values[i]).toBe(board.solution[i]);
    expect(hinted.hintsUsed).toBe(1);
  });
});
