import { describe, expect, test } from "bun:test";

import {
  createFallingGrid,
  gravityIntervalMs,
  type FallingGridCell,
  type LockState,
} from "@jgengine/core/tactics/fallingGrid";

const O_PIECE: readonly FallingGridCell[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

const I_PIECE_HORIZONTAL: readonly FallingGridCell[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];

describe("occupancy", () => {
  test("cellAt/occupied reflect setCell and clearCell", () => {
    const grid = createFallingGrid<string>({ cols: 4, rows: 4 });
    expect(grid.occupied(1, 1)).toBe(false);
    grid.setCell(1, 1, "x");
    expect(grid.occupied(1, 1)).toBe(true);
    expect(grid.cellAt(1, 1)).toBe("x");
    grid.clearCell(1, 1);
    expect(grid.occupied(1, 1)).toBe(false);
    expect(grid.cellAt(1, 1)).toBeNull();
  });

  test("out-of-bounds reads and writes are inert", () => {
    const grid = createFallingGrid<string>({ cols: 3, rows: 3 });
    expect(grid.cellAt(-1, 0)).toBeNull();
    expect(grid.cellAt(0, 3)).toBeNull();
    expect(grid.occupied(5, 5)).toBe(false);
    grid.setCell(-1, 0, "x");
    grid.setCell(0, 5, "x");
    expect(grid.snapshot().cells.every((c) => c === null)).toBe(true);
  });
});

describe("canPlace / place", () => {
  test("places within bounds and blocks overlap", () => {
    const grid = createFallingGrid<string>({ cols: 6, rows: 6 });
    expect(grid.canPlace(O_PIECE, [0, 0])).toBe(true);
    expect(grid.place(O_PIECE, [0, 0], "O")).toBe(true);
    expect(grid.cellAt(0, 0)).toBe("O");
    expect(grid.cellAt(1, 1)).toBe("O");
    expect(grid.canPlace(O_PIECE, [0, 0])).toBe(false);
    expect(grid.place(O_PIECE, [0, 0], "O")).toBe(false);
  });

  test("rejects placement past the right/left/bottom edges", () => {
    const grid = createFallingGrid<string>({ cols: 4, rows: 4 });
    expect(grid.canPlace(I_PIECE_HORIZONTAL, [1, 0])).toBe(false);
    expect(grid.canPlace(I_PIECE_HORIZONTAL, [0, 0])).toBe(true);
    expect(grid.canPlace(O_PIECE, [-1, 0])).toBe(false);
    expect(grid.canPlace(O_PIECE, [0, 3])).toBe(false);
    expect(grid.canPlace(O_PIECE, [0, 2])).toBe(true);
  });

  test("allows a footprint spawning above the grid, ignoring only the off-grid rows", () => {
    const grid = createFallingGrid<string>({ cols: 4, rows: 4 });
    expect(grid.canPlace(O_PIECE, [0, -1])).toBe(true);
    expect(grid.place(O_PIECE, [0, -1], "O")).toBe(true);
    expect(grid.cellAt(0, 0)).toBe("O");
    expect(grid.cellAt(1, 0)).toBe("O");
    expect(grid.cellAt(0, -1)).toBeNull();
  });

  test("a column still occupied above the grid blocks placement there", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2 });
    grid.setCell(0, 0, "x");
    expect(grid.canPlace([[0, 0]], [0, -1])).toBe(true);
    expect(grid.canPlace([[0, 0]], [0, 0])).toBe(false);
  });
});

describe("fullRows / clearRows", () => {
  function fillRow(grid: ReturnType<typeof createFallingGrid<string>>, row: number, cols: number): void {
    for (let col = 0; col < cols; col += 1) grid.setCell(col, row, "x");
  }

  test("fullRows finds only completely occupied rows", () => {
    const grid = createFallingGrid<string>({ cols: 3, rows: 3 });
    fillRow(grid, 1, 3);
    grid.setCell(0, 2, "x");
    expect(grid.fullRows()).toEqual([1]);
  });

  test("clearing a single row shifts everything above it down by one", () => {
    const grid = createFallingGrid<string>({ cols: 3, rows: 4 });
    grid.setCell(0, 0, "top");
    fillRow(grid, 1, 3);
    grid.setCell(1, 2, "mid");
    expect(grid.clearRows(grid.fullRows())).toBe(1);
    expect(grid.cellAt(0, 1)).toBe("top");
    expect(grid.cellAt(1, 2)).toBe("mid");
    expect(grid.cellAt(0, 0)).toBeNull();
    expect(grid.fullRows()).toEqual([]);
  });

  test("clearing multiple non-adjacent full rows collapses correctly", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 5 });
    grid.setCell(0, 0, "keep0");
    fillRow(grid, 1, 2);
    grid.setCell(0, 2, "keep2");
    fillRow(grid, 3, 2);
    grid.setCell(0, 4, "keep4");

    const full = grid.fullRows();
    expect(full).toEqual([1, 3]);
    expect(grid.clearRows(full)).toBe(2);

    expect(grid.cellAt(0, 2)).toBe("keep0");
    expect(grid.cellAt(0, 3)).toBe("keep2");
    expect(grid.cellAt(0, 4)).toBe("keep4");
    expect(grid.cellAt(0, 0)).toBeNull();
    expect(grid.cellAt(0, 1)).toBeNull();
  });

  test("clearing zero rows is a no-op", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2 });
    grid.setCell(0, 0, "x");
    expect(grid.clearRows([])).toBe(0);
    expect(grid.cellAt(0, 0)).toBe("x");
  });
});

