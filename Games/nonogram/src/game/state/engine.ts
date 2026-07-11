import { cluesEqual, runsOf } from "../logic/clues";
import type { Mark, Puzzle } from "../logic/types";
import type { AppState, HistoryEntry } from "./types";

const HISTORY_LIMIT = 250;

export function emptyBoard(size: number): Mark[][] {
  return Array.from({ length: size }, () => new Array<Mark>(size).fill("blank"));
}

export function cloneBoard(board: Mark[][]): Mark[][] {
  return board.map((row) => row.slice());
}

export function toggleTarget(current: Mark, want: Mark): Mark {
  return current === want ? "blank" : want;
}

export function isSolved(board: Mark[][], puzzle: Puzzle): boolean {
  for (let r = 0; r < puzzle.size; r += 1)
    for (let c = 0; c < puzzle.size; c += 1)
      if ((board[r][c] === "fill") !== puzzle.solution[r][c]) return false;
  return true;
}

export function rowClueDone(board: Mark[][], r: number, puzzle: Puzzle): boolean {
  const mask = board[r].map((m) => m === "fill");
  return cluesEqual(runsOf(mask), puzzle.rowClues[r]);
}

export function colClueDone(board: Mark[][], c: number, puzzle: Puzzle): boolean {
  const mask = board.map((row) => row[c] === "fill");
  return cluesEqual(runsOf(mask), puzzle.colClues[c]);
}

// Mutates `board` in place; returns the resulting strike count for this cell.
function applyOne(
  board: Mark[][],
  r: number,
  c: number,
  value: Mark,
  puzzle: Puzzle,
  mistakesMode: boolean,
  strikes: number,
): number {
  if (value === "fill" && mistakesMode && !puzzle.solution[r][c]) {
    const alreadyKnown = board[r][c] === "cross";
    board[r][c] = "cross";
    return strikes + (alreadyKnown ? 0 : 1);
  }
  board[r][c] = value;
  return strikes;
}

function pushHistory(state: AppState): HistoryEntry[] {
  const entry: HistoryEntry = { board: cloneBoard(state.board), strikes: state.strikes };
  const trimmed =
    state.history.length >= HISTORY_LIMIT ? state.history.slice(1) : state.history.slice();
  trimmed.push(entry);
  return trimmed;
}

function settle(state: AppState, puzzle: Puzzle): AppState {
  if (state.mistakesMode && state.strikes >= state.maxStrikes)
    return { ...state, status: "failed", running: false, stroke: null };
  if (isSolved(state.board, puzzle))
    return { ...state, status: "won", running: false, stroke: null };
  return state;
}

export function reduceStrokeStart(
  state: AppState,
  puzzle: Puzzle,
  r: number,
  c: number,
  want: PaintTarget,
): AppState {
  if (state.status !== "solving") return state;
  const value = toggleTarget(state.board[r][c], want);
  const history = pushHistory(state);
  const board = cloneBoard(state.board);
  const strikes = applyOne(board, r, c, value, puzzle, state.mistakesMode, state.strikes);
  return settle(
    {
      ...state,
      board,
      history,
      strikes,
      stroke: { value },
      paintMode: want === "cross" ? "cross" : "fill",
    },
    puzzle,
  );
}

export function reduceStrokeAdd(state: AppState, puzzle: Puzzle, r: number, c: number): AppState {
  if (state.status !== "solving" || state.stroke === null) return state;
  const value = state.stroke.value;
  const resolved: Mark =
    value === "fill" && state.mistakesMode && !puzzle.solution[r][c] ? "cross" : value;
  if (state.board[r][c] === resolved) return state;
  const board = cloneBoard(state.board);
  const strikes = applyOne(board, r, c, value, puzzle, state.mistakesMode, state.strikes);
  return settle({ ...state, board, strikes }, puzzle);
}

export function reduceEndStroke(state: AppState): AppState {
  return state.stroke === null ? state : { ...state, stroke: null };
}

export function reduceUndo(state: AppState): AppState {
  if (state.history.length === 0 || state.status === "won") return state;
  const history = state.history.slice();
  const last = history.pop();
  if (last === undefined) return state;
  return {
    ...state,
    board: cloneBoard(last.board),
    strikes: last.strikes,
    history,
    status: "solving",
    running: true,
    stroke: null,
  };
}

export function reduceClear(state: AppState): AppState {
  return {
    ...state,
    board: emptyBoard(state.size),
    strikes: 0,
    elapsedMs: 0,
    status: "solving",
    running: true,
    stroke: null,
    history: [],
  };
}

export type PaintTarget = "fill" | "cross";
