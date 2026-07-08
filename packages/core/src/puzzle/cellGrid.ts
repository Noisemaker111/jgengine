export interface CellGrid<T> {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (T | null)[];
}

export interface CellRun<T> {
  readonly value: T;
  readonly cells: readonly { readonly x: number; readonly y: number }[];
  readonly direction: "row" | "column";
}

export function createCellGrid<T>(width: number, height: number): CellGrid<T> {
  return { width, height, cells: new Array<T | null>(width * height).fill(null) };
}

export function inGridBounds<T>(grid: CellGrid<T>, x: number, y: number): boolean {
  return x >= 0 && x < grid.width && y >= 0 && y < grid.height;
}

export function cellAt<T>(grid: CellGrid<T>, x: number, y: number): T | null {
  if (!inGridBounds(grid, x, y)) return null;
  return grid.cells[y * grid.width + x] ?? null;
}

export function withCell<T>(grid: CellGrid<T>, x: number, y: number, value: T | null): CellGrid<T> {
  if (!inGridBounds(grid, x, y)) return grid;
  const cells = grid.cells.slice();
  cells[y * grid.width + x] = value;
  return { width: grid.width, height: grid.height, cells };
}

export function withCells<T>(
  grid: CellGrid<T>,
  entries: readonly { readonly x: number; readonly y: number; readonly value: T | null }[],
): CellGrid<T> {
  const cells = grid.cells.slice();
  for (const entry of entries) {
    if (inGridBounds(grid, entry.x, entry.y)) cells[entry.y * grid.width + entry.x] = entry.value;
  }
  return { width: grid.width, height: grid.height, cells };
}

export function fullRows<T>(grid: CellGrid<T>): number[] {
  const rows: number[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    let full = true;
    for (let x = 0; x < grid.width; x += 1) {
      if (cellAt(grid, x, y) === null) {
        full = false;
        break;
      }
    }
    if (full) rows.push(y);
  }
  return rows;
}

export function clearRows<T>(grid: CellGrid<T>, rows: readonly number[]): CellGrid<T> {
  const removed = new Set(rows);
  const kept: (T | null)[][] = [];
  for (let y = 0; y < grid.height; y += 1) {
    if (removed.has(y)) continue;
    kept.push(grid.cells.slice(y * grid.width, y * grid.width + grid.width) as (T | null)[]);
  }
  const clearedCount = grid.height - kept.length;
  const cells: (T | null)[] = [];
  for (let i = 0; i < clearedCount; i += 1) cells.push(...new Array<T | null>(grid.width).fill(null));
  for (const row of kept) cells.push(...row);
  return { width: grid.width, height: grid.height, cells };
}

export function collapseColumns<T>(grid: CellGrid<T>): CellGrid<T> {
  const cells = grid.cells.slice() as (T | null)[];
  for (let x = 0; x < grid.width; x += 1) {
    const values: T[] = [];
    for (let y = 0; y < grid.height; y += 1) {
      const value = cellAt(grid, x, y);
      if (value !== null) values.push(value);
    }
    const emptyCount = grid.height - values.length;
    for (let y = 0; y < grid.height; y += 1) {
      cells[y * grid.width + x] = y < emptyCount ? null : values[y - emptyCount]!;
    }
  }
  return { width: grid.width, height: grid.height, cells };
}

function scanRuns<T>(
  length: number,
  cellAtIndex: (index: number) => T | null,
  minLength: number,
  matches: (a: T, b: T) => boolean,
): { value: T; start: number; end: number }[] {
  const runs: { value: T; start: number; end: number }[] = [];
  let start = 0;
  for (let i = 1; i <= length; i += 1) {
    const prev = cellAtIndex(i - 1);
    const cur = i < length ? cellAtIndex(i) : null;
    const continues = prev !== null && cur !== null && matches(prev, cur);
    if (!continues) {
      const runLength = i - start;
      const value = cellAtIndex(start);
      if (runLength >= minLength && value !== null) runs.push({ value, start, end: i });
      start = i;
    }
  }
  return runs;
}

export function findRuns<T>(
  grid: CellGrid<T>,
  minLength: number,
  matches: (a: T, b: T) => boolean = (a, b) => a === b,
): CellRun<T>[] {
  const runs: CellRun<T>[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (const run of scanRuns(grid.width, (x) => cellAt(grid, x, y), minLength, matches)) {
      const cells: { x: number; y: number }[] = [];
      for (let x = run.start; x < run.end; x += 1) cells.push({ x, y });
      runs.push({ value: run.value, cells, direction: "row" });
    }
  }
  for (let x = 0; x < grid.width; x += 1) {
    for (const run of scanRuns(grid.height, (y) => cellAt(grid, x, y), minLength, matches)) {
      const cells: { x: number; y: number }[] = [];
      for (let y = run.start; y < run.end; y += 1) cells.push({ x, y });
      runs.push({ value: run.value, cells, direction: "column" });
    }
  }
  return runs;
}
