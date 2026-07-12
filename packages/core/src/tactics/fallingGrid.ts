export type FallingGridCell = readonly [number, number];

export interface FallingGridConfig {
  cols: number;
  rows: number;
  /** Milliseconds a grounded piece may sit before `lockExpired` fires. Defaults to 500. */
  lockDelayMs?: number;
}

/** Elapsed grounded time for the lock-delay state machine. `null` means airborne / not timing. */
export interface LockState {
  elapsedMs: number;
}

export interface FallingGridSnapshot<TCell> {
  cols: number;
  rows: number;
  cells: readonly (TCell | null)[];
}

export interface FallingGrid<TCell> {
  readonly cols: number;
  readonly rows: number;
  occupied(col: number, row: number): boolean;
  cellAt(col: number, row: number): TCell | null;
  setCell(col: number, row: number, value: TCell): void;
  clearCell(col: number, row: number): void;
  /** Bounds + collision check for a footprint (`cells`, relative to `offset`). Rows above the grid (`row < 0`) are allowed through, mirroring a piece spawning above the visible board; only columns are bounds-checked there. */
  canPlace(cells: readonly FallingGridCell[], offset: FallingGridCell): boolean;
  /** Writes `value` into every in-bounds cell of the footprint if `canPlace` allows it. Cells above the grid are silently skipped. Returns whether the placement happened. */
  place(cells: readonly FallingGridCell[], offset: FallingGridCell, value: TCell): boolean;
  /** Row indices that are fully occupied, in ascending order. */
  fullRows(): readonly number[];
  /** Removes the given rows and shifts every row above them down, backfilling the top with empty rows. Returns the number of rows cleared. */
  clearRows(rows: readonly number[]): number;
  /** Column-gravity collapse: every occupied cell in each column falls to the lowest free row below it, preserving relative order. Returns the number of cells that moved. */
  settle(): number;
  /** Advances (or starts) a lock-delay timer while `grounded`, and clears it the instant the piece is airborne. */
  advanceLock(state: LockState | null, grounded: boolean, dtMs: number): LockState | null;
  /** Whether a lock-delay timer has run out `lockDelayMs`. */
  lockExpired(state: LockState | null): boolean;
  snapshot(): FallingGridSnapshot<TCell>;
  /** Clears every cell back to empty. */
  reset(): void;
}

export interface GravityIntervalConfig {
  /** Interval at level 0, in milliseconds. Defaults to 800. */
  baseMs?: number;
  /** Milliseconds shaved off per level. Defaults to 70. */
  perLevel?: number;
  /** Floor the interval never drops below, in milliseconds. Defaults to 50. */
  minMs?: number;
}

/**
 * Gravity tick interval for a given level: linear speed-up with a floor, generalizing
 * a falling-block `gravityInterval` (`max(0.05, 0.8 - level * 0.07)` seconds) to milliseconds
 * with configurable base/step/floor.
 */
export function gravityIntervalMs(level: number, config: GravityIntervalConfig = {}): number {
  const baseMs = config.baseMs ?? 800;
  const perLevel = config.perLevel ?? 70;
  const minMs = config.minMs ?? 50;
  return Math.max(minMs, baseMs - level * perLevel);
}

/**
 * A game-agnostic cell grid for gravity-driven falling-block mechanics: bounded occupancy,
 * footprint placement/collision, line-clear collapse, column-gravity settle (for match-3/sand
 * style cascades), and a pure lock-delay helper. Extracted from falling-block tetris
 * logic so any falling-block game can adopt it instead of reimplementing the grid.
 */
