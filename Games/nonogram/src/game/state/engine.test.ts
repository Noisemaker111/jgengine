import { describe, expect, test } from "bun:test";
import { puzzleById } from "../puzzles/catalog";
import type { Puzzle } from "../logic/types";
import {
  colClueDone,
  emptyBoard,
  isSolved,
  reduceClear,
  reduceStrokeAdd,
  reduceStrokeStart,
  reduceUndo,
  rowClueDone,
  toggleTarget,
} from "./engine";
import type { AppState } from "./types";

const heart = puzzleById("heart") as Puzzle;

function baseState(puzzle: Puzzle, mistakesMode: boolean): AppState {
  return {
    view: "play",
    puzzleId: puzzle.id,
    size: puzzle.size,
    board: emptyBoard(puzzle.size),
    status: "solving",
    paintMode: "fill",
    mistakesMode,
    strikes: 0,
    maxStrikes: 3,
    elapsedMs: 0,
    running: true,
    stroke: null,
    history: [],
    bestMs: null,
    completed: [],
    newRecord: false,
  };
}

function fillSolution(state: AppState, puzzle: Puzzle): AppState {
  let next = state;
  for (let r = 0; r < puzzle.size; r += 1)
    for (let c = 0; c < puzzle.size; c += 1)
      if (puzzle.solution[r][c]) {
        next = reduceStrokeStart(next, puzzle, r, c, "fill");
      }
  return next;
}

describe("toggleTarget", () => {
  test("sets the wanted mark, or clears when it matches", () => {
    expect(toggleTarget("blank", "fill")).toBe("fill");
    expect(toggleTarget("fill", "fill")).toBe("blank");
    expect(toggleTarget("cross", "fill")).toBe("fill");
    expect(toggleTarget("cross", "cross")).toBe("blank");
  });
});

describe("solve flow", () => {
  test("filling exactly the solution wins", () => {
    const won = fillSolution(baseState(heart, false), heart);
    expect(won.status).toBe("won");
    expect(won.running).toBe(false);
    expect(isSolved(won.board, heart)).toBe(true);
  });

  test("a spurious extra fill blocks the win in free mode", () => {
    let state = baseState(heart, false);
    // heart[4][0] is empty; filling it must prevent a solved board.
    expect(heart.solution[4][0]).toBe(false);
    state = reduceStrokeStart(state, heart, 4, 0, "fill");
    state = fillSolution(state, heart);
    expect(state.status).toBe("solving");
  });

  test("second click on a filled cell erases it", () => {
    let state = baseState(heart, false);
    state = reduceStrokeStart(state, heart, 0, 1, "fill");
    expect(state.board[0][1]).toBe("fill");
    state = reduceStrokeStart(state, heart, 0, 1, "fill");
    expect(state.board[0][1]).toBe("blank");
  });
});

describe("mistakes mode", () => {
  test("filling an empty cell strikes and auto-crosses it", () => {
    let state = baseState(heart, true);
    expect(heart.solution[4][0]).toBe(false);
    state = reduceStrokeStart(state, heart, 4, 0, "fill");
    expect(state.strikes).toBe(1);
    expect(state.board[4][0]).toBe("cross");
    expect(state.status).toBe("solving");
  });

  test("re-touching a known-wrong cell does not double-strike", () => {
    let state = baseState(heart, true);
    state = reduceStrokeStart(state, heart, 4, 0, "fill");
    state = reduceStrokeStart(state, heart, 4, 0, "fill");
    expect(state.strikes).toBe(1);
  });

  test("reaching max strikes fails the board", () => {
    let state = baseState(heart, true);
    const empties: Array<[number, number]> = [];
    for (let r = 0; r < heart.size && empties.length < 3; r += 1)
      for (let c = 0; c < heart.size && empties.length < 3; c += 1)
        if (!heart.solution[r][c]) empties.push([r, c]);
    for (const [r, c] of empties) state = reduceStrokeStart(state, heart, r, c, "fill");
    expect(state.strikes).toBe(3);
    expect(state.status).toBe("failed");
    expect(state.running).toBe(false);
  });

  test("mistakes-mode fills can still win (no spurious fills persist)", () => {
    const won = fillSolution(baseState(heart, true), heart);
    expect(won.status).toBe("won");
  });
});

describe("undo and clear", () => {
  test("undo restores the previous board and strikes", () => {
    let state = baseState(heart, false);
    state = reduceStrokeStart(state, heart, 0, 1, "fill");
    state = reduceStrokeStart(state, heart, 1, 0, "fill");
    state = reduceUndo(state);
    expect(state.board[1][0]).toBe("blank");
    expect(state.board[0][1]).toBe("fill");
    state = reduceUndo(state);
    expect(state.board[0][1]).toBe("blank");
  });

  test("clear resets the board, strikes, and timer", () => {
    let state = baseState(heart, true);
    state = reduceStrokeStart(state, heart, 4, 0, "fill");
    state = { ...state, elapsedMs: 5000 };
    state = reduceClear(state);
    expect(state.board.flat().every((m) => m === "blank")).toBe(true);
    expect(state.strikes).toBe(0);
    expect(state.elapsedMs).toBe(0);
    expect(state.history.length).toBe(0);
  });
});

describe("clue completion (auto-dim)", () => {
  test("a correctly filled line reports its clue as done", () => {
    let state = baseState(heart, false);
    // Row 1 of the heart is fully filled.
    for (let c = 0; c < heart.size; c += 1)
      if (heart.solution[1][c]) state = reduceStrokeStart(state, heart, 1, c, "fill");
    expect(rowClueDone(state.board, 1, heart)).toBe(true);
    expect(rowClueDone(state.board, 0, heart)).toBe(false);
  });

  test("a fully solved board dims every row and column clue", () => {
    const won = fillSolution(baseState(heart, false), heart);
    for (let i = 0; i < heart.size; i += 1) {
      expect(rowClueDone(won.board, i, heart)).toBe(true);
      expect(colClueDone(won.board, i, heart)).toBe(true);
    }
  });
});

describe("drag stroke", () => {
  test("a stroke paints a run of cells in one fixed state", () => {
    let state = baseState(heart, false);
    state = reduceStrokeStart(state, heart, 2, 0, "fill");
    for (let c = 1; c < heart.size; c += 1) state = reduceStrokeAdd(state, heart, 2, c);
    expect(state.board[2].every((m) => m === "fill")).toBe(true);
  });
});
