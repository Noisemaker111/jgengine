import { describe, expect, test } from "bun:test";

import type { Dir, Tile } from "./board";
import { emptyCells, valueGrid } from "./board";
import { applyMove, createGame, keepPlaying, undoMove, type GameState } from "./game";

function fromGrid(grid: number[][]): Tile[] {
  const tiles: Tile[] = [];
  let id = 1;
  grid.forEach((rowArr, r) =>
    rowArr.forEach((v, c) => {
      if (v > 0) tiles.push({ id: id++, value: v, row: r, col: c, merged: false, isNew: false, anim: 0 });
    }),
  );
  return tiles;
}

function stateFrom(grid: number[][], overrides: Partial<GameState> = {}): GameState {
  const tiles = fromGrid(grid);
  return {
    tiles,
    score: 0,
    spawnCount: 0,
    nextId: tiles.length + 1,
    moveCount: 0,
    won: false,
    keepGoing: false,
    over: false,
    seed: "test",
    best: 0,
    history: null,
    ...overrides,
  };
}

const EMPTY_ROW = [0, 0, 0, 0];

describe("createGame", () => {
  test("starts with exactly two tiles valued 2 or 4", () => {
    const game = createGame("start");
    expect(game.tiles).toHaveLength(2);
    for (const t of game.tiles) expect(t.value === 2 || t.value === 4).toBe(true);
  });

  test("is deterministic for the same seed", () => {
    expect(valueGrid(createGame("abc").tiles)).toEqual(valueGrid(createGame("abc").tiles));
  });
});

describe("applyMove", () => {
  test("merges, scores, and spawns exactly one new tile", () => {
    const next = applyMove(stateFrom([[2, 2, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left");
    expect(next.score).toBe(4);
    expect(next.moveCount).toBe(1);
    expect(next.tiles).toHaveLength(2); // one merged survivor + one spawn
    expect(next.history).not.toBeNull();
    expect(next.best).toBe(4);
  });

  test("spawns into a cell that was empty after the slide", () => {
    const next = applyMove(stateFrom([[2, 2, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left");
    const spawned = next.tiles.find((t) => t.isNew);
    expect(spawned).toBeDefined();
    expect(spawned!.value === 2 || spawned!.value === 4).toBe(true);
  });

  test("an ineffective move returns the same state unchanged", () => {
    const state = stateFrom([[2, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
    expect(applyMove(state, "left")).toBe(state);
  });

  test("does nothing once the game is over", () => {
    const over = stateFrom([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]], { over: true });
    expect(applyMove(over, "left")).toBe(over);
  });

  test("flags a win when a 2048 tile forms", () => {
    const next = applyMove(stateFrom([[1024, 1024, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left");
    expect(next.won).toBe(true);
    expect(next.tiles.some((t) => t.value === 2048)).toBe(true);
  });

  test("detects game over when the final move fills the board with no merges", () => {
    // Down-slide merges column 0's 8+8 → 16, leaving one open cell at (0,0)
    // bordered only by 32 and 8, so whatever spawns (2 or 4) the board is stuck.
    const packed = stateFrom([[32, 8, 2, 4], [64, 2, 4, 2], [8, 4, 2, 4], [8, 2, 4, 2]]);
    const next = applyMove(packed, "down");
    expect(next.score).toBe(16);
    expect(emptyCells(next.tiles)).toHaveLength(0);
    expect(next.over).toBe(true);
  });
});

describe("undoMove", () => {
  test("restores the board and score from before the last move", () => {
    const start = stateFrom([[2, 2, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]);
    const moved = applyMove(start, "left");
    const undone = undoMove(moved);
    expect(valueGrid(undone.tiles)).toEqual(valueGrid(start.tiles));
    expect(undone.score).toBe(0);
    expect(undone.moveCount).toBe(0);
    expect(undone.history).toBeNull();
  });

  test("is a single step only — a second undo is a no-op", () => {
    const moved = applyMove(stateFrom([[2, 2, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW]), "left");
    const once = undoMove(moved);
    expect(undoMove(once)).toBe(once);
  });
});

describe("determinism", () => {
  test("same seed and same moves reproduce the same board and score", () => {
    const moves: Dir[] = ["left", "up", "right", "down", "left", "down"];
    const play = (): GameState => {
      let state = createGame("repro");
      for (const dir of moves) state = applyMove(state, dir);
      return state;
    };
    const a = play();
    const b = play();
    expect(valueGrid(a.tiles)).toEqual(valueGrid(b.tiles));
    expect(a.score).toBe(b.score);
  });
});

describe("keepPlaying", () => {
  test("dismisses the win banner without ending the game", () => {
    const won = stateFrom([[2048, 0, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW], { won: true });
    expect(keepPlaying(won).keepGoing).toBe(true);
    expect(keepPlaying(won).over).toBe(false);
  });
});