export function createFallingGrid<TCell>(config: FallingGridConfig): FallingGrid<TCell> {
  const cols = config.cols;
  const rows = config.rows;
  const lockDelayMs = config.lockDelayMs ?? 500;

  if (cols <= 0 || rows <= 0) throw new Error("falling grid needs positive dimensions");

  let cells: (TCell | null)[] = new Array<TCell | null>(cols * rows).fill(null);

  function index(col: number, row: number): number {
    return row * cols + col;
  }

  function inBounds(col: number, row: number): boolean {
    return col >= 0 && col < cols && row >= 0 && row < rows;
  }

  function cellAt(col: number, row: number): TCell | null {
    if (!inBounds(col, row)) return null;
    return cells[index(col, row)] ?? null;
  }

  function occupied(col: number, row: number): boolean {
    return cellAt(col, row) !== null;
  }

  function setCell(col: number, row: number, value: TCell): void {
    if (!inBounds(col, row)) return;
    cells[index(col, row)] = value;
  }

  function clearCell(col: number, row: number): void {
    if (!inBounds(col, row)) return;
    cells[index(col, row)] = null;
  }

  function canPlace(footprint: readonly FallingGridCell[], offset: FallingGridCell): boolean {
    for (const [dc, dr] of footprint) {
      const col = offset[0] + dc;
      const row = offset[1] + dr;
      if (col < 0 || col >= cols || row >= rows) return false;
      if (row >= 0 && occupied(col, row)) return false;
    }
    return true;
  }

  function place(footprint: readonly FallingGridCell[], offset: FallingGridCell, value: TCell): boolean {
    if (!canPlace(footprint, offset)) return false;
    for (const [dc, dr] of footprint) {
      const col = offset[0] + dc;
      const row = offset[1] + dr;
      if (row >= 0) setCell(col, row, value);
    }
    return true;
  }

  function fullRows(): readonly number[] {
    const full: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      let rowFull = true;
      for (let col = 0; col < cols; col += 1) {
        if (!occupied(col, row)) {
          rowFull = false;
          break;
        }
      }
      if (rowFull) full.push(row);
    }
    return full;
  }

  function clearRows(rowsToClear: readonly number[]): number {
    const toClear = new Set(rowsToClear);
    if (toClear.size === 0) return 0;
    const kept: (TCell | null)[][] = [];
    for (let row = 0; row < rows; row += 1) {
      if (toClear.has(row)) continue;
      kept.push(cells.slice(index(0, row), index(0, row) + cols));
    }
    const cleared = rows - kept.length;
    const next: (TCell | null)[] = [];
    for (let i = 0; i < cleared; i += 1) next.push(...new Array<TCell | null>(cols).fill(null));
    for (const row of kept) next.push(...row);
    cells = next;
    return cleared;
  }

  function settle(): number {
    let moved = 0;
    for (let col = 0; col < cols; col += 1) {
      const values: { row: number; value: TCell }[] = [];
      for (let row = 0; row < rows; row += 1) {
        const value = cellAt(col, row);
        if (value !== null) values.push({ row, value });
      }
      for (let row = 0; row < rows; row += 1) clearCell(col, row);
      const count = values.length;
      for (let i = 0; i < count; i += 1) {
        const newRow = rows - count + i;
        const { row: oldRow, value } = values[i]!;
        setCell(col, newRow, value);
        if (oldRow !== newRow) moved += 1;
      }
    }
    return moved;
  }

  function advanceLock(state: LockState | null, grounded: boolean, dtMs: number): LockState | null {
    if (!grounded) return null;
    return { elapsedMs: (state?.elapsedMs ?? 0) + dtMs };
  }

  function lockExpired(state: LockState | null): boolean {
    return state !== null && state.elapsedMs >= lockDelayMs;
  }

  function snapshot(): FallingGridSnapshot<TCell> {
    return { cols, rows, cells: cells.slice() };
  }

  function reset(): void {
    cells = new Array<TCell | null>(cols * rows).fill(null);
  }

  return {
    cols,
    rows,
    occupied,
    cellAt,
    setCell,
    clearCell,
    canPlace,
    place,
    fullRows,
    clearRows,
    settle,
    advanceLock,
    lockExpired,
    snapshot,
    reset,
  };
}
