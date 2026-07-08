import { describe, expect, test } from "bun:test";

import {
  cellAt,
  clearRows,
  collapseColumns,
  createCellGrid,
  findRuns,
  fullRows,
  inGridBounds,
  withCell,
  withCells,
  type CellGrid,
} from "./cellGrid";

function fillRow<T>(grid: CellGrid<T>, y: number, value: T, gap = -1): CellGrid<T> {
  const entries = [];
  for (let x = 0; x < grid.width; x += 1) entries.push({ x, y, value: x === gap ? null : value });
  return withCells(grid, entries);
}

describe("createCellGrid", () => {
  test("starts empty with the given dimensions", () => {
    const grid = createCellGrid<string>(4, 3);
    expect(grid.width).toBe(4);
    expect(grid.height).toBe(3);
    expect(grid.cells.length).toBe(12);
    expect(grid.cells.every((cell) => cell === null)).toBe(true);
  });

  test("inGridBounds rejects out-of-range coordinates", () => {
    const grid = createCellGrid<string>(4, 3);
    expect(inGridBounds(grid, 0, 0)).toBe(true);
    expect(inGridBounds(grid, 3, 2)).toBe(true);
    expect(inGridBounds(grid, -1, 0)).toBe(false);
    expect(inGridBounds(grid, 4, 0)).toBe(false);
    expect(inGridBounds(grid, 0, 3)).toBe(false);
  });

  test("cellAt returns null outside the grid", () => {
    const grid = createCellGrid<string>(2, 2);
    expect(cellAt(grid, 5, 5)).toBeNull();
  });
});

describe("withCell / withCells", () => {
  test("withCell writes a single cell and ignores out-of-bounds writes", () => {
    const grid = createCellGrid<string>(2, 2);
    const placed = withCell(grid, 1, 1, "A");
    expect(cellAt(placed, 1, 1)).toBe("A");
    expect(cellAt(placed, 0, 0)).toBeNull();
    expect(withCell(grid, 9, 9, "A")).toBe(grid);
  });

  test("withCells writes several cells at once", () => {
    const grid = createCellGrid<string>(2, 2);
    const placed = withCells(grid, [
      { x: 0, y: 0, value: "A" },
      { x: 1, y: 1, value: "B" },
    ]);
    expect(cellAt(placed, 0, 0)).toBe("A");
    expect(cellAt(placed, 1, 1)).toBe("B");
  });
});

describe("row clears", () => {
  test("fullRows finds only rows with no empty cell", () => {
    const grid = createCellGrid<string>(4, 3);
    const withFull = fillRow(grid, 2, "X");
    expect(fullRows(withFull)).toEqual([2]);
  });

  test("a row with a gap is not full", () => {
    const grid = createCellGrid<string>(4, 3);
    const withGap = fillRow(grid, 2, "X", 1);
    expect(fullRows(withGap)).toEqual([]);
  });

  test("clearRows removes the given rows and drops the rest down, refilling the top", () => {
    const grid = createCellGrid<string>(4, 3);
    let stacked = fillRow(grid, 1, "M");
    stacked = fillRow(stacked, 2, "X");
    const cleared = clearRows(stacked, [2]);
    for (let x = 0; x < 4; x += 1) expect(cellAt(cleared, x, 0)).toBeNull();
    for (let x = 0; x < 4; x += 1) expect(cellAt(cleared, x, 1)).toBeNull();
    for (let x = 0; x < 4; x += 1) expect(cellAt(cleared, x, 2)).toBe("M");
  });

  test("clearing multiple rows preserves relative order of survivors", () => {
    const grid = createCellGrid<string>(2, 4);
    let stacked = fillRow(grid, 0, "A");
    stacked = fillRow(stacked, 1, "B");
    stacked = fillRow(stacked, 2, "C");
    stacked = fillRow(stacked, 3, "D");
    const cleared = clearRows(stacked, [1, 3]);
    expect(cellAt(cleared, 0, 0)).toBeNull();
    expect(cellAt(cleared, 0, 1)).toBeNull();
    expect(cellAt(cleared, 0, 2)).toBe("A");
    expect(cellAt(cleared, 0, 3)).toBe("C");
  });
});

describe("collapseColumns", () => {
  test("non-null cells fall to the bottom of their column, preserving order", () => {
    const grid = createCellGrid<string>(1, 4);
    const withGaps = withCells(grid, [
      { x: 0, y: 0, value: "A" },
      { x: 0, y: 2, value: "B" },
    ]);
    const collapsed = collapseColumns(withGaps);
    expect(cellAt(collapsed, 0, 0)).toBeNull();
    expect(cellAt(collapsed, 0, 1)).toBeNull();
    expect(cellAt(collapsed, 0, 2)).toBe("A");
    expect(cellAt(collapsed, 0, 3)).toBe("B");
  });

  test("a fully occupied column is unchanged", () => {
    const grid = createCellGrid<string>(1, 2);
    const full = withCells(grid, [
      { x: 0, y: 0, value: "A" },
      { x: 0, y: 1, value: "B" },
    ]);
    const collapsed = collapseColumns(full);
    expect(cellAt(collapsed, 0, 0)).toBe("A");
    expect(cellAt(collapsed, 0, 1)).toBe("B");
  });
});

describe("findRuns", () => {
  test("finds a horizontal run at or above the minimum length", () => {
    const grid = createCellGrid<string>(5, 1);
    const board = withCells(grid, [
      { x: 0, y: 0, value: "R" },
      { x: 1, y: 0, value: "R" },
      { x: 2, y: 0, value: "R" },
      { x: 3, y: 0, value: "G" },
    ]);
    const runs = findRuns(board, 3);
    expect(runs.length).toBe(1);
    expect(runs[0]?.direction).toBe("row");
    expect(runs[0]?.value).toBe("R");
    expect(runs[0]?.cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  test("finds a vertical run", () => {
    const grid = createCellGrid<string>(1, 5);
    const board = withCells(grid, [
      { x: 0, y: 0, value: "B" },
      { x: 0, y: 1, value: "B" },
      { x: 0, y: 2, value: "B" },
    ]);
    const runs = findRuns(board, 3);
    expect(runs.length).toBe(1);
    expect(runs[0]?.direction).toBe("column");
  });

  test("runs shorter than the minimum are ignored", () => {
    const grid = createCellGrid<string>(3, 1);
    const board = withCells(grid, [
      { x: 0, y: 0, value: "R" },
      { x: 1, y: 0, value: "R" },
    ]);
    expect(findRuns(board, 3)).toEqual([]);
  });

  test("a custom matcher groups cells that are not strictly equal", () => {
    const grid = createCellGrid<number>(3, 1);
    const board = withCells(grid, [
      { x: 0, y: 0, value: 1 },
      { x: 1, y: 0, value: 3 },
      { x: 2, y: 0, value: 5 },
    ]);
    const runs = findRuns(board, 3, (a, b) => a % 2 === b % 2);
    expect(runs.length).toBe(1);
    expect(runs[0]?.value).toBe(1);
  });
});