describe("settle", () => {
  test("floating cells fall to the bottom of their column, preserving order", () => {
    const grid = createFallingGrid<string>({ cols: 1, rows: 5 });
    grid.setCell(0, 0, "a");
    grid.setCell(0, 2, "b");
    expect(grid.settle()).toBe(2);
    expect(grid.cellAt(0, 3)).toBe("a");
    expect(grid.cellAt(0, 4)).toBe("b");
    expect(grid.cellAt(0, 0)).toBeNull();
    expect(grid.cellAt(0, 2)).toBeNull();
  });

  test("already-settled cells report zero moves", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 3 });
    grid.setCell(0, 2, "a");
    grid.setCell(1, 1, "b");
    grid.setCell(1, 2, "c");
    expect(grid.settle()).toBe(0);
  });

  test("multi-column cascade settles each column independently", () => {
    const grid = createFallingGrid<string>({ cols: 3, rows: 3 });
    grid.setCell(0, 0, "a");
    grid.setCell(2, 0, "b");
    grid.setCell(2, 1, "c");
    const moved = grid.settle();
    expect(moved).toBe(3);
    expect(grid.cellAt(0, 2)).toBe("a");
    expect(grid.cellAt(2, 1)).toBe("b");
    expect(grid.cellAt(2, 2)).toBe("c");
  });
});

describe("lock delay", () => {
  test("starts timing once grounded and expires after lockDelayMs", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2, lockDelayMs: 500 });
    let state: LockState | null = null;
    state = grid.advanceLock(state, true, 300);
    expect(grid.lockExpired(state)).toBe(false);
    state = grid.advanceLock(state, true, 250);
    expect(state?.elapsedMs).toBe(550);
    expect(grid.lockExpired(state)).toBe(true);
  });

  test("going airborne resets the timer", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2, lockDelayMs: 500 });
    let state: LockState | null = grid.advanceLock(null, true, 400);
    state = grid.advanceLock(state, false, 16);
    expect(state).toBeNull();
    state = grid.advanceLock(state, true, 400);
    expect(state?.elapsedMs).toBe(400);
    expect(grid.lockExpired(state)).toBe(false);
  });

  test("defaults lockDelayMs to 500 when unset", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2 });
    const state = grid.advanceLock(null, true, 499);
    expect(grid.lockExpired(state)).toBe(false);
    expect(grid.lockExpired(grid.advanceLock(state, true, 1))).toBe(true);
  });
});

describe("gravityIntervalMs", () => {
  test("decreases monotonically as level increases", () => {
    const intervals = [0, 1, 2, 5, 10].map((level) => gravityIntervalMs(level));
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]!).toBeLessThanOrEqual(intervals[i - 1]!);
    }
  });

  test("never drops below the configured floor", () => {
    expect(gravityIntervalMs(0)).toBe(800);
    expect(gravityIntervalMs(50)).toBe(50);
    expect(gravityIntervalMs(1000, { minMs: 20 })).toBe(20);
  });

  test("honors custom base/perLevel/min", () => {
    expect(gravityIntervalMs(2, { baseMs: 1000, perLevel: 100, minMs: 10 })).toBe(800);
    expect(gravityIntervalMs(20, { baseMs: 1000, perLevel: 100, minMs: 10 })).toBe(10);
  });
});

describe("snapshot / reset", () => {
  test("snapshot captures current occupancy without aliasing internal state", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2 });
    grid.setCell(0, 0, "a");
    const snap = grid.snapshot();
    expect(snap.cols).toBe(2);
    expect(snap.rows).toBe(2);
    expect(snap.cells[0]).toBe("a");
    grid.setCell(1, 1, "b");
    expect(snap.cells[3]).toBeNull();
  });

  test("reset clears every cell", () => {
    const grid = createFallingGrid<string>({ cols: 2, rows: 2 });
    grid.setCell(0, 0, "a");
    grid.setCell(1, 1, "b");
    grid.reset();
    expect(grid.snapshot().cells.every((c) => c === null)).toBe(true);
    expect(grid.fullRows()).toEqual([]);
  });
});
