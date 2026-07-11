export const GRID = 5;
export const CELLS = GRID * GRID;

export function indexOf(row: number, col: number): number {
  return row * GRID + col;
}

export function rowOf(cell: number): number {
  return Math.floor(cell / GRID);
}

export function colOf(cell: number): number {
  return cell % GRID;
}

function computePressMasks(): number[] {
  const masks: number[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    const row = rowOf(cell);
    const col = colOf(cell);
    let mask = 1 << cell;
    if (row > 0) mask |= 1 << indexOf(row - 1, col);
    if (row < GRID - 1) mask |= 1 << indexOf(row + 1, col);
    if (col > 0) mask |= 1 << indexOf(row, col - 1);
    if (col < GRID - 1) mask |= 1 << indexOf(row, col + 1);
    masks.push(mask);
  }
  return masks;
}

export const PRESS_MASKS: readonly number[] = computePressMasks();

export const SOLVED_BOARD = 0;

export function popcount(value: number): number {
  let bits = value >>> 0;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

export function isLit(board: number, cell: number): boolean {
  return (board & (1 << cell)) !== 0;
}

export function press(board: number, cell: number): number {
  return (board ^ PRESS_MASKS[cell]) >>> 0;
}

export function isSolved(board: number): boolean {
  return board === 0;
}

export function litCount(board: number): number {
  return popcount(board);
}

export function boardFromCells(cells: Iterable<number>): number {
  let board = 0;
  for (const cell of cells) board ^= PRESS_MASKS[cell];
  return board >>> 0;
}

export function litCells(board: number): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) if (isLit(board, cell)) cells.push(cell);
  return cells;
}
